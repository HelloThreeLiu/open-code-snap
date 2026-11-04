import './style.css'
import type { HostMessage, SnippetRequest, StyleConfig, ThemeContext, WebviewMessage } from '../src/core/protocol'
import { DEFAULT_STYLE } from '../src/core/model'
import { layoutCode, type LayoutedCode } from '../src/core/layout'
import { highlightCode, type HighlightResult } from '../src/core/highlight'
import { resolveTheme, CURATED_THEMES } from '../src/core/theme-map'
import { gutterWidth } from '../src/core/geometry'
import { renderPreview } from './preview'
import { exportCanvasPng } from './export/canvas'
import { exportDomPng } from './export/domtoimage'

declare function acquireVsCodeApi(): { postMessage(msg: WebviewMessage): void }

const vscode = acquireVsCodeApi()
const app = document.getElementById('app')!

interface State {
  request: SnippetRequest | null
  style: StyleConfig
  themeContext: ThemeContext
  /** Webview-local overrides (toolbar), survive host style pushes. */
  overrides: Partial<StyleConfig>
}

const state: State = {
  request: null,
  style: { ...DEFAULT_STYLE },
  themeContext: { editorThemeName: '' },
  overrides: {},
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

function effectiveStyle(): StyleConfig {
  return { ...state.style, ...state.overrides }
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
    state.overrides.theme = themeSelect.value
    void rerender()
  })

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
    state.overrides.exportEngine = engineSelect.value as StyleConfig['exportEngine']
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
    state.overrides.exportScale = Number(scaleSelect.value) as StyleConfig['exportScale']
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

  toolbar.append(themeSelect, engineSelect, scaleSelect, btnSave, btnCopy, btnBench)

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
  const style = effectiveStyle()

  const layout = state.request
    ? layoutCode(state.request.code, {
        tabSize: state.request.font.tabSize,
        startLine: state.request.startLine,
      })
    : { lines: [] }

  const resolved = resolveTheme(state.themeContext.editorThemeName)
  const themeId = style.theme || resolved.id

  const highlight = await highlightCode(layout, state.request?.languageId ?? 'text', themeId)
  if (seq !== renderSeq) return // a newer update arrived meanwhile

  const maxNo = layout.lines.length
    ? style.realLineNumbers && state.request
      ? state.request.startLine + layout.lines.length
      : layout.lines.length
    : 0

  cache = {
    layout,
    highlight,
    style,
    gutterWidth: gutterWidth(maxNo, style),
    themeId,
    windowTitle: state.request?.windowTitle ?? '',
  }

  const preview = document.getElementById('preview')!
  renderPreview(preview, {
    layout,
    highlight,
    style,
    windowTitle: cache.windowTitle,
    gutterWidth: cache.gutterWidth,
  })

  syncToolbar(style)
  setStatus(
    !state.request
      ? '等待代码选区…'
      : `${layout.lines.length} 行 · ${themeId}${style.theme ? '' : resolved.exact ? '（已匹配编辑器主题）' : `（编辑器主题 "${state.themeContext.editorThemeName}" 未精确映射，已回退）`}`
  )
  if (state.request && !style.theme && !resolved.exact) {
    vscode.postMessage({ type: 'notify', level: 'info', text: `Open Code Snap: 编辑器主题 "${state.themeContext.editorThemeName}" 暂无精确映射，已回退到 ${resolved.id}。` })
  }
}

function syncToolbar(style: StyleConfig): void {
  const themeSelect = document.getElementById('ctl-theme') as HTMLSelectElement
  const engineSelect = document.getElementById('ctl-engine') as HTMLSelectElement
  const scaleSelect = document.getElementById('ctl-scale') as HTMLSelectElement
  themeSelect.value = style.theme
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
