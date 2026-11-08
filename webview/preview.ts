import type { LayoutedCode, LayoutedLine } from '../src/core/layout'
import { lineNumberFor } from '../src/core/layout'
import type { HighlightResult } from '../src/core/highlight'
import type { StyleConfig } from '../src/core/protocol'
import { stageInsets, titleBarHeight, WINDOW_INNER_PAD, GUTTER_GAP, fontString, measureText } from '../src/core/geometry'
import { MARK_COLORS, type LineMark } from '../src/core/diff'
import { applyMasksToLine, maskAsteriskText, maskRuns, type MaskRange } from '../src/core/mask'
import {
  contrastOverlay,
  cssPaintSizes,
  cssPaintString,
  paintAccent,
  resolveBackgroundPaint,
  type BackgroundPaint,
} from '../src/core/background'
import {
  resolveWatermarkText,
  watermarkIsEnabled,
  watermarkPlacements,
} from '../src/core/watermark'

/** Apply a resolved paint to the stage element (CSS side of F5). */
export function applyBackground(stage: HTMLElement, paint: BackgroundPaint): void {
  if (paint.type === 'gradient') {
    stage.style.background = cssPaintString(paint)
    return
  }
  stage.style.background = paint.color
  if (paint.type === 'grid' || paint.type === 'dots') {
    stage.style.backgroundImage = cssPaintString(paint)
    stage.style.backgroundSize = cssPaintSizes(paint).join(', ')
  } else {
    stage.style.backgroundImage = 'none'
    stage.style.backgroundSize = 'auto'
  }
}

/**
 * Render the preview DOM under #stage — the visual source of truth.
 * The canvas exporter consumes the same layout/geometry inputs instead of
 * reading back this DOM, so preview and export stay 1:1 by construction.
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
    /** F7 diff marks by line index; keys without a mark render normally. */
    lineMarks: Record<number, LineMark>
    /** F10 redaction ranges in layouted-line coordinates. */
    masks: MaskRange[]
    /** Click on a masked segment removes its owning range (F10). */
    onUnmask?: (lineIndex: number, start: number, end: number) => void
    /** Click on a line number cycles its mark (F7). */
    onToggleMark?: (lineIndex: number) => void
    /** Live title sync while typing (no rerender; keeps exports fresh). */
    onTitleInput?: (text: string) => void
    /** Title committed (Enter/blur) — triggers a rerender. */
    onTitleChange?: (text: string) => void
  }
): HTMLElement {
  const { layout, highlight, style, windowTitle, gutterWidth } = input
  container.replaceChildren()

  const stage = document.createElement('div')
  stage.id = 'stage'
  stage.style.position = 'relative'
  const insets = stageInsets(style)
  stage.style.padding = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`

  const paint = resolveBackgroundPaint(style)
  if (style.transparentBackground) {
    // Transparent wins over any backdrop kind (pre-0.3 semantics).
    stage.style.background = 'transparent'
    stage.style.backgroundImage = 'none'
  } else {
    applyBackground(stage, paint)
  }

  const win = document.createElement('div')
  win.id = 'window'
  win.style.borderRadius = `${style.borderRadius}px`
  win.style.boxShadow = `${style.shadowColor} ${style.shadowOffsetX}px ${style.shadowOffsetY}px ${style.shadowBlur}px`
  win.style.background = highlight.colors.bg
  win.style.fontFamily = style.fontFamily || 'Consolas, monospace'
  win.style.fontSize = `${style.fontSize}px`
  win.style.lineHeight = String(style.lineHeight)
  win.style.fontVariantLigatures = style.ligatures ? 'normal' : 'none'

  if (titleBarHeight(style) > 0) {
    win.appendChild(
      buildTitleBar(style, windowTitle, highlight.colors.fg, input.onTitleInput, input.onTitleChange)
    )
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
      const lineMasks = input.masks.filter((m) => m.line === i)
      code.appendChild(
        buildLine(
          line,
          i,
          highlight.lines[i],
          style,
          highlight.colors.fg,
          gutterWidth,
          input.lineMarks[i],
          lineMasks,
          () => input.onToggleMark?.(i),
          input.onUnmask
        )
      )
    })
  }
  win.appendChild(code)
  stage.appendChild(win)
  container.appendChild(stage)

  // Watermarks need the laid-out stage size, so build after mount.
  if (!style.transparentBackground && watermarkIsEnabled(style)) {
    stage.appendChild(buildWatermarkLayer(stage, style, paint, windowTitle))
  }
  return stage
}

/** Watermark copies over the stage padding area (F6, CSS side). */
function buildWatermarkLayer(
  stage: HTMLElement,
  style: StyleConfig,
  paint: BackgroundPaint,
  windowTitle: string
): HTMLElement {
  const layer = document.createElement('div')
  layer.className = 'watermark-layer'
  const text = resolveWatermarkText(style.watermarkText, { file: windowTitle })
  if (!text) return layer

  // Measure with the same font the canvas will draw, so tile spacing matches.
  const font = fontString(style, { size: style.watermarkFontSize })
  const textWidth = measureText(text, font)
  // Stage is already in the DOM here, so the real box size is known.
  const box = { width: stage.offsetWidth, height: stage.offsetHeight }
  const placements = watermarkPlacements(box, style.watermarkPosition, {
    fontSize: style.watermarkFontSize,
    textWidth,
  })
  const color = contrastOverlay(paintAccent(paint))
  for (const p of placements) {
    const span = document.createElement('span')
    span.className = 'watermark'
    span.textContent = text
    span.style.fontSize = `${style.watermarkFontSize}px`
    span.style.fontFamily = style.fontFamily || 'Consolas, monospace'
    span.style.opacity = String(style.watermarkOpacity)
    span.style.color = color
    if (p.align === 'left') span.style.left = `${p.x}px`
    else span.style.right = `${box.width - p.x}px`
    span.style.top = `${p.y}px`
    layer.appendChild(span)
  }
  return layer
}

function buildTitleBar(
  style: StyleConfig,
  windowTitle: string,
  fg: string,
  onTitleInput?: (text: string) => void,
  onTitleChange?: (text: string) => void
): HTMLElement {
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
    if (onTitleChange) {
      // In-place title editing (PRD F2.2): click to edit, Enter/blur commits.
      // `input` syncs every keystroke so a host push mid-edit rebuilds the
      // DOM with the typed text instead of dropping it (review I-3), and an
      // immediate export after typing sees a fresh cache.windowTitle (I-2).
      try {
        title.contentEditable = 'plaintext-only'
      } catch {
        title.contentEditable = 'true' // non-Chromium fallback
      }
      title.classList.add('editable')
      title.spellcheck = false
      title.addEventListener('input', () => {
        onTitleInput?.(title.textContent ?? '')
      })
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          title.blur()
        }
      })
      title.addEventListener('blur', () => {
        onTitleChange((title.textContent ?? '').trim())
      })
    }
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
  lineIndex: number,
  themed: { tokens: { text: string; color: string; italic: boolean; bold: boolean }[] } | undefined,
  style: StyleConfig,
  fg: string,
  gutterW: number,
  mark: LineMark | undefined,
  lineMasks: MaskRange[],
  onToggle: () => void,
  onUnmask?: (line: number, start: number, end: number) => void
): HTMLElement {
  const row = document.createElement('div')
  row.className = 'line'
  // F10: lets selection→mask mapping resolve the line without DOM walking.
  row.dataset.line = String(lineIndex)
  if (mark) {
    row.style.background = MARK_COLORS[mark].rowBg
  }

  if (style.lineNumbers !== 'off') {
    const ln = document.createElement('span')
    ln.className = 'ln'
    if (mark) {
      ln.style.color = MARK_COLORS[mark].accent
      ln.style.opacity = '0.9'
      ln.title = '点击取消 +/− 标记'
    } else {
      ln.style.color = fg
      ln.style.opacity = '0.45'
      ln.title = '点击标记为新增(+)，再点为删除(−)'
    }
    ln.style.display = 'inline-block'
    ln.style.width = `${gutterW - GUTTER_GAP}px`
    ln.style.marginRight = `${GUTTER_GAP}px`
    ln.style.textAlign = 'right'
    ln.style.cursor = 'pointer'
    ln.style.userSelect = 'none'
    ln.textContent = String(lineNumberFor(line, style.lineNumbers))
    ln.addEventListener('click', onToggle)
    row.appendChild(ln)
  }

  const lc = document.createElement('span')
  lc.className = 'lc'
  lc.style.whiteSpace = 'pre'
  const segments = applyMasksToLine(themed?.tokens ?? [], lineMasks)
  if (segments.length === 0) {
    // Blank line: keep the row height stable.
    lc.innerHTML = '&nbsp;'
  } else {
    // Run edges decide which corners stay rounded so a run of adjacent
    // blocks reads as ONE continuous bar (matches canvas/SVG run rects).
    const runEdge = new Map<number, { first: boolean; last: boolean }>()
    for (const { from, to } of maskRuns(segments)) {
      for (let k = from; k < to; k++) runEdge.set(k, { first: k === from, last: k === to - 1 })
    }
    segments.forEach((seg, idx) => {
      const span = document.createElement('span')
      if (seg.masked) {
        if (style.maskStyle === 'asterisk') {
          const font = fontString(style, { italic: seg.italic, bold: seg.bold })
          span.textContent = maskAsteriskText(measureText(seg.text, font), font)
          span.style.color = seg.color
        } else {
          // Block: keep the original text (the width stays exact) and hide
          // it under an opaque bar in the theme foreground.
          span.textContent = seg.text
          span.style.background = fg
          span.classList.add('mask-block')
          const edge = runEdge.get(idx)
          span.style.borderRadius = !edge || (edge.first && edge.last)
            ? '2px' // standalone mask
            : edge.first
              ? '2px 0 0 2px' // left end of a run
              : edge.last
                ? '0 2px 2px 0' // right end of a run
                : '0' // middle: seamless continuation
        }
        // Original coordinates, so selection mapping survives re-masked text.
        span.dataset.col = String(seg.start)
        span.dataset.end = String(seg.end)
        span.title = '点击取消遮罩'
        span.addEventListener('click', () => onUnmask?.(lineIndex, seg.start, seg.end))
      } else {
        span.textContent = seg.text
        span.style.color = seg.color
        if (seg.italic) span.style.fontStyle = 'italic'
        if (seg.bold) span.style.fontWeight = 'bold'
        span.dataset.col = String(seg.start)
        span.dataset.end = String(seg.end)
      }
      lc.appendChild(span)
    })
  }
  row.appendChild(lc)
  return row
}
