# Open Code Snap 路线图

> 预估为业余时间口径；每阶段以下方验收清单全绿为完成标准。

## M0 — 技术验证 ✅ 目标：跑通全链路 + 拿到实测数据

> **进度（2026-11-04）**：代码已完成，`typecheck / 19 项单测 / esbuild 构建` 全部通过。剩余人工验证步骤见下方清单（需在 VS Code 开发宿主中按 F5 执行）。已知优化项：webview bundle 9.4MB（Shiki 全量语言内联，M2 按需加载瘦身）。

范围：扩展骨架、面板、选区同步、Shiki 高亮、DOM 预览、双路径导出 PNG。

验收清单：
- [ ] F5 打开扩展开发宿主，选中代码右键 `Open Code Snap` 出面板并实时跟随选区
- [ ] 剪贴板内容在操作全程不被修改（复制一段文字 → 全流程操作 → 粘贴验证原内容）
- [ ] 同一段 300 行代码分别用 Canvas / dom-to-image 导出 PNG，均正常
- [ ] 面板显示两种引擎导出耗时（记录进本文档下方「实测数据」）
- [ ] `npm run build` 零错误，`npm test` 通过

## M1 — MVP（1~2 周）

PRD §4.1 全部（F1~F4）。验收：
- [ ] 5 种主题（Dark+ / One Dark Pro / Monokai / Dracula / GitHub Light）下与编辑器配色 spot check 一致
- [ ] 复制到剪贴板在 Win/macOS/Linux 三平台可用（至少 Win 实测 + CI 冒烟）
- [ ] 300 行 Canvas 导出 < 500ms（M0 实测数据校准）
- [ ] 设置项全部进 `settings.json` 并即时生效
- [ ] 手工测试清单全绿（M1 时建 `docs/checklist-m1.md`）

## M2 — Beta（+2 周）

F5 渐变/网格背景、F6 水印、F7 行高亮 diff、F8 SVG 导出、F9 预设系统。
- [ ] SVG 导出在浏览器/Figma/PowerPoint 三处打开验证
- [ ] 预设导入导出往返一致

## M3 — 1.0（+2 周）

F10 脱敏遮罩、F11 长代码优化、F12 i18n、F13 发布流水线。
- [ ] marketplace 上架，CI 自动发版
- [ ] 1000 行导出 < 2s

## 远期（不承诺）

- Web 版（复用 src/core + 新壳）
- CLI（包装或对接 silicon 思路）
- 剪贴板 HTML「精确模式」增强（语义着色 100% 一致）
- 桌面版（Tauri）

---

## 实测数据（M0 起登记）

| 日期 | 代码规模 | 引擎 | 耗时 | 备注 |
|---|---|---|---|---|
| _待 M0 填写_ | | | | |
