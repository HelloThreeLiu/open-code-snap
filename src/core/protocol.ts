/**
 * Shared message protocol between the extension host and the webview.
 * Single source of truth for both sides.
 */

/** Code + editor context sent from the host. */
export interface SnippetRequest {
  /** Code text, already nothing to do with clipboard. */
  code: string
  /** VS Code languageId, e.g. "typescript". */
  languageId: string
  /** 0-based line number of the first selected line. */
  startLine: number
  /** Suggested window title (usually the file name). */
  windowTitle: string
  /** Stable document identity (document uri) — survives same-basename files. */
  documentKey: string
  /** Editor font settings to follow. */
  font: {
    /** Raw CSS font-family list from editor.fontFamily. */
    family: string
    /** editor.fontLigatures */
    ligatures: boolean
    /** Effective tab size of the document. */
    tabSize: number
  }
}

/** Line number rendering mode (PRD F2.3). */
export type LineNumbersMode = 'off' | 'relative' | 'real'

/** Stage backdrop kind (PRD F5). Solid = the pre-0.3 single-color behavior. */
export type BackgroundType = 'solid' | 'gradient' | 'grid' | 'dots'

/** Watermark anchor; `tile` repeats across the whole stage (PRD F6). */
export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile'

/** All user-tunable style knobs. Mirrors `openCodeSnap.*` settings. */
export interface StyleConfig {
  /** Shiki theme id; empty = follow VS Code theme. */
  theme: string
  windowStyle: 'macos' | 'windows' | 'none'
  showWindowTitle: boolean
  lineNumbers: LineNumbersMode
  /** Force a Shiki language id; empty = auto-detect from the document. */
  languageOverride: string
  backgroundColor: string
  transparentBackground: boolean
  /** Backdrop kind; solid uses backgroundColor alone (PRD F5). */
  backgroundType: BackgroundType
  gradientColorA: string
  gradientColorB: string
  /** CSS linear-gradient angle: 0deg = to top, 90deg = to right. */
  gradientAngle: number
  /** Watermark text template; empty = no watermark (PRD F6). */
  watermarkText: string
  watermarkPosition: WatermarkPosition
  watermarkFontSize: number
  /** 0.05..1 */
  watermarkOpacity: number
  padding: number
  borderRadius: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  fontFamily: string
  fontSize: number
  lineHeight: number
  ligatures: boolean
  exportScale: 1 | 2 | 3
}

/** Resolved theme info the host sends along (so webview does not need vscode API). */
export interface ThemeContext {
  /** Display name of the current workbench theme, when known. */
  editorThemeName: string
}

// --- host → webview ---

export type HostMessage =
  | { type: 'update'; request: SnippetRequest; style: StyleConfig; themeContext: ThemeContext }
  | { type: 'style'; style: StyleConfig; themeContext: ThemeContext }

// --- webview → host ---

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'saveImage'; dataURL: string }
  /** F8: save the generated SVG source; host validates and writes a .svg file. */
  | { type: 'saveSvg'; svg: string }
  | { type: 'notify'; level: 'info' | 'warn' | 'error'; text: string }
  /** Persist a style knob to user settings (F4.2). Key/value pass the
   *  host-side whitelist in src/core/settings.ts before anything is written. */
  | { type: 'updateSetting'; key: string; value: unknown }
