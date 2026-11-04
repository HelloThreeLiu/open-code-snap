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
| 2026-11-04 | 10 行 | canvas | 32 ms / 208 KB | Win11 开发宿主，2x 缩放 |
| 2026-11-04 | 10 行 | dom-to-image | 342 ms / 104 KB | 同环境；**canvas 快 10.7 倍**，验证 ADR D2 |

> 观察：canvas 产出的 PNG 体积约为 dom 引擎的 2 倍（208KB vs 104KB），推测是 canvas 文本抗锯齿更锐利导致压缩率略低——M1 用更大代码样本复核，若显著再优化（如调 toDataURL 前的 canvas 尺寸或改用 OffscreenCanvas + ImageEncoder 质量参数）。
