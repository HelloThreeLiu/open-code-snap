/**
 * Canvas exporter — the "silicon-style" direct rasterization path.
 * Consumes the same layout + highlight + geometry as the DOM preview,
 * so output matches the preview by construction (WYSIWYG).
 */
import type { LayoutedCode } from '../../src/core/layout'
import { lineNumberFor } from '../../src/core/layout'
import type { HighlightResult } from '../../src/core/highlight'
import type { StyleConfig } from '../../src/core/protocol'
import {
  stageInsets,
  titleBarHeight,
  WINDOW_INNER_PAD,
  GUTTER_GAP,
  fontString,
  fontBox,
  measureText,
} from '../../src/core/geometry'
import { MARK_COLORS, type LineMark } from '../../src/core/diff'
import { applyMasksToLine, maskAsteriskText, maskRuns, type MaskRange } from '../../src/core/mask'
import {
  contrastOverlay,
  gradientEndpoints,
  paintAccent,
  resolveBackgroundPaint,
  type BackgroundPaint,
} from '../../src/core/background'
import {
  resolveWatermarkText,
  watermarkIsEnabled,
  watermarkPlacements,
} from '../../src/core/watermark'

export interface CanvasExportInput {
  layout: LayoutedCode
  highlight: HighlightResult
  style: StyleConfig
  /** Measured gutter width, shared with the preview. */
  gutterWidth: number
  windowTitle: string
  /** F7 diff marks; rows with a mark get the wash + gutter accent. */
  lineMarks: Record<number, LineMark>
  /** F10 redaction ranges in layouted-line coordinates. */
  masks: MaskRange[]
}

/** Render to a PNG dataURL. Synchronous, typically a few ms per 100 lines. */
export function exportCanvasPng(input: CanvasExportInput): string {
  const { layout, highlight, style } = input
  const insets = stageInsets(style)
  const titleH = titleBarHeight(style)
  const lineH = style.fontSize * style.lineHeight
  const pad = WINDOW_INNER_PAD
  const { fg, bg } = highlight.colors

  // --- measure code area width ---
  const baseFont = fontString(style)
  let codeW = 0
  for (let i = 0; i < layout.lines.length; i++) {
    const tokens = highlight.lines[i]?.tokens ?? []
    let w = 0
    for (const t of tokens) {
      w += measureText(t.text, fontString(style, { italic: t.italic, bold: t.bold }))
    }
    codeW = Math.max(codeW, w)
  }
  if (layout.lines.length === 0) codeW = 280 // placeholder width
  codeW = Math.max(codeW, measureText('0'.repeat(8), baseFont))

  const windowW = pad * 2 + input.gutterWidth + codeW
  const windowH = titleH + pad * 2 + lineH * layout.lines.length
  const W = Math.ceil(insets.left + windowW + insets.right)
  const H = Math.ceil(insets.top + windowH + insets.bottom)

  const canvas = document.createElement('canvas')
  const scale = style.exportScale
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)

  // --- stage background (F5) ---
  if (!style.transparentBackground) {
    drawBackground(ctx, resolveBackgroundPaint(style), W, H)
  }

  // --- window with shadow ---
  const wx = insets.left
  const wy = insets.top
  ctx.save()
  ctx.shadowColor = style.shadowColor
  ctx.shadowBlur = style.shadowBlur
  ctx.shadowOffsetX = style.shadowOffsetX
  ctx.shadowOffsetY = style.shadowOffsetY
  ctx.fillStyle = bg
  roundRect(ctx, wx, wy, windowW, windowH, style.borderRadius)
  ctx.fill()
  ctx.restore()

  // --- title bar ---
  if (titleH > 0) {
    if (style.windowStyle === 'macos') {
      const r = 6
      const pitch = 18
      const cy = wy + titleH / 2
      const colors = ['#ff5f57', '#febc2e', '#28c840']
      colors.forEach((c, i) => {
        ctx.beginPath()
        ctx.arc(wx + pad + r + i * pitch, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = c
        ctx.fill()
      })
    }
    if (style.showWindowTitle) {
      ctx.fillStyle = fg
      ctx.globalAlpha = 0.55
      ctx.font = fontString(style, { size: Math.round(style.fontSize * 0.9) })
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(input.windowTitle, wx + windowW / 2, wy + titleH / 2 + 1)
      ctx.globalAlpha = 1
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
    }
    if (style.windowStyle === 'windows') {
      ctx.fillStyle = fg
      ctx.globalAlpha = 0.6
      ctx.font = `11px ${style.fontFamily || 'Consolas, monospace'}`
      ctx.textBaseline = 'middle'
      const glyphs = ['–', '▢', '✕']
      glyphs.forEach((g, i) => {
        const gx = wx + windowW - pad - (glyphs.length - i) * 24
        ctx.fillText(g, gx, wy + titleH / 2)
      })
      ctx.globalAlpha = 1
      ctx.textBaseline = 'top'
    }
  }

  // --- F7 row washes: unconditional on lineNumbers, matching the preview ---
  layout.lines.forEach((_, i) => {
    const mark = input.lineMarks[i]
    if (mark) {
      const y = wy + titleH + pad + i * lineH
      ctx.fillStyle = MARK_COLORS[mark].rowBg
      ctx.fillRect(wx, y, windowW, lineH)
    }
  })

  // --- line numbers ---
  if (style.lineNumbers !== 'off' && layout.lines.length > 0) {
    ctx.font = baseFont
    ctx.textAlign = 'right'
    // Explicit: the title block only sets 'top' when it runs, so without a
    // title the numbers/tokens would drift to alphabetic (review C-2).
    ctx.textBaseline = 'top'
    const numX = wx + pad + input.gutterWidth - GUTTER_GAP
    layout.lines.forEach((line, i) => {
      const y = wy + titleH + pad + i * lineH
      const mark = input.lineMarks[i]
      if (mark) {
        ctx.fillStyle = MARK_COLORS[mark].accent
        ctx.globalAlpha = 0.9
      } else {
        ctx.fillStyle = fg
        ctx.globalAlpha = 0.45
      }
      ctx.fillText(String(lineNumberFor(line, style.lineNumbers)), numX, y)
    })
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
  }

  // --- code tokens ---
  // Ligatures: Chromium's canvas text stack applies `calt` by default,
  // matching the DOM preview for Fira Code et al.
  ctx.font = baseFont
  const codeX = wx + pad + input.gutterWidth
  // F10 block geometry: the DOM bar covers the font's content area (what an
  // inline background paints), so reuse those exact metrics here.
  const box = fontBox(baseFont)
  const blockH = box.ascent + box.descent
  const blockYOff = (lineH - blockH) / 2
  layout.lines.forEach((_, i) => {
    const y = wy + titleH + pad + i * lineH
    const tokens = highlight.lines[i]?.tokens ?? []
    const lineMasks = input.masks.filter((m) => m.line === i)
    const segments = applyMasksToLine(tokens, lineMasks)
    // Pre-measure so a run of adjacent masked segments renders as ONE
    // continuous bar — per-segment rects would show rounded corner notches.
    const fonts = segments.map((s) => fontString(style, { italic: s.italic, bold: s.bold }))
    const widths = segments.map((s, i2) => measureText(s.text, fonts[i2]))
    const xs: number[] = []
    let x = codeX
    for (let i2 = 0; i2 < segments.length; i2++) {
      xs.push(x)
      x += widths[i2]
    }
    if (style.maskStyle === 'block') {
      ctx.fillStyle = fg
      for (const { from, to } of maskRuns(segments)) {
        let w = 0
        for (let k = from; k < to; k++) w += widths[k]
        roundRect(ctx, xs[from], y + blockYOff, w, blockH, 2)
        ctx.fill()
      }
    }
    segments.forEach((seg, i2) => {
      if (seg.masked && style.maskStyle === 'block') return // drawn as a run bar
      ctx.font = fonts[i2]
      ctx.fillStyle = seg.color
      // Asterisk mode: draw the replacement but advance by the ORIGINAL
      // width so the rest of the line never shifts.
      ctx.fillText(seg.masked ? maskAsteriskText(widths[i2], fonts[i2]) : seg.text, xs[i2], y)
    })
  })

  // --- watermark (F6) ---
  if (!style.transparentBackground && watermarkIsEnabled(style)) {
    drawWatermark(ctx, style, input.windowTitle, resolveBackgroundPaint(style), W, H)
  }

  return canvas.toDataURL('image/png')
}

/** Stage backdrop for the canvas export — same numbers as the CSS preview. */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  paint: BackgroundPaint,
  W: number,
  H: number
): void {
  const fillAll = (color: string): void => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, W, H)
  }
  switch (paint.type) {
    case 'solid':
      fillAll(paint.color)
      break
    case 'gradient': {
      const e = gradientEndpoints(paint.angle, W, H)
      const grad = ctx.createLinearGradient(e.x1, e.y1, e.x2, e.y2)
      grad.addColorStop(0, paint.colorA)
      grad.addColorStop(1, paint.colorB)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
      break
    }
    case 'grid': {
      fillAll(paint.color)
      ctx.fillStyle = paint.lineColor
      // Tiles start at the origin, matching CSS background-position 0 0.
      for (let x = 0; x <= W; x += paint.spacing) {
        ctx.fillRect(x, 0, paint.thickness, H)
      }
      for (let y = 0; y <= H; y += paint.spacing) {
        ctx.fillRect(0, y, W, paint.thickness)
      }
      break
    }
    case 'dots': {
      fillAll(paint.color)
      ctx.fillStyle = paint.dotColor
      // CSS radial-gradient tiles center the dot in each cell.
      const c = paint.spacing / 2
      for (let y = c; y <= H; y += paint.spacing) {
        for (let x = c; x <= W; x += paint.spacing) {
          ctx.beginPath()
          ctx.arc(x, y, paint.radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break
    }
  }
}

/** Watermark text over the stage — same geometry as the CSS preview. */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  style: StyleConfig,
  windowTitle: string,
  paint: BackgroundPaint,
  W: number,
  H: number
): void {
  const text = resolveWatermarkText(style.watermarkText, { file: windowTitle })
  if (!text) return
  const font = fontString(style, { size: style.watermarkFontSize })
  const textWidth = measureText(text, font)

  const placements = watermarkPlacements({ width: W, height: H }, style.watermarkPosition, {
    fontSize: style.watermarkFontSize,
    textWidth,
  })
  ctx.save()
  ctx.globalAlpha = style.watermarkOpacity
  ctx.fillStyle = contrastOverlay(paintAccent(paint))
  ctx.font = font
  ctx.textBaseline = 'top'
  for (const p of placements) {
    ctx.textAlign = p.align
    ctx.fillText(text, p.x, p.y)
  }
  ctx.restore()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
