import './style.css'
import type { HostMessage, SnippetRequest, StyleConfig, ThemeContext, WebviewMessage } from '../src/core/protocol'
import { DEFAULT_STYLE } from '../src/core/model'
import { layoutCode, maxLineNumber, type LayoutedCode } from '../src/core/layout'
import { highlightCode, type HighlightResult } from '../src/core/highlight'
import { resolveTheme, CURATED_THEMES } from '../src/core/theme-map'
import { CURATED_LANGUAGES } from '../src/core/languages'
import { gutterWidth, setMeasureTextImpl } from '../src/core/geometry'
import { renderPreview } from './preview'
import { exportCanvasPng } from './export/canvas'
import { exportDomPng } from './export/domtoimage'

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
}

const state: State = {
  request: null,
  style: { ...DEFAULT_STYLE },
  themeContext: { editorThemeName: '' },
  titleOverride: null,
  lastDocKey: '',
}

interface RenderCache {
  layout: LayoutedCode
  highlight: HighlightResult
  style: StyleConfig
  gutterWidth: number
  themeId: string
  windowTitle: string
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

function buildShell(): void {
  app.replaceChildren()

  const toolbar = document.createElement('div')
  toolbar.id = 'toolbar'

  const themeSelect = document.createElement('select')
  themeSelect.id = 'ctl-theme'
  themeSelect.title = 'Theme'
  const follow = document.createElement('option')
  follow.value = ''
  follow.textContent = '跟随编辑器主题'
  themeSelect.appendChild(follow)
  for (const id of CURATED_THEMES) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = id
    themeSelect.appendChild(opt)
  }
  themeSelect.addEventListener('change', () => {
    writeSetting('theme', themeSelect.value)
  })

  const langSelect = document.createElement('select')
  langSelect.id = 'ctl-lang'
  langSelect.title = 'Language override'
  for (const { id, label } of CURATED_LANGUAGES) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = label
    langSelect.appendChild(opt)
  }
  langSelect.addEventListener('change', () => {
    writeSetting('languageOverride', langSelect.value)
  })

  const lineNoSelect = document.createElement('select')
  lineNoSelect.id = 'ctl-lineno'
  lineNoSelect.title = 'Line numbers'
  for (const [value, label] of [
    ['off', '无行号'],
    ['relative', '相对行号'],
    ['real', '真实行号'],
  ] as const) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    lineNoSelect.appendChild(opt)
  }
  lineNoSelect.addEventListener('change', () => {
    writeSetting('lineNumbers', lineNoSelect.value)
  })

  const windowSelect = document.createElement('select')
  windowSelect.id = 'ctl-window'
  windowSelect.title = 'Window style'
  for (const [value, label] of [
    ['macos', 'macOS 窗口'],
    ['windows', 'Windows 窗口'],
    ['none', '无窗口'],
  ] as const) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    windowSelect.appendChild(opt)
  }
  windowSelect.addEventListener('change', () => {
    writeSetting('windowStyle', windowSelect.value)
  })

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

  const engineSelect = document.createElement('select')
  engineSelect.id = 'ctl-engine'
  engineSelect.title = 'Export engine'
  for (const [value, label] of [
    ['canvas', 'Canvas 引擎'],
    ['dom', 'DOM 引擎'],
  ] as const) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    engineSelect.appendChild(opt)
  }
  engineSelect.addEventListener('change', () => {
    writeSetting('exportEngine', engineSelect.value)
  })

  const scaleSelect = document.createElement('select')
  scaleSelect.id = 'ctl-scale'
  scaleSelect.title = 'Export scale'
  for (const s of [1, 2, 3] as const) {
    const opt = document.createElement('option')
    opt.value = String(s)
    opt.textContent = `${s}x`
    scaleSelect.appendChild(opt)
  }
  scaleSelect.addEventListener('change', () => {
    writeSetting('exportScale', Number(scaleSelect.value))
  })

  const btnSave = document.createElement('button')
  btnSave.id = 'btn-save'
  btnSave.textContent = '保存 PNG'
  btnSave.addEventListener('click', () => void exportImage('save'))

  const btnCopy = document.createElement('button')
  btnCopy.id = 'btn-copy'
  btnCopy.textContent = '复制到剪贴板'
  btnCopy.addEventListener('click', () => void exportImage('copy'))

  const btnBench = document.createElement('button')
  btnBench.id = 'btn-bench'
  btnBench.className = 'ghost'
  btnBench.textContent = '双引擎计时'
  btnBench.title = 'M0: measure both export engines'
  btnBench.addEventListener('click', () => void runBenchmark())

  toolbar.append(
    themeSelect,
    langSelect,
    lineNoSelect,
    windowSelect,
    transparentLabel,
    engineSelect,
    scaleSelect,
    btnSave,
    btnCopy,
    btnBench
  )

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
  }

  const preview = document.getElementById('preview')!
  renderPreview(preview, {
    layout,
    highlight,
    style,
    windowTitle,
    gutterWidth: cache.gutterWidth,
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
  const engineSelect = document.getElementById('ctl-engine') as HTMLSelectElement
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
  engineSelect.value = style.exportEngine
  scaleSelect.value = String(style.exportScale)
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
  const style = cache.style
  if (style.exportEngine === 'dom') {
    const stage = document.getElementById('stage')
    if (!stage) throw new Error('preview not ready')
    return exportDomPng(stage, style)
  }
  return exportCanvasPng(cache)
}

async function exportImage(action: 'save' | 'copy'): Promise<void> {
  try {
    const t0 = performance.now()
    const dataURL = await produceDataUrl()
    const ms = Math.round(performance.now() - t0)
    if (action === 'save') {
      vscode.postMessage({ type: 'saveImage', dataURL })
      setStatus(`已生成，请在弹出的保存对话框中选择位置（${cache!.style.exportEngine} 引擎，${ms} ms）`)
    } else {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': dataUrlToBlob(dataURL) })])
      flashFx()
      setStatus(`已复制到剪贴板（${cache!.style.exportEngine} 引擎，${ms} ms，${Math.round((dataURL.length * 3) / 4 / 1024)} KB）——现在可去任意位置 Ctrl+V 粘贴`)
    }
  } catch (err) {
    setStatus(`❌ 导出失败: ${String(err)}`)
    vscode.postMessage({ type: 'notify', level: 'error', text: `Export failed: ${String(err)}` })
  }
}

/** M0 acceptance: measure both engines on the current snippet. */
async function runBenchmark(): Promise<void> {
  if (!cache || cache.layout.lines.length === 0) {
    setStatus('没有可导出的代码')
    return
  }
  const stage = document.getElementById('stage')!
  const style = cache.style

  const t1 = performance.now()
  const canvasUrl = exportCanvasPng(cache)
  const canvasMs = Math.round(performance.now() - t1)

  const t2 = performance.now()
  const domUrl = await exportDomPng(stage, { ...style, exportEngine: 'dom' })
  const domMs = Math.round(performance.now() - t2)

  const canvasKB = Math.round((canvasUrl.length * 3) / 4 / 1024)
  const domKB = Math.round((domUrl.length * 3) / 4 / 1024)
  setStatus(`⏱ canvas: ${canvasMs} ms / ${canvasKB} KB  ·  dom: ${domMs} ms / ${domKB} KB（${cache.layout.lines.length} 行）`)
  console.table({ canvas: { ms: canvasMs, KB: canvasKB }, dom: { ms: domMs, KB: domKB } })
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
