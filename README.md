# Open Code Snap 📸

> 开源的代码截图工具 —— 选中代码，生成漂亮的分享图片。VS Code 扩展先行，渲染核心平台无关。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/HelloThreeLiu/open-code-snap/actions/workflows/ci.yml/badge.svg)](https://github.com/HelloThreeLiu/open-code-snap/actions/workflows/ci.yml)

## 为什么做这个

CodeSnap 市场现行版已闭源，Polacode 停更多年，VSCodeSnap 是 GPL 且知名度低——「活跃维护 + MIT + 现代技术栈 + 可深度自定义」这个生态位是空的。Open Code Snap 来补上它。

完整论证见 [docs/feasibility.md](docs/feasibility.md)。

## 核心特性（规划）

- ✅ 选区实时同步到预览面板（**不污染剪贴板**）
- ✅ Shiki 高亮（VS Code 同源 TextMate 引擎），跟随当前主题，可一键切换内置主题
- ✅ 双导出引擎：Canvas 自绘（快、可矢量）+ dom-to-image（兜底），导出即所得
- ✅ 窗口样式 / 行号 / 背景 / 阴影 / 圆角 / 内边距 / 字体连字全参数化
- 🔜 水印、行高亮 diff、渐变与网格背景、脱敏遮罩、SVG 矢量导出、配置预设分享

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
