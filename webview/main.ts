import './style.css'
import type { HostMessage, SnippetRequest, StyleConfig, ThemeContext, WebviewMessage } from '../src/core/protocol'
import { DEFAULT_STYLE } from '../src/core/model'
import { layoutCode, maxLineNumber, type LayoutedCode } from '../src/core/layout'
import { highlightCode, type HighlightResult } from '../src/core/highlight'
import { resolveTheme, CURATED_THEMES } from '../src/core/theme-map'
import { CURATED_LANGUAGES } from '../src/core/languages'
import { gutterWidth, setMeasureTextImpl } from '../src/core/geometry'
import { nextMark, type LineMark } from '../src/core/diff'
import { renderPreview } from './preview'
import { exportCanvasPng } from './export/canvas'
import { exportSvgString } from './export/svg'

declare function acquireVsCodeApi(): { postMessage(msg: WebviewMessage): void }

// Wire the DOM-backed text measurement into core geometry, which itself
// stays DOM-free (hang-③): must run before any render/layout happens.
let measureCtx: CanvasRenderingContext2D | null = null
setMeasureTextImpl((text, font) => {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!
  measureCtx.font = font
  return measureCtx.measureText(text).width
})

const vscode = acquireVsCodeApi()
const app = document.getElementById('app')!

interface State {
  request: SnippetRequest | null
  style: StyleConfig
  themeContext: ThemeContext
  /** Session-level window-title override; reset when the source file changes. */
  titleOverride: string | null
  /** documentKey of the current request, to detect file switches. */
  lastDocKey: string
  /** F7 diff marks by layout line index; cleared on every new snapshot. */
  lineMarks: Record<number, LineMark>
}

const state: State = {
  request: null,
  style: { ...DEFAULT_STYLE },
  themeContext: { editorThemeName: '' },
  titleOverride: null,
  lastDocKey: '',
  lineMarks: {},
}

interface RenderCache {
  layout: LayoutedCode
  highlight: HighlightResult
  style: StyleConfig
  gutterWidth: number
  themeId: string
  windowTitle: string
  /** Same reference as state.lineMarks — exports must see live marks. */
  lineMarks: Record<number, LineMark>
}

let cache: RenderCache | null = null
let renderSeq = 0
/** Editor theme we already showed a fallback notice for (dedupe). */
let lastFallbackNotified = ''

/** F4.2: toolbar knobs persist to user settings via the host (validated
 *  there by a whitelist); the new style arrives back as a host push. */
function writeSetting(key: string, value: string | number | boolean): void {
  vscode.postMessage({ type: 'updateSetting', key, value })
}

// ---------------------------------------------------------------- UI shell

function makeSelect(
  id: string,
  title: string,
  options: readonly (readonly [string, string])[],
  onChange: (value: string) => void
): HTMLSelectElement {
  const select = document.createElement('select')
  select.id = id
  select.title = title
  for (const [value, label] of options) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    select.appendChild(opt)
  }
  select.addEventListener('change', () => onChange(select.value))
  return select
}

/** Number input that clamps into [min, max]; empty/garbage keeps the old value. */
function makeNumberInput(
  id: string,
  title: string,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void
): HTMLInputElement {
  const input = document.createElement('input')
  input.id = id
  input.type = 'number'
  input.title = title
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.addEventListener('change', () => {
    const raw = input.value.trim()
    // `Number('')` is 0, which would silently write the clamped minimum —
    // an emptied field must keep the current value instead (review Major-1).
    if (raw === '') return
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    onChange(Math.min(max, Math.max(min, n)))
  })
  return input
}

function makeColorInput(id: string, title: string, onChange: (value: string) => void): HTMLInputElement {
  const input = document.createElement('input')
  input.id = id
  input.type = 'color'
  input.title = title
  input.addEventListener('change', () => onChange(input.value))
  return input
}

function toolbarSep(): HTMLElement {
  const sep = document.createElement('span')
  sep.className = 'toolbar-sep'
  return sep
}

function buildShell(): void {
  app.replaceChildren()

  const toolbar = document.createElement('div')
  toolbar.id = 'toolbar'

  // --- row 1: content & export ---
  const row1 = document.createElement('div')
  row1.className = 'toolbar-row'

  const themeSelect = makeSelect(
    'ctl-theme',
    'Theme',
    [['', '跟随编辑器主题'], ...CURATED_THEMES.map((id) => [id, id] as const)],
    (v) => writeSetting('theme', v)
  )

  const langSelect = makeSelect(
    'ctl-lang',
    'Language override',
    CURATED_LANGUAGES.map(({ id, label }) => [id, label] as const),
    (v) => writeSetting('languageOverride', v)
  )

  const lineNoSelect = makeSelect(
    'ctl-lineno',
    'Line numbers',
    [
      ['off', '无行号'],
      ['relative', '相对行号'],
      ['real', '真实行号'],
    ],
    (v) => writeSetting('lineNumbers', v)
  )

  const windowSelect = makeSelect(
    'ctl-window',
    'Window style',
    [
      ['macos', 'macOS 窗口'],
      ['windows', 'Windows 窗口'],
      ['none', '无窗口'],
    ],
    (v) => writeSetting('windowStyle', v)
  )

  const transparentLabel = document.createElement('label')
  transparentLabel.id = 'ctl-transparent'
  const transparent = document.createElement('input')
  transparent.type = 'checkbox'
  transparent.title = '透明背景'
  transparent.addEventListener('change', () => {
    writeSetting('transparentBackground', transparent.checked)
  })
  const transparentText = document.createElement('span')
  transparentText.textContent = '透明'
  transparentLabel.append(transparent, transparentText)

  const scaleSelect = makeSelect(
    'ctl-scale',
    'Export scale',
    [
      ['1', '1x'],
      ['2', '2x'],
      ['3', '3x'],
    ],
    (v) => writeSetting('exportScale', Number(v))
  )

  const btnSave = document.createElement('button')
  btnSave.id = 'btn-save'
  btnSave.textContent = '保存 PNG'
  btnSave.addEventListener('click', () => void exportImage('save'))

  const btnSaveSvg = document.createElement('button')
  btnSaveSvg.id = 'btn-save-svg'
  btnSaveSvg.textContent = '保存 SVG'
  btnSaveSvg.title = '矢量导出（F8）；缩放倍数不适用于 SVG'
  btnSaveSvg.addEventListener('click', () => void exportSvgFile())

  const btnCopy = document.createElement('button')
  btnCopy.id = 'btn-copy'
  btnCopy.textContent = '复制到剪贴板'
  btnCopy.addEventListener('click', () => void exportImage('copy'))

  row1.append(themeSelect, langSelect, lineNoSelect, windowSelect, transparentLabel, scaleSelect, btnSave, btnSaveSvg, btnCopy)

  // --- row 2: backdrop & watermark (F5/F6) ---
  const row2 = document.createElement('div')
  row2.className = 'toolbar-row'

  const bgTypeSelect = makeSelect(
    'ctl-bgtype',
    'Background type',
    [
      ['solid', '纯色背景'],
      ['gradient', '渐变背景'],
      ['grid', '网格背景'],
      ['dots', '点阵背景'],
    ],
    (v) => writeSetting('backgroundType', v)
  )

  const gradA = makeColorInput('ctl-grad-a', '渐变起始色', (v) => writeSetting('gradientColorA', v))
  const gradB = makeColorInput('ctl-grad-b', '渐变结束色', (v) => writeSetting('gradientColorB', v))
  const gradAngle = makeNumberInput('ctl-grad-angle', '渐变角度（0-360）', 0, 360, 5, (v) =>
    writeSetting('gradientAngle', v)
  )

  const wmText = document.createElement('input')
  wmText.id = 'ctl-wm-text'
  wmText.type = 'text'
  wmText.title = '水印文字（支持 {date} {file} 模板变量，留空不显示）'
  wmText.placeholder = '水印，如 @me {date}'
  wmText.addEventListener('change', () => writeSetting('watermarkText', wmText.value))

  const wmPos = makeSelect(
    'ctl-wm-pos',
    'Watermark position',
    [
      ['top-left', '水印：左上'],
      ['top-right', '水印：右上'],
      ['bottom-left', '水印：左下'],
      ['bottom-right', '水印：右下'],
      ['tile', '水印：平铺'],
    ],
    (v) => writeSetting('watermarkPosition', v)
  )
  const wmSize = makeNumberInput('ctl-wm-size', '水印字号', 8, 72, 1, (v) => writeSetting('watermarkFontSize', v))
  const wmOpacity = makeNumberInput('ctl-wm-opacity', '水印透明度', 0.05, 1, 0.05, (v) =>
    writeSetting('watermarkOpacity', v)
  )

  row2.append(bgTypeSelect, gradA, gradB, gradAngle, toolbarSep(), wmText, wmPos, wmSize, wmOpacity)

  toolbar.append(row1, row2)

  const previewWrap = document.createElement('div')
  previewWrap.id = 'preview-wrap'
  const preview = document.createElement('div')
  preview.id = 'preview'
  previewWrap.appendChild(preview)

  const statusbar = document.createElement('div')
  statusbar.id = 'statusbar'
  const status = document.createElement('span')
  status.id = 'status-text'
  status.textContent = '等待代码选区…'
  statusbar.appendChild(status)

  const flash = document.createElement('div')
  flash.id = 'flash-fx'
  flash.style.display = 'none'

  app.append(toolbar, previewWrap, statusbar, flash)
}

// ---------------------------------------------------------------- rendering

async function rerender(): Promise<void> {
  const seq = ++renderSeq
  const style = state.style

  const layout = state.request
    ? layoutCode(state.request.code, {
        tabSize: state.request.font.tabSize,
        startLine: state.request.startLine,
      })
    : { lines: [] }

  const resolved = resolveTheme(state.themeContext.editorThemeName)
  const themeId = style.theme || resolved.id

  // F1.4: manual language override wins over the document's languageId.
  const languageId = style.languageOverride || state.request?.languageId || 'text'
  const highlight = await highlightCode(layout, languageId, themeId)
  if (seq !== renderSeq) return // a newer update arrived meanwhile

  const maxNo = maxLineNumber(layout.lines, style.lineNumbers)

  const windowTitle = state.titleOverride ?? state.request?.windowTitle ?? ''
  cache = {
    layout,
    highlight,
    style,
    gutterWidth: gutterWidth(maxNo, style),
    themeId,
    windowTitle,
    lineMarks: state.lineMarks,
  }

  const preview = document.getElementById('preview')!
  renderPreview(preview, {
    layout,
    highlight,
    style,
    windowTitle,
    gutterWidth: cache.gutterWidth,
    lineMarks: state.lineMarks,
    // F7: cycle unmarked -> added -> removed on the line number.
    onToggleMark: (i) => {
      const next = nextMark(state.lineMarks[i])
      if (next) state.lineMarks[i] = next
      else delete state.lineMarks[i]
      void rerender()
    },
    // Live sync keeps exports correct even mid-edit (no blur dependency).
    onTitleInput: (text) => {
      state.titleOverride = text
      if (cache) cache.windowTitle = text
    },
    onTitleChange: (text) => {
      state.titleOverride = text
      if (cache) cache.windowTitle = text
      void rerender()
    },
  })

  syncToolbar(style)
  const themeNote = style.theme
    ? ''
    : resolved.exact
      ? '（已匹配编辑器主题）'
      : resolved.approx
        ? `（近似映射：${state.themeContext.editorThemeName} → ${themeId}）`
        : `（编辑器主题 "${state.themeContext.editorThemeName}" 未精确映射，已回退）`
  setStatus(!state.request ? '等待代码选区…' : `${layout.lines.length} 行 · ${themeId}${themeNote}`)
  // Notify once per unmapped theme — every selection change re-renders and
  // must not spam the same fallback notice (review N-2).
  if (
    state.request &&
    !style.theme &&
    !resolved.exact &&
    !resolved.approx &&
    lastFallbackNotified !== state.themeContext.editorThemeName
  ) {
    lastFallbackNotified = state.themeContext.editorThemeName
    vscode.postMessage({ type: 'notify', level: 'info', text: `Open Code Snap: 编辑器主题 "${state.themeContext.editorThemeName}" 暂无精确映射，已回退到 ${resolved.id}。` })
  }
}

/** Keep a value selectable even when it is not part of the curated list. */
function ensureOption(select: HTMLSelectElement, value: string, label: string): void {
  if (value && !Array.from(select.options).some((o) => o.value === value)) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    select.appendChild(opt)
  }
}

function syncToolbar(style: StyleConfig): void {
  const themeSelect = document.getElementById('ctl-theme') as HTMLSelectElement
  const langSelect = document.getElementById('ctl-lang') as HTMLSelectElement
  const lineNoSelect = document.getElementById('ctl-lineno') as HTMLSelectElement
  const windowSelect = document.getElementById('ctl-window') as HTMLSelectElement
  const transparent = document.querySelector<HTMLInputElement>('#ctl-transparent input')
  const scaleSelect = document.getElementById('ctl-scale') as HTMLSelectElement
  // Hand-set values outside the curated lists (e.g. languageOverride: "vue")
  // must stay visible instead of collapsing to a blank option (review N-4).
  ensureOption(themeSelect, style.theme, style.theme)
  ensureOption(langSelect, style.languageOverride, style.languageOverride)
  themeSelect.value = style.theme
  langSelect.value = style.languageOverride
  lineNoSelect.value = style.lineNumbers
  windowSelect.value = style.windowStyle
  if (transparent) transparent.checked = style.transparentBackground
  scaleSelect.value = String(style.exportScale)

  // --- row 2 (F5/F6) ---
  const bgType = document.getElementById('ctl-bgtype') as HTMLSelectElement
  const gradA = document.getElementById('ctl-grad-a') as HTMLInputElement
  const gradB = document.getElementById('ctl-grad-b') as HTMLInputElement
  const gradAngle = document.getElementById('ctl-grad-angle') as HTMLInputElement
  const wmText = document.getElementById('ctl-wm-text') as HTMLInputElement
  const wmPos = document.getElementById('ctl-wm-pos') as HTMLSelectElement
  const wmSize = document.getElementById('ctl-wm-size') as HTMLInputElement
  const wmOpacity = document.getElementById('ctl-wm-opacity') as HTMLInputElement
  bgType.value = style.backgroundType
  gradA.value = style.gradientColorA
  gradB.value = style.gradientColorB
  gradAngle.value = String(style.gradientAngle)
  wmText.value = style.watermarkText
  wmPos.value = style.watermarkPosition
  wmSize.value = String(style.watermarkFontSize)
  wmOpacity.value = String(style.watermarkOpacity)
}

function setStatus(text: string): void {
  const el = document.getElementById('status-text')
  if (el) el.textContent = text
}

// ---------------------------------------------------------------- exporting

function dataUrlToBlob(dataURL: string): Blob {
  const binary = atob(dataURL.slice(dataURL.indexOf(',') + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: 'image/png' })
}

async function produceDataUrl(): Promise<string> {
  if (!cache) throw new Error('nothing rendered yet')
  return exportCanvasPng(cache)
}

async function exportImage(action: 'save' | 'copy'): Promise<void> {
  try {
    const t0 = performance.now()
    const dataURL = await produceDataUrl()
    const ms = Math.round(performance.now() - t0)
    if (action === 'save') {
      vscode.postMessage({ type: 'saveImage', dataURL })
      setStatus(`已生成，请在弹出的保存对话框中选择位置（${ms} ms）`)
    } else {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': dataUrlToBlob(dataURL) })])
      flashFx()
      setStatus(`已复制到剪贴板（${ms} ms，${Math.round((dataURL.length * 3) / 4 / 1024)} KB）——现在可去任意位置 Ctrl+V 粘贴`)
    }
  } catch (err) {
    setStatus(`❌ 导出失败: ${String(err)}`)
    vscode.postMessage({ type: 'notify', level: 'error', text: `Export failed: ${String(err)}` })
  }
}

/** F8: generate the SVG source and hand it to the host for a save dialog. */
function exportSvgFile(): void {
  try {
    if (!cache) throw new Error('nothing rendered yet')
    const t0 = performance.now()
    const svg = exportSvgString(cache)
    const ms = Math.round(performance.now() - t0)
    vscode.postMessage({ type: 'saveSvg', svg })
    const kb = Math.round(svg.length / 1024)
    setStatus(`已生成 SVG（矢量，${ms} ms，${kb} KB），请在弹出的保存对话框中选择位置`)
  } catch (err) {
    setStatus(`❌ SVG 导出失败: ${String(err)}`)
    vscode.postMessage({ type: 'notify', level: 'error', text: `SVG export failed: ${String(err)}` })
  }
}

function flashFx(): void {
  const flash = document.getElementById('flash-fx')!
  flash.style.display = 'block'
  flash.style.opacity = '0'
  setTimeout(() => {
    flash.style.display = 'none'
    flash.style.opacity = '1'
  }, 400)
}

// ---------------------------------------------------------------- bootstrap

window.addEventListener('message', ({ data }: MessageEvent<HostMessage>) => {
  if (data.type === 'update') {
    // A different source document invalidates the session title override.
    if (data.request.documentKey !== state.lastDocKey) {
      state.titleOverride = null
      state.lastDocKey = data.request.documentKey
    }
    // Every update is a new snapshot: old line indices no longer map to the
    // marked code, so F7 marks never leak across selections (plan §四).
    state.lineMarks = {}
    state.request = data.request
    state.style = data.style
    state.themeContext = data.themeContext
  } else if (data.type === 'style') {
    state.style = data.style
    state.themeContext = data.themeContext
  } else {
    return
  }
  rerender().catch((err) => {
    setStatus(`❌ 渲染失败: ${String(err)}`)
    vscode.postMessage({ type: 'notify', level: 'error', text: `Open Code Snap render error: ${String(err)}` })
  })
})

buildShell()
vscode.postMessage({ type: 'ready' })
