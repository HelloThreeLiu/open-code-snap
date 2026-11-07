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
  | { type: 'notify'; level: 'info' | 'warn' | 'error'; text: string }
  /** Persist a style knob to user settings (F4.2). Key/value pass the
   *  host-side whitelist in src/core/settings.ts before anything is written. */
  | { type: 'updateSetting'; key: string; value: unknown }
