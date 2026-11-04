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
  measureText,
} from '../../src/core/geometry'

export interface CanvasExportInput {
  layout: LayoutedCode
  highlight: HighlightResult
  style: StyleConfig
  /** Measured gutter width, shared with the preview. */
  gutterWidth: number
  windowTitle: string
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

  // --- stage background ---
  if (!style.transparentBackground) {
    ctx.fillStyle = style.backgroundColor
    ctx.fillRect(0, 0, W, H)
  }

  // --- window with shadow ---
  const wx = insets.left
  const wy = insets.top
  ctx.save()
  ctx.shadowColor = style.shadowColor
  ctx.shadowBlur = style.shadowBlur
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

  // --- line numbers ---
  if (style.showLineNumbers && layout.lines.length > 0) {
    ctx.fillStyle = fg
    ctx.globalAlpha = 0.45
    ctx.font = baseFont
    ctx.textAlign = 'right'
    const numX = wx + pad + input.gutterWidth - GUTTER_GAP
    layout.lines.forEach((line, i) => {
      const y = wy + titleH + pad + i * lineH
      ctx.fillText(String(lineNumberFor(line, style.realLineNumbers)), numX, y)
    })
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
  }

  // --- code tokens ---
  // Ligatures: Chromium's canvas text stack applies `calt` by default,
  // matching the DOM preview for Fira Code et al.
  ctx.font = baseFont
  const codeX = wx + pad + input.gutterWidth
  layout.lines.forEach((_, i) => {
    const y = wy + titleH + pad + i * lineH
    const tokens = highlight.lines[i]?.tokens ?? []
    let x = codeX
    for (const t of tokens) {
      ctx.font = fontString(style, { italic: t.italic, bold: t.bold })
      ctx.fillStyle = t.color
      ctx.fillText(t.text, x, y)
      x += measureText(t.text, ctx.font)
    }
  })

  return canvas.toDataURL('image/png')
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
