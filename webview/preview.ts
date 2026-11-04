import type { LayoutedCode, LayoutedLine } from '../src/core/layout'
import { lineNumberFor } from '../src/core/layout'
import type { HighlightResult } from '../src/core/highlight'
import type { StyleConfig } from '../src/core/protocol'
import { stageInsets, titleBarHeight, WINDOW_INNER_PAD, GUTTER_GAP } from '../src/core/geometry'

/**
 * Render the preview DOM. Everything the dom-to-image exporter captures
 * lives under #stage; the canvas exporter reads the same inputs instead.
 */
export function renderPreview(
  container: HTMLElement,
  input: {
    layout: LayoutedCode
    highlight: HighlightResult
    style: StyleConfig
    windowTitle: string
    /** Measured gutter width, shared with the canvas exporter. */
    gutterWidth: number
  }
): HTMLElement {
  const { layout, highlight, style, windowTitle, gutterWidth } = input
  container.replaceChildren()

  const stage = document.createElement('div')
  stage.id = 'stage'
  const insets = stageInsets(style)
  stage.style.padding = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`
  stage.style.background = style.transparentBackground
    ? 'transparent'
    : style.backgroundColor

  const win = document.createElement('div')
  win.id = 'window'
  win.style.borderRadius = `${style.borderRadius}px`
  win.style.boxShadow = `${style.shadowColor} 0 ${style.shadowOffsetY}px ${style.shadowBlur}px`
  win.style.background = highlight.colors.bg
  win.style.fontFamily = style.fontFamily || 'Consolas, monospace'
  win.style.fontSize = `${style.fontSize}px`
  win.style.lineHeight = String(style.lineHeight)
  win.style.fontVariantLigatures = style.ligatures ? 'normal' : 'none'

  if (titleBarHeight(style) > 0) {
    win.appendChild(buildTitleBar(style, windowTitle, highlight.colors.fg))
  }

  const code = document.createElement('div')
  code.id = 'code'
  code.style.padding = `${WINDOW_INNER_PAD}px`
  if (layout.lines.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'placeholder'
    empty.textContent = 'Select some code in the editor ✂️'
    code.appendChild(empty)
  } else {
    layout.lines.forEach((line, i) => {
      code.appendChild(buildLine(line, highlight.lines[i], style, highlight.colors.fg, gutterWidth))
    })
  }
  win.appendChild(code)
  stage.appendChild(win)
  container.appendChild(stage)
  return stage
}

function buildTitleBar(style: StyleConfig, windowTitle: string, fg: string): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'titlebar'
  bar.style.height = `${titleBarHeight(style)}px`

  if (style.windowStyle === 'macos') {
    const dots = document.createElement('div')
    dots.className = 'traffic-lights'
    for (const color of ['#ff5f57', '#febc2e', '#28c840']) {
      const dot = document.createElement('span')
      dot.className = 'dot'
      dot.style.background = color
      dots.appendChild(dot)
    }
    bar.appendChild(dots)
  }

  if (style.showWindowTitle) {
    const title = document.createElement('span')
    title.className = 'title'
    title.style.color = fg
    title.style.opacity = '0.55'
    title.textContent = windowTitle
    bar.appendChild(title)
  }

  if (style.windowStyle === 'windows') {
    const buttons = document.createElement('div')
    buttons.className = 'win-buttons'
    buttons.style.color = fg
    buttons.append(...['–', '▢', '✕'].map((glyph) => {
      const b = document.createElement('span')
      b.textContent = glyph
      return b
    }))
    bar.appendChild(buttons)
  }
  return bar
}

function buildLine(
  line: LayoutedLine,
  themed: { tokens: { text: string; color: string; italic: boolean; bold: boolean }[] } | undefined,
  style: StyleConfig,
  fg: string,
  gutterW: number
): HTMLElement {
  const row = document.createElement('div')
  row.className = 'line'

  if (style.showLineNumbers) {
    const ln = document.createElement('span')
    ln.className = 'ln'
    ln.style.color = fg
    ln.style.opacity = '0.45'
    ln.style.display = 'inline-block'
    ln.style.width = `${gutterW - GUTTER_GAP}px`
    ln.style.marginRight = `${GUTTER_GAP}px`
    ln.style.textAlign = 'right'
    ln.textContent = String(lineNumberFor(line, style.realLineNumbers))
    row.appendChild(ln)
  }

  const lc = document.createElement('span')
  lc.className = 'lc'
  lc.style.whiteSpace = 'pre'
  if (!themed || themed.tokens.length === 0) {
    // Blank line: keep the row height stable.
    lc.innerHTML = '&nbsp;'
  } else {
    for (const t of themed.tokens) {
      const span = document.createElement('span')
      span.textContent = t.text
      span.style.color = t.color
      if (t.italic) span.style.fontStyle = 'italic'
      if (t.bold) span.style.fontWeight = 'bold'
      lc.appendChild(span)
    }
  }
  row.appendChild(lc)
  return row
}
