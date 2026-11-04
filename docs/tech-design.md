# Open Code Snap 技术设计

> 版本：v1.0 · 2026-11-04
> 前置阅读：[feasibility.md](feasibility.md)（为什么选这些技术）、[PRD.md](PRD.md)（要做什么）

## 1. 总体架构

```
┌────────────────────────────── VS Code ──────────────────────────────┐
│  Extension Host (Node.js)              Webview (Chromium)           │
│  ┌──────────────────────┐   postMessage  ┌────────────────────────┐ │
│  │ src/host             │ ─────────────► │ webview/               │ │
│  │  · 面板生命周期       │                │  · preview (DOM 渲染)   │ │
│  │  · 选区同步(防抖)     │ ◄───────────── │  · export/             │ │
│  │  · 设置读写           │   save/copy    │    · canvas.ts 自绘 ⭐  │ │
│  │  · 文件保存           │                │    · domtoimage.ts 兜底 │ │
│  └──────────────────────┘                │  · toolbar/控件         │ │
│                                          └───────────┬────────────┘ │
│                                                      │ 调用          │
│                                          ┌───────────▼────────────┐ │
│                                          │ src/core (纯 TS) ⭐     │ │
│                                          │  · highlight (Shiki)   │ │
│                                          │  · model (配置/布局)    │ │
│                                          │  · theme-map           │ │
│                                          └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**两条铁律：**

1. **`src/core` 不 import 任何 `vscode` API、不依赖 DOM 序列化库**——只依赖浏览器标准能力（Shiki 需要 DOM 环境，在 webview 内运行）。未来 Web 版/桌面版直接复用这个目录。
2. **预览与导出共享同一份布局模型**（`LayoutResult`），导出器只消费模型不重新计算——这是「所见即所得」和 Silicon 式性能的来源。

## 2. 数据流

```
用户选区变化
 → host: 读取 document.getText(selection) + languageId + 起始行号 + 编辑器字体设置
 → postMessage { type:'update', payload: SnippetRequest }
 → webview core.highlight(): Shiki 异步高亮 → ThemedLine[]（每行 token: text+scope 颜色）
 → core.layout(): 结合 StyleConfig 计算布局（行号宽、缩进裁剪、行高）
 → preview.render(LayoutResult)  // DOM，交互层
 → 用户点击导出
 → export.canvas(LayoutResult)   // 或 export.svg / export.domtoimage
 → dataURL → host 写文件 / navigator.clipboard 复制
```

## 3. 模块与职责

| 模块 | 位置 | 职责 | 关键约束 |
|---|---|---|---|
| 协议 | `src/core/protocol.ts` | host↔webview 消息类型、`SnippetRequest`/`StyleConfig` 数据结构 | 双端唯一共享源 |
| 高亮 | `src/core/highlight.ts` | Shiki 单例、语言/主题懒加载、`highlight(code, lang, theme) → ThemedLine[]` | 首个语言加载 < 300ms；同语言重复调用 < 30ms |
| 主题映射 | `src/core/theme-map.ts` | `workbench.colorTheme` 显示名 → Shiki 主题 id；含别名表 | 匹配失败回退默认主题并上报 UI |
| 布局 | `src/core/layout.ts` | 缩进裁剪（最小公共缩进）、行号计算、Tab 展开、行高/宽度估算 | 纯函数，可单测 |
| 预览 | `webview/preview.ts` | LayoutResult → DOM（窗口栏、行号列、代码区、控件面板） | 只读模型，不产生导出用状态 |
| 导出·Canvas | `webview/export/canvas.ts` | LayoutResult → Canvas 2D → PNG dataURL；阴影/圆角/渐变自绘 | Chromium `roundRect` 可用；连字走浏览器默认 `calt` |
| 导出·DOM | `webview/export/domtoimage.ts` | 预览节点 → dom-to-image-more PNG | M0~M1 兜底，M2 后退役为可选 |
| 宿主 | `src/host/extension.ts` | 面板创建/恢复、选区监听（防抖 120ms）、设置双向同步、保存对话框 | **不碰剪贴板** |

## 4. 关键技术决策记录（ADR 摘要）

| # | 决策 | 理由 | 放弃的方案 |
|---|---|---|---|
| D1 | 高亮用 Shiki，不用 `clipboardCopyWithSyntaxHighlightingAction` | 该内部命令会**污染用户剪贴板**（polacode 最大差评点），且 vscode.dev/远程不稳；Shiki 同为 VS Code TextMate 语法，一致性 ≈99% | 剪贴板 HTML 路线（保留为远期「精确模式」可选增强） |
| D2 | 导出主线为 Canvas 自绘 | Silicon 验证的 token→自绘架构：毫秒级、内存平稳、天然产出 SVG；与预览共享布局模型保证 WYSIWYG | dom-to-image（序列化大 SVG 字符串，长代码秒级卡顿、字体需内嵌） |
| D3 | 单仓库、目录级模块边界，暂不 monorepo | 只有一个消费者（扩展）时 workspaces 是纯开销；`src/core` 无外部依赖，未来抽包成本低 | npm workspaces（待 Web 版立项时再拆） |
| D4 | 构建 esbuild（host CJS bundle / webview IIFE bundle） | VS Code 官方推荐路线，构建 < 1s，watch 体验好 | webpack（慢、配置重）、Vite（webview 可用但 host 端多余） |
| D5 | 字体策略：预览与导出用同一 font 字符串（默认跟随 `editor.fontFamily`） | Canvas 与 DOM 使用同一字体栈+字号，消除导出差异；连字依赖浏览器默认 `calt`（Fira Code 等主流连字字体默认开启） | 自带 harfbuzz/WASM 整形（silicon 的坑，浏览器已内置排版引擎） |
| D6 | 语言包先全量打进 webview bundle | Shiki 全量语言压缩后约 1MB，本地加载无网络成本；M2 再按 `shiki/langs` 细粒度懒加载瘦身 | 立即细粒度动态 import（M0 复杂度不值） |

## 5. 消息协议（host ↔ webview）

```ts
// host → webview
{ type: 'init' }                                              // webview 就绪后请求初始数据
{ type: 'update', request: SnippetRequest, style: StyleConfig } // 选区/语言/字体 + 样式
{ type: 'style', style: StyleConfig }                          // 仅样式变化
// webview → host
{ type: 'ready' }
{ type: 'saveImage', dataURL: string }                         // host 弹保存框写文件
{ type: 'notify', level: 'info'|'warn'|'error', text: string }
```

`SnippetRequest { code, languageId, startLine, windowTitle, font: { family, ligatures, tabSize } }`

## 6. 目录结构

```
open-code-snap/
├── src/
│   ├── core/            # 渲染核心（平台无关）
│   │   ├── protocol.ts
│   │   ├── highlight.ts
│   │   ├── theme-map.ts
│   │   ├── layout.ts
│   │   └── model.ts     # StyleConfig 及默认值
│   └── host/
│       └── extension.ts # VS Code 扩展入口
├── webview/
│   ├── main.ts          # 入口：消息路由 + 状态
│   ├── preview.ts       # DOM 预览渲染
│   ├── toolbar.ts       # 控件面板
│   ├── style.css
│   └── export/
│       ├── canvas.ts
│       └── domtoimage.ts
├── esbuild.mjs
├── package.json         # 扩展清单 + npm 脚本
└── docs/
```

## 7. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| core 纯函数（layout/theme-map） | vitest | 缩进裁剪边界、行号、主题别名映射 |
| webview 渲染 | vitest + happy-dom（M1 引入） | LayoutResult → DOM 快照、Canvas 导出尺寸 |
| 扩展集成 | @vscode/test-electron（M3） | 命令注册、面板生命周期、设置读写 |
| 手工清单 | docs/checklist（每里程碑） | 真机视觉验收、剪贴板行为、性能秒表 |

## 8. 性能与安全

- Webview CSP：`default-src 'none'; img-src {webview.cspSource} data:; style-src {webview.cspSource} 'unsafe-inline'; font-src {webview.cspSource} data:; script-src 'nonce-{nonce}'`
- 所有资源经 `asWebviewUri`，无外网请求
- 选区同步防抖 120ms；代码 > 500 行时预览截断提示「导出仍全文」
- 依赖最小化：运行时仅 shiki + dom-to-image-more（M2 后仅 shiki）

## 9. 发布

- `vsce package` 产出 `.vsix`；GitHub Actions：PR 跑 lint+test，tag 推 marketplace
- 扩展 ID：`open-code-snap`（发布前查重）
