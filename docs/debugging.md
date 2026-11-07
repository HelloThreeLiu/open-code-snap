# 调试指南

本项目有两个运行环境，调试方式不同：

| 环境 | 代码 | 工具 |
|---|---|---|
| Extension Host（Node.js） | `src/host/extension.ts` | F5 启动 + VS Code 断点 |
| Webview（Chromium） | `webview/**`、`src/core/**` | Webview DevTools（断点 + console） |

## 1. 启动调试会话

1. 用 VS Code 打开项目根目录
2. 按 **F5**（或侧栏“运行和调试” → **Run Extension**）——会先执行 `npm run build`，再弹出一个标题带 "Extension Development Host" 的新窗口
3. 在开发宿主窗口里打开任意代码文件 → 选中几行 → 右键 → **Open Code Snap**

改完代码后：
- **host 代码**（`src/host/**`）改动 → 重启调试会话（开发宿主窗口里 Ctrl+R 也行）
- **webview 代码**（`webview/**`、`src/core/**`）改动 → 重新 build 后，开发宿主里执行 `Developer: Reload Webview`，无需重启调试

用 **Run Extension (watch mode)** 配置可以省掉手动 build：esbuild 自动增量构建，配合 Reload Webview 最顺手。

## 2. 调试 Extension Host（Node 侧）

- 在 `src/host/extension.ts` 里直接打断点（比如 `snippetFrom()`、`saveImage()`），F5 后触发对应操作即命中
- `console.log()` 输出到**主窗口的“调试控制台”**（DEBUG CONSOLE 面板）

## 3. 调试 Webview（Chromium 侧）——重点

预览、Shiki 高亮、两个导出引擎都跑在这里：

1. 在开发宿主窗口按 `Ctrl+Shift+P` → 执行 **`Developer: Open Webview Developer Tools`**
2. 弹出的 Chromium DevTools 中：
   - **Console**：看 `webview/main.ts` 的 `setStatus` 之外的日志；「双引擎计时」的 `console.table` 输出也在这里
   - **Sources**：由于 esbuild 已生成 sourcemap（`dist/webview.js.map` 内嵌原始 TS 源），可以直接看到 TS 源码并打断点：
     - `webview/main.ts` —— 消息路由、渲染管线
     - `webview/preview.ts` —— DOM 预览
     - `webview/export/canvas.ts` —— Canvas 自绘导出
     - `src/core/highlight.ts` —— Shiki token 结构（看 token 颜色/字体样式是否符合预期）

**排查高亮问题的套路**：Sources 里在 `highlight.ts` 的 `return` 前打断点 → 选中一段代码触发 → 在 DevTools Console 检查局部变量 `lines`（每行 token 的 text/color/italic/bold）。

**排查导出不一致**：对比 `geometry.ts` 里 `stageInsets`/`gutterWidth` 的返回值在预览与 `canvas.ts` 中是否一致——两个引擎共用这些函数，不一致通常意味着某处绕过了它们。

## 4. 调试 core 纯函数（不启动 VS Code）

`src/core/layout.ts`、`theme-map.ts` 有 vitest 单测，改完直接：

```bash
npm test
```

想对某个测试打断点：主窗口终端下拉选 **JavaScript Debug Terminal**，在里面跑 `npx vitest run`，断点即生效。

## 5. 常见问题速查

| 症状 | 原因与解法 |
|---|---|
| F5 报 "preLaunchTask 失败" | 先手动 `npm install` + `npm run build` 一次 |
| 面板空白 | webview bundle 未生成：检查 `dist/webview.js` 是否存在；DevTools Console 看 CSP 报错 |
| 选代码没反应 | 主窗口 DEBUG CONSOLE 看是否有 host 报错；确认选区在**活动编辑器**里（非活动分组不触发） |
| 导出图字体不对 | `editor.fontFamily` 里的字体系统未安装（如 macOS 专属字体）；在设置里显式配置 `openCodeSnap.fontFamily` |
| 导出报错 / 图片异常 | Canvas 是唯一导出引擎（dom 兜底已于 0.3.0 移除，见 tech-design ADR D7）；优先看 DevTools Console 的具体异常与面板状态栏错误文案 |
