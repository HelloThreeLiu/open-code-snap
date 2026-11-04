# Open Code Snap 可行性分析

> 调研日期：2026-11-04
> 目标：开发一款仿 CodeSnap 的开源代码截图工具，支持自定义功能

---

## 一、结论（TL;DR）

**完全可行，技术难度中低，无技术黑盒。**

- 核心技术链路（选区获取 → 语法高亮 → DOM 渲染 → 图片导出）已被 4 个开源项目完整验证过，最老的已稳定运行 7 年以上；
- 没有任何需要"攻坚"的难题，全部是成熟的工程组合；
- 真正的工作量在**产品打磨与差异化**，而非技术攻关；
- 预估工作量（业余时间口径）：MVP 1~2 周，功能完整版 4~6 周；
- 推荐形态：**VS Code 扩展先行**，渲染核心做成平台无关包，后续可扩展出 Web 版 / 桌面版。

---

## 二、竞品格局（2026-11 时点）

| 项目 | 形态 | 协议 | 状态 | 启发点 |
|---|---|---|---|---|
| CodeSnap (adpyke.codesnap) | VS Code 扩展 | **闭源**（市场现行 2.x 不再公开源码） | 活跃 | 功能标杆：水印、剪贴板复制、行号、窗口样式 |
| CodeSnap (kufii/CodeSnap) | VS Code 扩展 | MIT（package.json 声明，源码停在 1.3.4） | 停更 | **可合法参考的 CodeSnap 早期源码**，603★ |
| Polacode (octref) | VS Code 扩展 | MIT | 实质停更（6.8k★，76 个 open issue） | 核心技巧的鼻祖 |
| polacode (jeff-hykin fork) | VS Code 扩展 | MIT | 低活跃（21★，12 commits） | 少量 bug 修复 |
| VSCodeSnap (luisllamas) | VS Code 扩展 | **GPL-3.0** | 维护中（24★） | 功能最全的开源实现（渐变背景、行高亮 diff、多窗口样式） |
| Carbon (carbon.now.sh) | Web | MIT | 活跃（36.1k★） | Web 形态标杆：主题/字体/分享链接/embed |
| ray.so / codeimg / snappify | Web | 闭源 | 活跃 | 商业化参考（snappify 已做付费） |

**市场空隙**：CodeSnap 市场版闭源且 GitHub 源码停在 2020 年的 1.3.4；Polacode 停更；VSCodeSnap 功能全但是 GPL 且知名度低。存在一个「**活跃维护 + MIT + 现代技术栈 + 可深度自定义**」的空位，且这个品类在 marketplace 有经过验证的稳定下载量。

---

## 三、核心技术拆解

代码截图工具本质是四段流水线，每段都有已验证方案：

### 3.1 选区与语法高亮

**路线 A —— 借用 VS Code 自身高亮（CodeSnap/Polacode 的做法，已读源码验证）**

```
用户选区变化
  → vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction')
  → VS Code 把选区复制为带内联样式的 HTML（颜色即用户当前主题色）
  → webview 监听 paste 事件，读取 clipboardData.getData('text/html')
  → 注入 DOM 重组（加行号、裁剪缩进、套窗口框）
```

- 优点：与编辑器 **100% 一致**的高亮（含用户自定义主题、语义着色），零高亮引擎成本
- 缺点：
  - **污染用户剪贴板**（每次选区变化都执行 copy，是 Polacode 被抱怨最多的点）
  - 依赖 VS Code 内部命令（无 API 保证，但 VS Code 自己也在用，7 年未变）
  - `document.execCommand('paste')` 已标记弃用；vscode.dev（Web 版）/远程 SSH 场景下不可靠

**路线 B —— 自带高亮引擎（Carbon 的做法）**：CodeMirror + highlight.js。可控但与编辑器配色不一致，Carbon 为此自维护一套主题。

**路线 C（推荐）—— Shiki**：从 VS Code 中抽出的同源 TextMate 高亮引擎（VS Code 官网文档、VitePress、Astro 都在用）：

- 用的是和 VS Code 完全相同的 grammar 和主题 JSON，可加载用户当前主题，一致性 ≈ 99%；
- 纯前端，无剪贴板副作用，远程/Web 环境通吃；
- 天然支持「任意主题切换」这个 Carbon 式卖点（内置上百个主题）。

**推荐组合：Shiki 为主，路线 A 做「精确模式」补充**（比如语义着色极端一致的场景）。

### 3.2 图片导出

| 方案 | 原理 | 使用者 | 优缺点 |
|---|---|---|---|
| dom-to-image 系（dom-to-image-more / modern-screenshot / html-to-image） | SVG foreignObject → img → canvas | Polacode、CodeSnap、ray.so | 零原生依赖、简单；坑：字体内嵌、性能、部分渐变 |
| html2canvas | 用 JS 重绘 CSS | — | 不依赖 foreignObject，但对现代 CSS 支持不全 |
| **自绘 Canvas / 直接生成 SVG（token → 自排版）** | 拿着高亮 token 自己布局、画字 | **Silicon（Rust）**、部分新工具 | 完全可控；**毫秒级、内存平稳**、天然矢量 SVG 导出（差异化点）；需要自写排版层 |
| 服务端 Puppeteer 截图 | 无头浏览器 | Carbon（下载走服务端） | 保真度最高；需要服务器，扩展形态用不上 |

**推荐：自绘 Canvas/SVG 为主线（Silicon 已验证此架构，详见 3.4），dom-to-image-more 作为 MVP 快速验证的过渡方案。**

### 3.3 已知坑清单（源码 + issues 提炼，提前规避）

1. **剪贴板污染** → 若用路线 A，读完后把原剪贴板内容写回；
2. **字体回退**（foreignObject 里本地字体名失效）→ 把字体文件转 data URI 内嵌，CSP 加 `font-src data:`；
3. **HiDPI 模糊** → 导出时 `scale: 2/3`（CodeSnap 用 2x）；
4. **连字**（Fira Code ligatures）→ 需要把 `font-variant-ligatures` 透传，且字体真内嵌；
5. **长代码性能**（dom-to-image 序列化慢）→ 大于 N 行提示/分片，或切 SVG 路线；
6. **缩进裁剪**（CodeSnap 有 bug）→ 保留其正确思路：计算各行最小缩进再统一去除；
7. **透明背景** → 导出时把容器背景置 transparent 再还原（CodeSnap 的处理可参考）。

### 3.4 Silicon（Rust CLI）的借鉴价值（响应速度 / 资源占用）

> [Aloxaf/silicon](https://github.com/Aloxaf/silicon)：MIT，v0.5.2，最后提交 2024-09（低维护但稳定）。已 clone 并分析依赖与源码结构。

**它是什么**：离线 CLI，`silicon main.rs -o out.png` 直接产出图片。README 明确对标 Carbon 的性能痛点："Silicon can render your source code **on the fly** while carbon-now-cli **takes several seconds** on it."

**为什么它快、省**（依赖栈已核实，Cargo.toml）：

| 环节 | Silicon 的选择 | 对应到我们（JS） |
|---|---|---|
| 高亮 | syntect（TextMate 语法，与 VS Code 同族） | **Shiki**（就是 VS Code 的 grammar + oniguruma WASM） |
| 文字排版 | font-kit + harfbuzz（连字支持） | 浏览器 Canvas/SVG 自带整形引擎（连字原生支持，**无需带 harfbuzz**） |
| 栅格化 | imageproc + pathfinder（直接画像素）+ rayon 并行 | Canvas 2D / OffscreenCanvas |
| **冷启动** | **编译期预打包 syntaxes.bin / themes.bin**（从 bat 同步的语法集），运行时零解析 | 打包期预置 + 按需懒加载 grammar/主题 |
| 分发 | core（lib）与 CLI（bin）分离 | 印证「渲染核心平台无关」的架构决定 |

**三种架构的资源画像**（定性对比，M0 阶段补实测数据）：

| 架构 | 代表 | 导出耗时（长片段） | 内存特征 |
|---|---|---|---|
| DOM → dom-to-image | polacode/CodeSnap | 百毫秒~秒级（序列化巨型 SVG 字符串） | 峰值高（序列化字符串 + img 解码） |
| 服务端无头浏览器 | Carbon 下载 | 秒级 + 网络往返 | 服务器常驻 Chromium |
| token → 自绘 | **Silicon** / 我们的目标 | **毫秒级** | 平稳，无峰值 |

**借鉴结论**：把 Silicon 的**架构**移植过来（"Shiki 拿 token → 自己排版 → Canvas/SVG 输出"），而不是移植它的**代码**：

- preview 仍用 DOM（交互、选中、遮罩编辑方便）；
- 导出走自绘：与 preview 共享同一份布局数据 → WYSIWYG 一致，同时消灭 dom-to-image 的全部已知坑（字体内嵌、性能、渐变），还白送矢量 SVG 导出；
- 顺带学它的产品功能：双色渐变背景、参数化阴影（shadow-blur-radius）、tab-width、`--no-window-controls`、直接复制到剪贴板。

**不建议的方向**：把 silicon 本身编译成 WASM 塞进扩展——harfbuzz-sys 在 Windows 构建有坑（README 自己建议禁用）、字体走系统 fontconfig 在 webview 环境不适配、浏览器已有高质量排版引擎，收益为负。

**远期可能**：CLI 形态（管道/脚本场景）可复用同一套渲染核心，或直接包装 silicon。

---

## 四、产品形态选择

| 形态 | 优势 | 劣势 | 建议 |
|---|---|---|---|
| **VS Code 扩展** | 贴近 CodeSnap 存量用户；marketplace 分发零成本；无服务器 | 能力受 webview 约束 | ✅ **首发** |
| 纯 Web（Carbon 赛道） | 受众广、易分享 | 红海，Carbon 36k★ + ray.so/snappify 夹击 | 二期 |
| Tauri/Electron 桌面 | 独立入口、可加系统截图源 | 分发/更新成本高 | 观望 |

**架构上的关键决定**：把「高亮 + 排版 + 导出」做成**平台无关的渲染核心包**（输入：code + language + theme + 配置；输出：DOM/SVG/PNG）。扩展只是它的一个壳。这样后续 Web 版、桌面版、甚至 CLI 都能复用，避免像 polacode 那样逻辑耦合在 webview 里无法迁移。

---

## 五、差异化功能方向（"自定义"可以做什么）

1. **水印/署名**（自定义文字、logo、位置——CodeSnap 闭源版有但不可定制）
2. **行高亮 diff**（+/- 行染色，VSCodeSnap 已验证此需求）
3. **脱敏遮罩**（选中 token 一键马赛克/替换，截图分享前脱敏——目前无人做，刚需）
4. **矢量 SVG 导出**（无限缩放，文档/PPT 场景）
5. 渐变/网格/图片背景，多窗口样式（macOS/Windows/Ghost）
6. **配置预设与分享**（导出/导入 JSON 配置，团队统一风格）
7. 从剪贴板/文件/GitHub gist 多源导入
8. 局部字号、行距、边距微调（超越 CodeSnap 的固定档位）

---

## 六、里程碑建议

| 阶段 | 内容 | 预估 |
|---|---|---|
| **M0 技术验证** | 扩展骨架 + Shiki 渲染 + 两种导出路径（dom-to-image vs Canvas 自绘）各出一张 PNG，**顺带实测性能对比数据** | 3~4 天 |
| **M1 MVP** | 选区同步、行号、窗口样式、背景/阴影/圆角、保存+复制剪贴板 | 1 周 |
| **M2 Beta** | 主题切换、字体设置、缩放导出、透明背景、水印、配置持久化 | 2 周 |
| **M3 1.0** | 脱敏遮罩、SVG 导出、预设分享、发布 marketplace + GitHub Actions CI | 2 周 |

---

## 七、风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| 依赖 VS Code 内部命令（若走路线 A） | 低 | 主路线用 Shiki，内部命令仅做增强；锁定 VS Code 最低版本测试 |
| webview 环境差异（远程/SSH/Web） | 中 | Shiki 路线天然规避；CI 加 remote 测试 |
| dom-to-image 边缘 bug | 中 | 抽象导出层，dom-to-image-more 与 SVG 双实现可切换 |
| **GPL 传染**（VSCodeSnap 是 GPL-3.0） | 中 | ⚠️ **不复制其代码**；polacode 与 kufii/CodeSnap 均 MIT，思路可借鉴、代码按 MIT 仓库参考或白盒重写 |
| 商标/命名 | 低 | 避免直接叫 "CodeSnap"（open-code-snap 独立命名 OK），README 声明非官方 |

---

## 八、推荐技术栈

- **语言**：TypeScript（全链路）
- **构建**：Vite（扩展端 esbuild 打包也行）+ `@vscode/vsce` 发布
- **高亮**：Shiki（主）+ VS Code 剪贴板 HTML（精确模式，可选）
- **导出**：MVP 用 dom-to-image-more 快速跑通；正式版自绘 Canvas/SVG（Silicon 架构的 JS 实现）
- **UI**：webview 内原生 TS（或 Preact，体量小）——不需要重型框架
- **测试**：Vite 单测（渲染核心）+ `@vscode/test-electron`（扩展集成）
- **CI/CD**：GitHub Actions（lint + test + 自动发版到 marketplace）
- **协议**：MIT

---

## 附：本报告的事实来源

- octref/polacode（MIT，6.8k★）与 kufii/CodeSnap（MIT 声明，603★，源码 1.3.4）：已 clone 并通读核心源码 `src/extension.js`、`webview/src/*.js`
- Aloxaf/silicon（MIT，Rust CLI，syntect + font-kit/harfbuzz + imageproc 直接栅格化）：已 clone 并分析 Cargo.toml 与 lib 结构
- VSCodeSnap（GPL-3.0，24★）、Carbon（MIT，36.1k★，Next.js + CodeMirror + highlight.js + 服务端 Puppeteer）：GitHub 仓库页面与 package.json
- CodeSnap 市场页（adpyke.codesnap）功能清单
