# Open Code Snap 路线图

> 预估为业余时间口径；每阶段以下方验收清单全绿为完成标准。

## M0 — 技术验证 ✅ 已完成（2026-11-04）

> 全链路跑通并经真机验收。过程中的关键修复：webview CSP 放行 WASM（Shiki oniguruma 引擎依赖）、面板焦点竞争导致首次打开空白（`preserveFocus` + 命令时快照 + `sourceEditor` 跟踪）。已知优化项：webview bundle 9.4MB（Shiki 全量语言内联，M2 按需加载瘦身）。

范围：扩展骨架、面板、选区同步、Shiki 高亮、DOM 预览、双路径导出 PNG。

验收清单：
- [x] 打开扩展开发宿主（F5 / `code --extensionDevelopmentPath`），选中代码右键 `Open Code Snap` 出面板并实时跟随选区；首次打开即有内容
- [x] 仅切换选区时剪贴板内容不被修改（复制文字 → 切换选区 → 粘贴验证原内容）✅ 2026-11-04 真机验证
- [x] 同一段代码分别用 Canvas / dom-to-image 导出，均正常（双引擎计时产出两种 dataURL；保存对话框/剪贴板写入的交互细节在 M1 初复核）
- [x] 面板显示两种引擎导出耗时（数据已登记下方实测表）
- [x] `npm run build` 零错误，`npm test` 通过（19 项）

## M1 — MVP（1~2 周）✅ 已完成（2026-11-05）

PRD §4.1 全部（F1~F4）。验收（详见 [checklist-m1.md](checklist-m1.md)）：
- [x] 5 种主题（Dark+ / One Dark Pro / Monokai / Dracula / GitHub Light）下与编辑器配色 spot check 一致（2026-11-05）
- [x] 复制到剪贴板：Win 实测通过（QQ 粘贴出图）；macOS/Linux 待 M2 期间社区反馈
- [x] 300 行 Canvas 导出 < 500ms —— 实测 **183ms**（2026-11-05）
- [x] 设置项全部进 `settings.json` 并即时生效（面板写回 + configListener 推送闭环）
- [x] 手工测试清单全绿（[docs/checklist-m1.md](checklist-m1.md)，A/B/C/D 四节全过）

> 过程要点：三批 PR（#2 写回通道+F1 / #3 样式旋钮 / release）均走分支→CI→独立审查→修复闭环；两次独立审查共 10 条发现全部闭环（含 gutter 行号宽度竞态、切 tab 过期快照等真缺陷）。主题映射新增 Noctis 近似层（用户日常主题）。

## M2 — Beta（+2 周）✅ 已完成（2026-11-08）

F5 渐变/网格背景、F6 水印、F7 行高亮 diff、F8 SVG 导出、F9 预设系统。
- [x] SVG 导出在浏览器/Figma/PowerPoint 三处打开验证（2026-11-08 真机；PPT 不渲染 feDropShadow 阴影属已知限制）
- [x] 预设导入导出往返一致（tests/presets.test.ts 单测断言）

> 过程要点：清账先行（PR #5：6 项 M1 挂账闭环，dom-to-image 引擎移除、运行时依赖净减一 → 仅 shiki，ADR D7）→ PR #6（F5+F6+工具栏两行分组）→ PR #7（F7+F8，审查打回 2 Critical 全修复）→ PR #8（F9）。透明背景不渲染水印为设计语义（水印承载于背景层，用户确认）。

已知限制（登记）：canvas PNG 体积约为 dom 引擎时代 2 倍（4406KB@300行，PNG 无质量参数，挂账②决策不投入）；SVG 阴影在 PPT 缺失；webview bundle 9.4MB（Shiki 全量语言内联，瘦身移至 M3 候选）。

## M3 — 1.0（+2 周）✅ 已完成（2026-11-11）

F10 脱敏遮罩、F11 长代码优化、F12 i18n、F13 发布流水线，外加 roadmap 挂账的 bundle 瘦身。
- [x] F10 脱敏遮罩（PR #10：三渲染路径同步、SVG 替换防泄漏、跨面板重载恢复；F5 实测两轮真机发现全部闭环——重载泄漏与圆角豁口）
- [x] F11 长代码优化（PR #11：measureText 缓存、画布尺寸护栏自动降倍、>1000 行分片提示）
- [x] 1000 行导出 < 2s（实测 1105 行 **358 ms** @1x；2x/3x 触发边上限护栏自动降 1x 并明示——2026-11-08 真机）
- [x] F12 界面 i18n 中/英（PR #12：全量文案 + package.nls 双语 + uiLanguage 配置；F5 双环境验收）
- [x] webview bundle 瘦身（PR #13：9.46MB → 2.75MB，-71%；shiki 细粒度导入 + JS 正则引擎去 wasm + CSP 移除 wasm-unsafe-eval）
- [x] F13 发布流水线（PR #14：release.yml tag 触发——门禁 → 打包 → GitHub Release 含 vsix 资产 → 配置 VSCE_PAT 后自动 publish）
- [ ] marketplace 上架（流水线就绪；前置动作在维护者：注册 publisher 账号 + 配置仓库 secret `VSCE_PAT` 后，push tag 即自动发布）

> 过程要点：五 PR 串行（#10→#14），每个 PR 均走分支→CI→独立审查→逐条修复闭环。审查共 13 条发现（1 Major F10 过期选区、1 Major F12 漏网文案×3、1 Major F13 映射断言缺失等）全部闭环；F5 真机实测抓到 4 个单测不可见的问题（重载泄漏/圆角豁口/shiki 3.23 主题集漂移/i18n 首帧），均已修复。瘦身后 vsix ~2.8MB（原 ~13MB）。

## 远期（不承诺）

- Web 版（复用 src/core + 新壳）
- CLI（包装或对接 silicon 思路）
- 剪贴板 HTML「精确模式」增强（语义着色 100% 一致）
- 桌面版（Tauri）

---

## 实测数据（M0 起登记）

| 日期 | 代码规模 | 引擎 | 耗时 | 备注 |
|---|---|---|---|---|
| 2026-11-04 | 10 行 | canvas | 32 ms / 208 KB | Win11 开发宿主，2x 缩放 |
| 2026-11-04 | 10 行 | dom-to-image | 342 ms / 104 KB | 同环境；**canvas 快 10.7 倍**，验证 ADR D2 |
| 2026-11-05 | 300 行 | canvas | 183 ms / 4406 KB | Win11 开发宿主，2x；M1 性能验收达标（<500ms） |
| 2026-11-05 | 300 行 | dom-to-image | 11770 ms / 1888 KB | 同环境，1x；大片段下不可用级慢 |
| 2026-11-08 | 1105 行 | canvas | 358 ms @1x | Win11 开发宿主；measureText 缓存后（PR #11）。请求 2x/3x 均触发边上限护栏自动降 1x 并状态栏明示；F11 验收 <2s 大幅达标 |
| 2026-11-08 | 300 行 | canvas | 189 ms | 同环境 2x；PR #11 缓存回归，M1 预算 <500ms 无回退 |

> 观察（M1 复核后）：canvas 体积仍约 2 倍（4406KB vs 1888KB @300行），文本抗锯齿更锐利导致压缩率低，M2 优化候选（canvas 尺寸/toDataURL 质量参数）。dom 引擎在 300 行下 11.7s 已不可用——M2 考虑仅保留小片段兜底或直接移除（ADR D2 复核）。
