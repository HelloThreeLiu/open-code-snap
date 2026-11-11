# Open Code Snap 📸

> 开源的代码截图工具 —— 选中代码，生成漂亮的分享图片。VS Code 扩展先行，渲染核心平台无关。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/HelloThreeLiu/open-code-snap/actions/workflows/ci.yml/badge.svg)](https://github.com/HelloThreeLiu/open-code-snap/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/tag/HelloThreeLiu/open-code-snap?label=release)](https://github.com/HelloThreeLiu/open-code-snap/releases)

## 为什么做这个

CodeSnap 市场现行版已闭源，Polacode 停更多年，VSCodeSnap 是 GPL 且知名度低——「活跃维护 + MIT + 现代技术栈 + 可深度自定义」这个生态位是空的。Open Code Snap 来补上它。

完整论证见 [docs/feasibility.md](docs/feasibility.md)。

## 核心特性（1.0 全量交付）

**导出与同步**

- ✅ 选区实时同步到预览面板（**不污染剪贴板**），多编辑器切换跟随，`Ctrl+Alt+S` 快捷唤起
- ✅ PNG（1x/2x/3x）与 SVG 矢量双格式导出，与预览像素级一致；300 行 189ms、1105 行 358ms
- ✅ 复制到剪贴板 / 保存文件（记住上次目录）；超长代码自动降缩放并明示，>1000 行提示分片

**样式与高亮**

- ✅ Shiki 高亮（VS Code 同源 TextMate 语法），跟随当前主题（含近似映射），可切换 18 种内置主题
- ✅ 背景：纯色 / 双色渐变 / 网格 / 点阵；窗口样式（macOS 交通灯 / Windows 按钮 / 无）与标题可编辑
- ✅ 行号三态、字体连字、Tab 宽度、阴影（颜色/模糊/偏移）、圆角、内边距全参数化
- ✅ 水印：文字模板（`{date}` `{file}`）、四角或平铺、字号透明度可调

**效率**

- ✅ 脱敏遮罩：预览中选中文本一键打码（色块 / 等宽星号），点击恢复，导出同步——SVG 中被遮文本不可还原
- ✅ 行高亮 diff：点击行号循环 普通 → 新增(+) → 删除(−)
- ✅ 配置预设：命名保存、跨会话保留、JSON 导出/导入分享给团队
- ✅ 界面双语（中/英，跟随 VS Code 语言，`openCodeSnap.uiLanguage` 可强制）
- ✅ 面板改动即时写回 `settings.json`，全部样式项可配置

详见 [docs/PRD.md](docs/PRD.md)。

## 开发

```bash
npm install
npm run build       # 构建 host + webview
# 在 VS Code 里按 F5 启动扩展开发宿主（Extension Development Host）
```

提交前门禁四件套（与 CI 一致，详见 [docs/WORKFLOW.md](docs/WORKFLOW.md)）：

```bash
npm run typecheck && npm test && npm run build && npm audit --omit=dev --registry=https://registry.npmjs.org
```

- **研发流程规范：[docs/WORKFLOW.md](docs/WORKFLOW.md)**（提交前必读）
- 产品需求：[docs/PRD.md](docs/PRD.md)
- 技术设计：[docs/tech-design.md](docs/tech-design.md)
- 里程碑：[docs/roadmap.md](docs/roadmap.md)
- 可行性分析：[docs/feasibility.md](docs/feasibility.md)

## 项目结构

```
src/core      # 渲染核心（纯 TS，无 VS Code 依赖，未来 Web/桌面版复用）
src/host      # 扩展宿主端（VS Code API）
webview/      # 预览面板 UI（高亮、样式、导出）
```

## 版本历史

### v1.0.0（2026-11-11）

**全局**

- M3（1.0）完成：PRD §4.3 功能项 F10~F13 全部交付并经实机验收。
- webview bundle 从 9.46MB 瘦身到 2.75MB（-71%）：Shiki 改为细粒度导入（21 种精选语言 + 18 种主题），JavaScript 正则引擎取代 oniguruma wasm，CSP 随之移除 `wasm-unsafe-eval`（安全收紧）。
- 界面双语（中/英）：跟随 VS Code 显示语言（`uiLanguage` 可强制），工具栏/状态栏/通知/预设流程全量覆盖；package.json 元数据经 NLS 双语化。
- 发布流水线落地：push tag 自动跑门禁 → 打包 vsix → 创建 GitHub Release（资产上传）→ 配置 `VSCE_PAT` 后自动发布 Marketplace（PR #14）。

**页面**

- 脱敏遮罩（F10）：预览选中文本 → 「打码」一键遮蔽；色块 / 等宽星号（`maskStyle`）两种样式按宽度精确对齐；点击遮罩恢复；面板重载后存活；PNG/SVG 导出同步——SVG 源码中被遮文本直接替换，不可还原。
- 长代码优化（F11）：文本测量缓存 + Chromium 画布上限护栏（超限自动降缩放并在状态栏明示）+ >1000 行分片提示；1105 行导出实测 358ms，300 行回归 189ms。
- 主题映射对齐 shiki 3.23：Quiet Light → Solarized Light（近似）、Tokyo Night Storm → Tokyo Night（近似）、Everforest 区分暗/亮两型；近似映射均有状态栏标注。

**修复**

- 面板重载后遮罩静默丢失，导致「以为已脱敏」的导出把明文带进 SVG（PR #10 F5 真机发现，安全问题）。
- 相邻遮罩块圆角豁口使单个遮罩呈碎条；过期选区在代码变化后仍可打码错位。
- 文本测量缓存清空后条目写入孤立 Map；并发加载同一语言竞态；高亮器初始化失败永久卡死面板（PR #11/#13 审查发现）。
- 「Tokyo Night Storm」等近似主题名被子串匹配抢先标成「精确映射」；i18n 改造遗漏的 6 处硬编码文案。

### v0.3.0（2026-11-08）

**全局**

- M2（Beta）完成：PRD §4.2 功能项 F5~F9 全部交付并经实机验收。
- 移除 dom-to-image 导出引擎（300 行实测 11.7s 不可用，SVG 矢量导出提供更好的兜底）；运行时依赖净减一，仅剩 `shiki`（ADR D7）。
- 预设系统落地：命名保存当前样式、跨会话保留（globalState），JSON 导出/导入可分享给团队，导入文件经与面板写回同一道白名单净化。
- 六项 M1 审查挂账全部闭环（geometry 无 DOM 化、stageInsets 负偏移、host 消息校验、语言大小写等）。

**页面**

- 背景四型：纯色 / 双色渐变（角度可调）/ 网格 / 点阵，预览与导出同源渲染（F5）。
- 水印：文字模板（`{date}` `{file}`）、四角或平铺、字号与透明度，颜色按背景明暗自动派生（F6）。
- 行高亮 diff：点击行号循环 普通 → 新增(+) → 删除(−)，PNG 与 SVG 导出同步染色（F7）。
- SVG 矢量导出：「保存 SVG」一键产出可缩放矢量图，文本可选中（F8；PowerPoint 不渲染阴影属已知限制）。
- 工具栏两行分组：第一行内容/导出，第二行装饰/预设（背景、渐变、水印、预设菜单）。
- 新增 8 个配置项：`backgroundType` `gradientColorA/B` `gradientAngle` `watermarkText/Position/FontSize/Opacity`，默认值 = 升级前行为。
- 「双引擎计时」与引擎下拉随 dom 引擎移除；导出耗时仍在状态栏显示。

**修复**

- 负阴影偏移（`shadowOffsetY < 0`）时顶部辉光被裁剪（挂账④）。
- 大写 `languageId`（如 `TypeScript`）误回退纯文本高亮（挂账⑥）。
- webview→host 消息全面入参校验：notify（枚举+长度）、saveImage（前缀+上限）、saveSvg（前缀+上限），「过大」与「非法」分文案（挂账⑤）。
- 预设名 `__proto__` 静默丢数据、应用预设部分写入失败无报告、导入文件名路径逃逸等 13 项独立审查发现（PR #8）。
- SVG 导出基线错位一个字号、水印与背景同色不可见、控制字符破坏 XML 合法性（PR #7 审查 2 Critical）。

### v0.2.0（2026-11-05）

**全局**

- M1（MVP）完成：PRD §4.1 功能项 F1~F4 全部交付并经实机验收（[checklist-m1.md](docs/checklist-m1.md)）。
- 设置写回闭环：面板内任何样式改动经白名单校验后即时写入用户 `settings.json`，重载窗口不丢（F4.2）。
- 新增快捷键 `Ctrl+Alt+S`（mac `Cmd+Alt+S`）唤起面板（F1.1）。
- 多编辑器切换跟随：切 tab 时面板内容跟随活动编辑器选区（F1 验收项）。

**页面**

- 行号三态（关闭 / 相对 / 真实行号），旧配置自动迁移零回退（F2.3）。
- 语言手动覆盖下拉（自动识别 + 21 种精选语言，支持任意 Shiki id 手设）（F1.4）。
- 阴影水平偏移 `shadowOffsetX`、Tab 宽度覆盖 `tabSize` 新配置项（F2.4/F2.5）。
- 窗口标题点击可编辑，会话级跟随当前文件，导出同步（F2.2）。
- 主题映射新增 Noctis 系列近似映射，状态栏三态提示（精确 / 近似 / 回退）。

**修复**

- real 行号模式下 gutter 宽度按错误最大行号测量，含前导空行选区行号列窄一位（PR #3 审查 M-1）。
- 120ms 选区防抖与编辑器切换监听竞态：快速切 tab 后面板被过期快照覆盖（PR #2 审查 M-1）。
- 显式 JSON `null` 配置跳过旧键迁移、工作区覆盖检测误报等 8 项审查发现。

### v0.1.0（2026-11-04）

**全局**

- M0 技术验证完成：选区实时同步（不污染剪贴板）、Shiki 高亮跟随编辑器主题、Canvas / dom-to-image 双引擎导出、PNG 保存全链路在真实机器上验收通过。

**页面**

- 预览面板基线：macOS 窗口样式、行号、圆角阴影背景、透明背景支持。

**修复**

- 首次打开面板因焦点抢占导致的空白（b5639d4）。

## 声明

本项目与 CodeSnap（adpyke.codesnap）及其作者无关，为独立开源实现。命名遵循合理使用原则，如有异议请联系。

## License

[MIT](LICENSE)
