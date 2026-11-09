import './style.css'
import type { HostMessage, SnippetRequest, StyleConfig, ThemeContext, WebviewMessage } from '../src/core/protocol'
import { DEFAULT_STYLE } from '../src/core/model'
import { layoutCode, maxLineNumber, type LayoutedCode } from '../src/core/layout'
import { highlightCode, type HighlightResult } from '../src/core/highlight'
import { resolveTheme, CURATED_THEMES } from '../src/core/theme-map'
import { CURATED_LANGUAGES } from '../src/core/languages'
import { gutterWidth, setMeasureTextImpl, setMeasureFontBoxImpl } from '../src/core/geometry'
import { nextMark, type LineMark } from '../src/core/diff'
import { addMasks, maskContaining, removeMask, normalizeMasks, type MaskRange } from '../src/core/mask'
import { t, type Locale } from '../src/core/i18n'
import { renderPreview } from './preview'
import { exportCanvasPng, type CanvasExportResult } from './export/canvas'
import { exportSvgString } from './export/svg'

declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewMessage): void
  /** Webview-local persistence: survives panel reloads, not panel closes. */
  getState(): unknown
  setState(state: unknown): void
}

// Wire the DOM-backed text measurement into core geometry, which itself
// stays DOM-free (hang-③): must run before any render/layout happens.
let measureCtx: CanvasRenderingContext2D | null = null
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!
  return measureCtx
}
setMeasureTextImpl((text, font) => {
  const ctx = getMeasureCtx()
  ctx.font = font
  return ctx.measureText(text).width
})
// F10: font content-area metrics so mask blocks match the DOM inline box.
setMeasureFontBoxImpl((font) => {
  const ctx = getMeasureCtx()
  ctx.font = font
  const m = ctx.measureText('Xg')
  const ascent = m.fontBoundingBoxAscent
  const descent = m.fontBoundingBoxDescent
  if (ascent == null || descent == null) {
    // Older Chromium without font metrics: a typical monospace box.
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 14)
    return { ascent: size * 0.8, descent: size * 0.2 }
  }
  return { ascent, descent }
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
  /** F10 redaction ranges; session-level like lineMarks. */
  masks: MaskRange[]
  /** F9 preset names pushed by the host. */
  presets: string[]
}

const state: State = {
  request: null,
  style: { ...DEFAULT_STYLE },
  themeContext: { editorThemeName: '', uiLocale: 'en' },
  titleOverride: null,
  lastDocKey: '',
  lineMarks: {},
  masks: [],
  presets: [],
}

/**
 * F12: the locale the shell was BUILT with. Toolbar labels are baked into
 * DOM at buildShell() time; a host push carrying a different locale rebuilds
 * the shell (status strings re-translate on their own every render).
 */
let currentLocale: Locale = 'en'

/** Convenience: translate against the current shell locale. */
function tr(key: Parameters<typeof t>[1], params?: Record<string, string | number>): string {
  return t(currentLocale, key, params)
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
  /** F10 masks at render time; exports consume the same list. */
  masks: MaskRange[]
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
    tr('title.theme'),
    [['', tr('theme.follow')], ...CURATED_THEMES.map((id) => [id, id] as const)],
    (v) => writeSetting('theme', v)
  )

  const langSelect = makeSelect(
    'ctl-lang',
    tr('title.lang'),
    [['', tr('lang.auto')], ...CURATED_LANGUAGES.map(({ id, label }) => [id, label] as const)],
    (v) => writeSetting('languageOverride', v)
  )

  const lineNoSelect = makeSelect(
    'ctl-lineno',
    tr('title.lineno'),
    [
      ['off', tr('lineno.off')],
      ['relative', tr('lineno.relative')],
      ['real', tr('lineno.real')],
    ],
    (v) => writeSetting('lineNumbers', v)
  )

  const windowSelect = makeSelect(
    'ctl-window',
    tr('title.window'),
    [
      ['macos', tr('window.macos')],
      ['windows', tr('window.windows')],
      ['none', tr('window.none')],
    ],
    (v) => writeSetting('windowStyle', v)
  )

  const transparentLabel = document.createElement('label')
  transparentLabel.id = 'ctl-transparent'
  const transparent = document.createElement('input')
  transparent.type = 'checkbox'
  transparent.title = tr('transparent.title')
  transparent.addEventListener('change', () => {
    writeSetting('transparentBackground', transparent.checked)
  })
  const transparentText = document.createElement('span')
  transparentText.textContent = tr('transparent.label')
  transparentLabel.append(transparent, transparentText)

  const scaleSelect = makeSelect(
    'ctl-scale',
    tr('scale.title'),
    [
      ['1', '1x'],
      ['2', '2x'],
      ['3', '3x'],
    ],
    (v) => writeSetting('exportScale', Number(v))
  )

  // F10: applies the last preview text selection as redaction masks. The
  // selection is captured on `selectionchange` because mousedown on this
  // button collapses it before the click lands.
  const btnMask = document.createElement('button')
  btnMask.id = 'btn-mask'
  btnMask.textContent = tr('btn.mask')
  btnMask.title = tr('title.mask')
  btnMask.disabled = true
  btnMask.addEventListener('click', () => {
    if (pendingMasks.length === 0) return
    const before = state.masks.length
    state.masks = addMasks(state.masks, pendingMasks)
    clearPendingMasks()
    // Report THIS application's count, not the session total (review N-1).
    setStatus(tr('status.masked', { n: state.masks.length - before, total: state.masks.length }))
    void rerender()
  })

  const btnSave = document.createElement('button')
  btnSave.id = 'btn-save'
  btnSave.textContent = tr('btn.savePng')
  btnSave.addEventListener('click', () => void exportImage('save'))

  const btnSaveSvg = document.createElement('button')
  btnSaveSvg.id = 'btn-save-svg'
  btnSaveSvg.textContent = tr('btn.saveSvg')
  btnSaveSvg.title = tr('title.saveSvg')
  btnSaveSvg.addEventListener('click', () => void exportSvgFile())

  const btnCopy = document.createElement('button')
  btnCopy.id = 'btn-copy'
  btnCopy.textContent = tr('btn.copy')
  btnCopy.addEventListener('click', () => void exportImage('copy'))

  row1.append(themeSelect, langSelect, lineNoSelect, windowSelect, transparentLabel, scaleSelect, btnMask, btnSave, btnSaveSvg, btnCopy)

  // --- row 2: backdrop & watermark (F5/F6) ---
  const row2 = document.createElement('div')
  row2.className = 'toolbar-row'

  const bgTypeSelect = makeSelect(
    'ctl-bgtype',
    tr('title.bgtype'),
    [
      ['solid', tr('bgtype.solid')],
      ['gradient', tr('bgtype.gradient')],
      ['grid', tr('bgtype.grid')],
      ['dots', tr('bgtype.dots')],
    ],
    (v) => writeSetting('backgroundType', v)
  )

  const gradA = makeColorInput('ctl-grad-a', tr('title.gradA'), (v) => writeSetting('gradientColorA', v))
  const gradB = makeColorInput('ctl-grad-b', tr('title.gradB'), (v) => writeSetting('gradientColorB', v))
  const gradAngle = makeNumberInput('ctl-grad-angle', tr('title.gradAngle'), 0, 360, 5, (v) =>
    writeSetting('gradientAngle', v)
  )

  const wmText = document.createElement('input')
  wmText.id = 'ctl-wm-text'
  wmText.type = 'text'
  wmText.title = tr('title.wmText')
  wmText.placeholder = tr('wm.placeholder')
  wmText.addEventListener('change', () => writeSetting('watermarkText', wmText.value))

  const wmPos = makeSelect(
    'ctl-wm-pos',
    tr('title.wmPos'),
    [
      ['top-left', tr('wmpos.topLeft')],
      ['top-right', tr('wmpos.topRight')],
      ['bottom-left', tr('wmpos.bottomLeft')],
      ['bottom-right', tr('wmpos.bottomRight')],
      ['tile', tr('wmpos.tile')],
    ],
    (v) => writeSetting('watermarkPosition', v)
  )
  const wmSize = makeNumberInput('ctl-wm-size', tr('title.wmSize'), 8, 72, 1, (v) => writeSetting('watermarkFontSize', v))
  const wmOpacity = makeNumberInput('ctl-wm-opacity', tr('title.wmOpacity'), 0.05, 1, 0.05, (v) =>
    writeSetting('watermarkOpacity', v)
  )

  // --- F9 presets: an action menu, always bounces back to the placeholder ---
  const presetSelect = makeSelect('ctl-preset', tr('preset.placeholder'), [['', tr('preset.placeholder')]], () => {})
  presetSelect.addEventListener('change', () => {
    const v = presetSelect.value
    presetSelect.value = ''
    if (!v || v === '---') return
    switch (v) {
      case '__save__':
        vscode.postMessage({ type: 'savePreset' })
        break
      case '__export__':
        vscode.postMessage({ type: 'exportPreset' })
        break
      case '__import__':
        vscode.postMessage({ type: 'importPreset' })
        break
      case '__delete__':
        vscode.postMessage({ type: 'deletePreset' })
        break
      default:
        if (v.startsWith('apply:')) {
          vscode.postMessage({ type: 'applyPreset', name: v.slice('apply:'.length) })
        }
    }
  })

  row2.append(bgTypeSelect, gradA, gradB, gradAngle, toolbarSep(), wmText, wmPos, wmSize, wmOpacity, toolbarSep(), presetSelect)
  rebuildPresetOptions()

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
  status.textContent = tr('status.waiting')
  statusbar.appendChild(status)

  const flash = document.createElement('div')
  flash.id = 'flash-fx'
  flash.style.display = 'none'

  app.append(toolbar, previewWrap, statusbar, flash)
}

// ---------------------------------------------------------------- F10 masks

/**
 * Session content state persisted via webview setState (review F5 finding:
 * a panel reload used to silently drop masks, and the next export shipped
 * unmasked secrets). Restored only when the incoming snapshot matches the
 * persisted one exactly (documentKey + code + tabSize — the layout the
 * coordinates were measured against).
 */
interface SavedSession {
  docKey: string
  code: string
  tabSize: number
  titleOverride: string | null
  lineMarks: Record<number, LineMark>
  masks: MaskRange[]
}

function persistSession(): void {
  vscode.setState({
    docKey: state.lastDocKey,
    code: state.request?.code ?? '',
    tabSize: state.request?.font.tabSize ?? 0,
    titleOverride: state.titleOverride,
    lineMarks: state.lineMarks,
    masks: state.masks,
  } satisfies SavedSession)
}

function restoreSession(request: SnippetRequest): void {
  const saved = vscode.getState() as SavedSession | undefined
  if (
    !saved ||
    saved.docKey !== request.documentKey ||
    saved.code !== request.code ||
    saved.tabSize !== request.font.tabSize
  ) {
    return
  }
  state.titleOverride = saved.titleOverride ?? null
  state.lineMarks = saved.lineMarks ?? {}
  state.masks = saved.masks ?? []
}

/**
 * Last preview text selection mapped to mask ranges. Kept across collapses
 * so the toolbar button (whose mousedown kills the selection) still works.
 */
let pendingMasks: MaskRange[] = []

/** Drop the pending selection and disable the button (review M-1: the
 *  pending ranges must die with the code they were measured against). */
function clearPendingMasks(): void {
  pendingMasks = []
  const btn = document.getElementById('btn-mask') as HTMLButtonElement | null
  if (btn) btn.disabled = true
}

/** Resolve the layouted line/col of a DOM selection boundary. */
function locatePoint(node: Node, offset: number): { line: number; col: number } | null {
  const row = (
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  )?.closest('.line') as HTMLElement | null
  if (!row || row.dataset.line === undefined) return null
  const lc = row.querySelector('.lc')
  if (!lc || !lc.contains(node)) return null
  const line = Number(row.dataset.line)
  if (node.nodeType === Node.TEXT_NODE) {
    const span = node.parentElement?.closest<HTMLElement>('[data-col]')
    if (!span || !lc.contains(span)) return null
    return { line, col: Number(span.dataset.col) + offset }
  }
  // Element boundary: the child at `offset` marks the point; past the last
  // child means the end of the line content.
  const child = node.childNodes[offset]
  if (!child) {
    const self = (node as Element).closest?.<HTMLElement>('[data-end]')
    if (self) return { line, col: Number(self.dataset.end) }
    const spans = lc.querySelectorAll<HTMLElement>('[data-col]')
    const last = spans[spans.length - 1]
    return last ? { line, col: Number(last.dataset.end) } : null
  }
  const el = (child instanceof Element ? child : child.parentElement)?.closest<HTMLElement>(
    '[data-col]'
  )
  if (!el || !lc.contains(el)) return null
  return { line, col: Number(el.dataset.col) }
}

/** Map the current DOM selection to normalized mask ranges (F10). */
function selectionToMasks(): MaskRange[] {
  const sel = document.getSelection()
  const lines = cache?.layout.lines
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !lines) return []
  const out: MaskRange[] = []
  for (let r = 0; r < sel.rangeCount; r++) {
    const range = sel.getRangeAt(r)
    const a = locatePoint(range.startContainer, range.startOffset)
    const b = locatePoint(range.endContainer, range.endOffset)
    if (!a || !b) continue
    if (a.line === b.line) {
      if (b.col > a.col) out.push({ line: a.line, start: a.col, end: b.col })
      continue
    }
    // Range start always precedes its end in document order; middle lines
    // are masked whole. Ranges are clamped to the layouted text (blank
    // lines — the `&nbsp;` placeholder — drop out naturally).
    const clamp = (line: number, start: number, end: number): void => {
      const len = lines[line]?.text.length ?? 0
      const capped = Math.min(end, len)
      if (capped > start) out.push({ line, start, end: capped })
    }
    clamp(a.line, a.col, lines[a.line]?.text.length ?? 0)
    for (let l = a.line + 1; l < b.line; l++) clamp(l, 0, lines[l]?.text.length ?? 0)
    clamp(b.line, 0, b.col)
  }
  return normalizeMasks(out)
}

document.addEventListener('selectionchange', () => {
  const btn = document.getElementById('btn-mask') as HTMLButtonElement | null
  if (!btn) return
  const ranges = selectionToMasks()
  if (ranges.length > 0) {
    pendingMasks = ranges
    btn.disabled = false
  } else if (!document.getSelection()?.isCollapsed) {
    // A real (non-collapsed) selection that maps to nothing — in the title
    // bar or toolbar — invalidates the stale pending ranges.
    clearPendingMasks()
  }
  // Collapsed selection: keep pending — clicking the button collapses the
  // selection first, and the click must still apply it.
})

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
    masks: state.masks,
  }

  const preview = document.getElementById('preview')!
  renderPreview(preview, {
    layout,
    highlight,
    style,
    windowTitle,
    gutterWidth: cache.gutterWidth,
    lineMarks: state.lineMarks,
    masks: state.masks,
    uiLocale: state.themeContext.uiLocale,
    // F10: click on a masked segment restores its covered range.
    onUnmask: (line, start, end) => {
      const target = maskContaining(state.masks, line, start, end - start)
      if (target) {
        state.masks = removeMask(state.masks, target)
        void rerender()
      }
    },
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
      persistSession()
    },
    onTitleChange: (text) => {
      state.titleOverride = text
      if (cache) cache.windowTitle = text
      void rerender()
    },
  })

  syncToolbar(style)
  const locale = state.themeContext.uiLocale
  const themeNote = style.theme
    ? ''
    : resolved.exact
      ? t(locale, 'status.themeExact')
      : resolved.approx
        ? t(locale, 'status.themeApprox', { editor: state.themeContext.editorThemeName, id: themeId })
        : t(locale, 'status.themeFallback', { editor: state.themeContext.editorThemeName })
  // The mask count stays visible on EVERY status line: an export while the
  // counter is absent cannot silently ship unmasked secrets (F5 finding).
  const maskNote = state.masks.length > 0 ? t(locale, 'status.maskCount', { n: state.masks.length }) : ''
  // Slim build: an unbundled language degrades to plain text — say so.
  const langNote = highlight.langFallback ? t(locale, 'status.langFallback', { lang: highlight.langFallback }) : ''
  // F11: past ~1000 lines exports slow down and canvases may clamp — hint at
  // splitting instead of failing the user later.
  const longNote = layout.lines.length > 1000 ? t(locale, 'status.longHint') : ''
  setStatus(
    !state.request
      ? t(locale, 'status.waiting')
      : `${t(locale, 'status.lines', { n: layout.lines.length })} · ${themeId}${themeNote}${langNote}${longNote}${maskNote}`
  )
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
    vscode.postMessage({
      type: 'notify',
      level: 'info',
      text: t(locale, 'notify.themeFallback', { editor: state.themeContext.editorThemeName, id: resolved.id }),
    })
  }
  persistSession()
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

/** F9: rebuild the preset menu from the host-pushed name list. */
function rebuildPresetOptions(): void {
  const select = document.getElementById('ctl-preset') as HTMLSelectElement | null
  if (!select) return
  select.replaceChildren()
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = tr('preset.placeholder')
  select.appendChild(placeholder)
  for (const name of state.presets) {
    const opt = document.createElement('option')
    // Prefixed value space: a preset literally named "__save__" or "---"
    // must not collide with the action sentinels (review m-4).
    opt.value = `apply:${name}`
    opt.textContent = name
    select.appendChild(opt)
  }
  if (state.presets.length > 0) {
    const sep = document.createElement('option')
    sep.value = '---'
    sep.disabled = true
    sep.textContent = tr('preset.sep')
    select.appendChild(sep)
  }
  for (const [value, key] of [
    ['__save__', 'preset.save'],
    ['__export__', 'preset.export'],
    ['__import__', 'preset.import'],
    ['__delete__', 'preset.delete'],
  ] as const) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = tr(key)
    select.appendChild(opt)
  }
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

async function produceDataUrl(): Promise<CanvasExportResult> {
  if (!cache) throw new Error('nothing rendered yet')
  return exportCanvasPng(cache)
}

async function exportImage(action: 'save' | 'copy'): Promise<void> {
  try {
    const t0 = performance.now()
    const { dataURL, effectiveScale } = await produceDataUrl()
    const ms = Math.round(performance.now() - t0)
    // F11: a clamped scale must be visible, not silent.
    const scaleNote =
      cache && effectiveScale !== cache.style.exportScale
        ? tr('status.scaleNote', { from: cache.style.exportScale, to: effectiveScale })
        : ''
    // The split hint survives the export status too (review n-4).
    const longNote = cache && cache.layout.lines.length > 1000 ? tr('status.longNote') : ''
    if (action === 'save') {
      vscode.postMessage({ type: 'saveImage', dataURL })
      setStatus(tr('status.saved', { note: scaleNote + longNote, ms }))
    } else {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': dataUrlToBlob(dataURL) })])
      flashFx()
      setStatus(
        tr('status.copied', {
          note: scaleNote + longNote,
          ms,
          kb: Math.round((dataURL.length * 3) / 4 / 1024),
        })
      )
    }
  } catch (err) {
    setStatus(tr('error.export', { err: String(err) }))
    vscode.postMessage({ type: 'notify', level: 'error', text: tr('error.export', { err: String(err) }) })
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
    // Blob size counts UTF-8 bytes; svg.length would overcount CJK titles.
    const kb = Math.round(new Blob([svg]).size / 1024)
    setStatus(tr('status.savedSvg', { ms, kb }))
  } catch (err) {
    setStatus(tr('error.svgExport', { err: String(err) }))
    vscode.postMessage({ type: 'notify', level: 'error', text: tr('error.svgExport', { err: String(err) }) })
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
  if (data.type === 'update' || data.type === 'style') {
    // F12: a locale change must rebuild the shell — toolbar labels were
    // baked into the DOM at build time.
    if (data.themeContext.uiLocale !== currentLocale) {
      currentLocale = data.themeContext.uiLocale
      buildShell()
      // buildShell resets the mask button; pending ranges survive a rebuild
      // by design, so restore the enabled state (review N-1).
      const btn = document.getElementById('btn-mask') as HTMLButtonElement | null
      if (btn) btn.disabled = pendingMasks.length === 0
    }
  }
  if (data.type === 'update') {
    // A different source document invalidates the session title override.
    if (data.request.documentKey !== state.lastDocKey) {
      state.titleOverride = null
      state.lastDocKey = data.request.documentKey
    }
    // F7 marks are per-snapshot: drop them only when the code itself changed —
    // a style-only push (theme, watermark…) re-sends the same request and
    // must keep the user's marks (review M-5). F10 masks follow the same
    // session semantics.
    if (!state.request || state.request.code !== data.request.code) {
      state.lineMarks = {}
      state.masks = []
      // Pending ranges were measured against the OLD layout — a stale click
      // would mask wrong coordinates in the new code (review M-1).
      clearPendingMasks()
    }
    // After clearing: a panel reload wipes webview memory, so restore the
    // session state when the incoming snapshot is the exact one persisted
    // (F5 finding — masks must survive a reload, not silently vanish).
    restoreSession(data.request)
    state.request = data.request
    state.style = data.style
    state.themeContext = data.themeContext
  } else if (data.type === 'style') {
    state.style = data.style
    state.themeContext = data.themeContext
  } else if (data.type === 'presets') {
    state.presets = data.names
    rebuildPresetOptions()
    return
  } else {
    return
  }
  rerender().catch((err) => {
    setStatus(tr('error.render', { err: String(err) }))
    vscode.postMessage({ type: 'notify', level: 'error', text: tr('error.render', { err: String(err) }) })
  })
})

buildShell()
vscode.postMessage({ type: 'ready' })
