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

/** All user-tunable style knobs. Mirrors `openCodeSnap.*` settings. */
export interface StyleConfig {
  /** Shiki theme id; empty = follow VS Code theme. */
  theme: string
  windowStyle: 'macos' | 'windows' | 'none'
  showWindowTitle: boolean
  showLineNumbers: boolean
  realLineNumbers: boolean
  backgroundColor: string
  transparentBackground: boolean
  padding: number
  borderRadius: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetY: number
  fontFamily: string
  fontSize: number
  lineHeight: number
  ligatures: boolean
  exportScale: 1 | 2 | 3
  exportEngine: 'canvas' | 'dom'
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
