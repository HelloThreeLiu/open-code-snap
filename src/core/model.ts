import type { LineNumbersMode, StyleConfig } from './protocol'

/** Defaults aligned with the `openCodeSnap.*` settings in package.json. */
export const DEFAULT_STYLE: StyleConfig = {
  theme: '',
  windowStyle: 'macos',
  showWindowTitle: true,
  lineNumbers: 'relative',
  languageOverride: '',
  backgroundColor: '#abb8c3',
  transparentBackground: false,
  backgroundType: 'solid',
  gradientColorA: '#7093FF',
  gradientColorB: '#B379F5',
  gradientAngle: 135,
  watermarkText: '',
  watermarkPosition: 'bottom-right',
  watermarkFontSize: 14,
  watermarkOpacity: 0.5,
  padding: 32,
  borderRadius: 8,
  shadowColor: 'rgba(0, 0, 0, 0.55)',
  shadowBlur: 68,
  shadowOffsetX: 0,
  shadowOffsetY: 20,
  fontFamily: '',
  fontSize: 14,
  lineHeight: 1.6,
  ligatures: true,
  exportScale: 2,
}

/** Subset of vscode.WorkspaceConfiguration#inspect the reader relies on. */
export interface ConfigInspect<T> {
  defaultValue?: T
  globalValue?: T
  workspaceValue?: T
  workspaceFolderValue?: T
}

/** Structural subset of vscode.WorkspaceConfiguration used here. */
export interface ConfigLike {
  get<T>(section: string, defaultValue?: T): T | undefined
  inspect<T>(section: string): ConfigInspect<T> | undefined
}

function isExplicitlySet(inspect: ConfigInspect<unknown> | undefined): boolean {
  // `!= null` treats an explicit JSON null (a common manual "unset") as unset
  // too, so legacy keys still migrate (review N-1).
  return (
    !!inspect &&
    (inspect.globalValue != null ||
      inspect.workspaceValue != null ||
      inspect.workspaceFolderValue != null)
  )
}

/**
 * Read the lineNumbers enum with legacy-key migration (PRD F2.3).
 * The schema default would mask an unset value, so explicitness is decided
 * via inspect(): an unset `lineNumbers` falls back to the pre-0.2
 * `showLineNumbers` / `realLineNumbers` pair so old settings never regress.
 */
function readLineNumbers(config: ConfigLike): LineNumbersMode {
  if (isExplicitlySet(config.inspect<string>('lineNumbers'))) {
    const v = config.get<string>('lineNumbers', 'relative')
    return v === 'off' || v === 'real' ? v : 'relative'
  }
  if (!config.get<boolean>('showLineNumbers', true)) return 'off'
  if (config.get<boolean>('realLineNumbers', false)) return 'real'
  return 'relative'
}

/** Read `openCodeSnap.*` from a VS Code workspace configuration object. */
export function readStyleFromConfig(
  config: ConfigLike,
  editorConfig: { fontFamily?: string; fontLigatures?: boolean }
): StyleConfig {
  const s = { ...DEFAULT_STYLE }
  const get = <T>(key: string, fallback: T): T => config.get<T>(key, fallback) ?? fallback
  s.theme = get('theme', '')
  s.windowStyle = get('windowStyle', DEFAULT_STYLE.windowStyle)
  s.showWindowTitle = get('showWindowTitle', true)
  s.lineNumbers = readLineNumbers(config)
  s.languageOverride = get('languageOverride', '')
  s.backgroundColor = get('backgroundColor', DEFAULT_STYLE.backgroundColor)
  s.transparentBackground = get('transparentBackground', false)
  s.backgroundType = get('backgroundType', DEFAULT_STYLE.backgroundType)
  s.gradientColorA = get('gradientColorA', DEFAULT_STYLE.gradientColorA)
  s.gradientColorB = get('gradientColorB', DEFAULT_STYLE.gradientColorB)
  s.gradientAngle = get('gradientAngle', DEFAULT_STYLE.gradientAngle)
  s.watermarkText = get('watermarkText', DEFAULT_STYLE.watermarkText)
  s.watermarkPosition = get('watermarkPosition', DEFAULT_STYLE.watermarkPosition)
  s.watermarkFontSize = get('watermarkFontSize', DEFAULT_STYLE.watermarkFontSize)
  s.watermarkOpacity = get('watermarkOpacity', DEFAULT_STYLE.watermarkOpacity)
  s.padding = get('padding', DEFAULT_STYLE.padding)
  s.borderRadius = get('borderRadius', DEFAULT_STYLE.borderRadius)
  s.shadowColor = get('shadowColor', DEFAULT_STYLE.shadowColor)
  s.shadowBlur = get('shadowBlur', DEFAULT_STYLE.shadowBlur)
  s.shadowOffsetX = get('shadowOffsetX', DEFAULT_STYLE.shadowOffsetX)
  s.shadowOffsetY = get('shadowOffsetY', DEFAULT_STYLE.shadowOffsetY)
  s.fontFamily = get('fontFamily', '')
  s.fontSize = get('fontSize', DEFAULT_STYLE.fontSize)
  s.lineHeight = get('lineHeight', DEFAULT_STYLE.lineHeight)
  s.ligatures = get('ligatures', true)
  s.exportScale = get('exportScale', DEFAULT_STYLE.exportScale)
  // Follow editor font when not overridden.
  if (!s.fontFamily && editorConfig.fontFamily) {
    s.fontFamily = editorConfig.fontFamily
  }
  if (editorConfig.fontLigatures !== undefined) {
    s.ligatures = editorConfig.fontLigatures
  }
  return s
}
