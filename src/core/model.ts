import type { StyleConfig } from './protocol'

/** Defaults aligned with the `openCodeSnap.*` settings in package.json. */
export const DEFAULT_STYLE: StyleConfig = {
  theme: '',
  windowStyle: 'macos',
  showWindowTitle: true,
  showLineNumbers: true,
  realLineNumbers: false,
  backgroundColor: '#abb8c3',
  transparentBackground: false,
  padding: 32,
  borderRadius: 8,
  shadowColor: 'rgba(0, 0, 0, 0.55)',
  shadowBlur: 68,
  shadowOffsetY: 20,
  fontFamily: '',
  fontSize: 14,
  lineHeight: 1.6,
  ligatures: true,
  exportScale: 2,
  exportEngine: 'canvas',
}

/** Read `openCodeSnap.*` from a VS Code workspace configuration object. */
export function readStyleFromConfig(
  config: {
    get<T>(section: string, defaultValue?: T): T | undefined
  },
  editorConfig: { fontFamily?: string; fontLigatures?: boolean }
): StyleConfig {
  const s = { ...DEFAULT_STYLE }
  const get = <T>(key: string, fallback: T): T => config.get<T>(key, fallback) ?? fallback
  s.theme = get('theme', '')
  s.windowStyle = get('windowStyle', DEFAULT_STYLE.windowStyle)
  s.showWindowTitle = get('showWindowTitle', true)
  s.showLineNumbers = get('showLineNumbers', true)
  s.realLineNumbers = get('realLineNumbers', false)
  s.backgroundColor = get('backgroundColor', DEFAULT_STYLE.backgroundColor)
  s.transparentBackground = get('transparentBackground', false)
  s.padding = get('padding', DEFAULT_STYLE.padding)
  s.borderRadius = get('borderRadius', DEFAULT_STYLE.borderRadius)
  s.shadowColor = get('shadowColor', DEFAULT_STYLE.shadowColor)
  s.shadowBlur = get('shadowBlur', DEFAULT_STYLE.shadowBlur)
  s.shadowOffsetY = get('shadowOffsetY', DEFAULT_STYLE.shadowOffsetY)
  s.fontFamily = get('fontFamily', '')
  s.fontSize = get('fontSize', DEFAULT_STYLE.fontSize)
  s.lineHeight = get('lineHeight', DEFAULT_STYLE.lineHeight)
  s.ligatures = get('ligatures', true)
  s.exportScale = get('exportScale', DEFAULT_STYLE.exportScale)
  s.exportEngine = get('exportEngine', DEFAULT_STYLE.exportEngine)
  // Follow editor font when not overridden.
  if (!s.fontFamily && editorConfig.fontFamily) {
    s.fontFamily = editorConfig.fontFamily
  }
  if (editorConfig.fontLigatures !== undefined) {
    s.ligatures = editorConfig.fontLigatures
  }
  return s
}
