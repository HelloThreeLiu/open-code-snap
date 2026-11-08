/**
 * SVG exporter (PRD F8) — the vector sibling of canvas.ts.
 * Consumes the same layout + highlight + geometry + background + watermark
 * + lineMarks inputs, so the three paths stay 1:1 by construction.
 * Known limitation: feDropShadow is not rendered by PowerPoint (best effort).
 */
import { lineNumberFor } from '../../src/core/layout'
import {
  stageInsets,
  titleBarHeight,
  WINDOW_INNER_PAD,
  GUTTER_GAP,
  fontString,
  fontBox,
  measureText,
} from '../../src/core/geometry'
import { MARK_COLORS, MARK_SVG_COLORS } from '../../src/core/diff'
import { applyMasksToLine, maskAsteriskText, maskRuns } from '../../src/core/mask'
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
import type { CanvasExportInput } from './canvas'

/**
 * XML-escape text content and attribute values. Also strips characters XML 1.0
 * forbids outright (control ranges, BOM-adjacent noncharacters) — token text
 * comes from arbitrary user selections, and one stray \x0B would make the
 * whole file unparseable (review M-3). Exported for unit tests.
 */
export function esc(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    // Lone surrogates are invalid XML 1.0 too (review m-2): a mask boundary
    // or any other path that halves a pair would break the whole file.
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Vertical alignment matching canvas textBaseline='top' / CSS box-top. */
const TOP_BASELINE = ' dominant-baseline="text-before-edge"'

const n = (v: number): string => String(Math.round(v * 100) / 100)

export function exportSvgString(input: CanvasExportInput): string {
  const { layout, highlight, style } = input
  const insets = stageInsets(style)
  const titleH = titleBarHeight(style)
  const lineH = style.fontSize * style.lineHeight
  const pad = WINDOW_INNER_PAD
  const { fg, bg } = highlight.colors

  // Same measurement pass as canvas.ts so both share one geometry.
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
  if (layout.lines.length === 0) codeW = 280
  codeW = Math.max(codeW, measureText('0'.repeat(8), baseFont))

  const windowW = pad * 2 + input.gutterWidth + codeW
  const windowH = titleH + pad * 2 + lineH * layout.lines.length
  const W = Math.ceil(insets.left + windowW + insets.right)
  const H = Math.ceil(insets.top + windowH + insets.bottom)
  const wx = insets.left
  const wy = insets.top

  const parts: string[] = []
  // XML declaration keeps Windows tools from guessing ANSI for CJK titles.
  parts.push('<?xml version="1.0" encoding="UTF-8"?>')
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${esc(style.fontFamily || 'Consolas, monospace')}">`
  )

  // --- defs: gradient + shadow ---
  const paint = resolveBackgroundPaint(style)
  const defs: string[] = []
  if (!style.transparentBackground && paint.type === 'gradient') {
    const e = gradientEndpoints(paint.angle, W, H)
    defs.push(
      `<linearGradient id="ocs-bg" gradientUnits="userSpaceOnUse" x1="${n(e.x1)}" y1="${n(e.y1)}" x2="${n(e.x2)}" y2="${n(e.y2)}">` +
        `<stop offset="0" stop-color="${esc(paint.colorA)}"/><stop offset="1" stop-color="${esc(paint.colorB)}"/>` +
        `</linearGradient>`
    )
  }
  if (!style.transparentBackground && style.shadowBlur > 0) {
    // PPT ignores filters; browsers and Figma honor them (best effort, plan §五).
    defs.push(
      `<filter id="ocs-shadow" x="-50%" y="-50%" width="200%" height="200%">` +
        `<feDropShadow dx="${n(style.shadowOffsetX)}" dy="${n(style.shadowOffsetY)}" stdDeviation="${n(style.shadowBlur / 2)}" flood-color="${esc(style.shadowColor)}"/>` +
        `</filter>`
    )
  }
  if (defs.length) parts.push(`<defs>${defs.join('')}</defs>`)

  // --- stage background ---
  if (!style.transparentBackground) {
    parts.push(drawBackgroundSvg(paint, W, H))
  }

  // --- window with shadow ---
  const shadowAttr = !style.transparentBackground && style.shadowBlur > 0 ? ' filter="url(#ocs-shadow)"' : ''
  parts.push(`<rect x="${n(wx)}" y="${n(wy)}" width="${n(windowW)}" height="${n(windowH)}" rx="${n(style.borderRadius)}" fill="${esc(bg)}"${shadowAttr}/>`)

  // --- title bar ---
  if (titleH > 0) {
    if (style.windowStyle === 'macos') {
      const r = 6
      const pitch = 18
      const cy = wy + titleH / 2
      const colors = ['#ff5f57', '#febc2e', '#28c840']
      colors.forEach((c, i) => {
        parts.push(`<circle cx="${n(wx + pad + r + i * pitch)}" cy="${n(cy)}" r="${r}" fill="${c}"/>`)
      })
    }
    if (style.showWindowTitle) {
      parts.push(
        `<text x="${n(wx + windowW / 2)}" y="${n(wy + titleH / 2 + 1)}" dy=".35em" text-anchor="middle" fill="${esc(fg)}" fill-opacity="0.55" font-size="${Math.round(style.fontSize * 0.9)}" xml:space="preserve">${esc(input.windowTitle)}</text>`
      )
    }
    if (style.windowStyle === 'windows') {
      const glyphs = ['–', '▢', '✕']
      glyphs.forEach((g, i) => {
        const gx = wx + windowW - pad - (glyphs.length - i) * 24
        parts.push(
          `<text x="${n(gx)}" y="${n(wy + titleH / 2)}" dy=".35em" text-anchor="middle" fill="${esc(fg)}" fill-opacity="0.6" font-size="11">${esc(g)}</text>`
        )
      })
    }
  }

  // --- F7 row washes: unconditional on lineNumbers, matching the preview ---
  if (layout.lines.length > 0) {
    layout.lines.forEach((_, i) => {
      const mark = input.lineMarks[i]
      if (mark) {
        const y = wy + titleH + pad + i * lineH
        // fill+fill-opacity instead of rgba(): PPT's SVG renderer is shaky on rgba() (review M-6).
        parts.push(
          `<rect x="${n(wx)}" y="${n(y)}" width="${n(windowW)}" height="${n(lineH)}" fill="${MARK_SVG_COLORS[mark].fill}" fill-opacity="${MARK_SVG_COLORS[mark].opacity}"/>`
        )
      }
    })
  }

  // --- line numbers ---
  if (style.lineNumbers !== 'off' && layout.lines.length > 0) {
    const numX = wx + pad + input.gutterWidth - GUTTER_GAP
    layout.lines.forEach((line, i) => {
      const y = wy + titleH + pad + i * lineH
      const mark = input.lineMarks[i]
      const fill = mark ? MARK_COLORS[mark].accent : fg
      const opacity = mark ? 0.9 : 0.45
      parts.push(
        `<text x="${n(numX)}" y="${n(y)}"${TOP_BASELINE} text-anchor="end" fill="${esc(fill)}" fill-opacity="${opacity}" font-size="${style.fontSize}">${esc(String(lineNumberFor(line, style.lineNumbers)))}</text>`
      )
    })
  }

  // --- code tokens: one <text> per token at the same x/y the canvas draws ---
  const codeX = wx + pad + input.gutterWidth
  // F10 block geometry — same font-metrics numbers as canvas.ts.
  const box = fontBox(baseFont)
  const blockH = box.ascent + box.descent
  const blockYOff = (lineH - blockH) / 2
  layout.lines.forEach((_, i) => {
    const y = wy + titleH + pad + i * lineH
    const tokens = highlight.lines[i]?.tokens ?? []
    const lineMasks = input.masks.filter((m) => m.line === i)
    const segments = applyMasksToLine(tokens, lineMasks)
    // Pre-measure so a run of adjacent masked segments renders as ONE
    // continuous bar (same numbers as canvas.ts).
    const fonts = segments.map((s) => fontString(style, { italic: s.italic, bold: s.bold }))
    const widths = segments.map((s, i2) => measureText(s.text, fonts[i2]))
    const xs: number[] = []
    let x = codeX
    for (let i2 = 0; i2 < segments.length; i2++) {
      xs.push(x)
      x += widths[i2]
    }
    if (style.maskStyle === 'block') {
      for (const { from, to } of maskRuns(segments)) {
        // Security: the masked source text must NOT appear in the SVG at all
        // — the block REPLACES it (covering would keep it recoverable).
        let w = 0
        for (let k = from; k < to; k++) w += widths[k]
        parts.push(
          `<rect x="${n(xs[from])}" y="${n(y + blockYOff)}" width="${n(w)}" height="${n(blockH)}" rx="2" fill="${esc(fg)}"/>`
        )
      }
    }
    segments.forEach((seg, i2) => {
      if (seg.masked && style.maskStyle === 'block') return // drawn as a run bar
      const text = seg.masked ? maskAsteriskText(widths[i2], fonts[i2]) : seg.text
      const italic = seg.italic ? ' font-style="italic"' : ''
      const bold = seg.bold ? ' font-weight="bold"' : ''
      parts.push(
        `<text x="${n(xs[i2])}" y="${n(y)}"${TOP_BASELINE} fill="${esc(seg.color)}" font-size="${style.fontSize}"${italic}${bold} xml:space="preserve">${esc(text)}</text>`
      )
    })
  })

  // --- watermark (F6) ---
  if (!style.transparentBackground && watermarkIsEnabled(style)) {
    const text = resolveWatermarkText(style.watermarkText, { file: input.windowTitle })
    if (text) {
      const font = fontString(style, { size: style.watermarkFontSize })
      const textWidth = measureText(text, font)
      const placements = watermarkPlacements({ width: W, height: H }, style.watermarkPosition, {
        fontSize: style.watermarkFontSize,
        textWidth,
      })
      for (const p of placements) {
        parts.push(
          `<text x="${n(p.x)}" y="${n(p.y)}"${TOP_BASELINE} text-anchor="${p.align === 'left' ? 'start' : 'end'}" fill="${esc(contrastOverlay(paintAccent(paint)))}" fill-opacity="${style.watermarkOpacity}" font-size="${style.watermarkFontSize}" xml:space="preserve">${esc(text)}</text>`
        )
      }
    }
  }

  parts.push('</svg>')
  return parts.join('\n')
}

/** Stage backdrop as SVG elements — same numbers as canvas.ts drawBackground. */
function drawBackgroundSvg(paint: BackgroundPaint, W: number, H: number): string {
  switch (paint.type) {
    case 'solid':
      return `<rect width="${W}" height="${H}" fill="${esc(paint.color)}"/>`
    case 'gradient':
      return `<rect width="${W}" height="${H}" fill="url(#ocs-bg)"/>`
    case 'grid': {
      const out = [`<rect width="${W}" height="${H}" fill="${esc(paint.color)}"/>`]
      for (let x = 0; x <= W; x += paint.spacing) {
        out.push(`<rect x="${n(x)}" y="0" width="${paint.thickness}" height="${H}" fill="${esc(paint.lineColor)}"/>`)
      }
      for (let y = 0; y <= H; y += paint.spacing) {
        out.push(`<rect x="0" y="${n(y)}" width="${W}" height="${paint.thickness}" fill="${esc(paint.lineColor)}"/>`)
      }
      return out.join('\n')
    }
    case 'dots': {
      const out = [`<rect width="${W}" height="${H}" fill="${esc(paint.color)}"/>`]
      const c = paint.spacing / 2
      for (let y = c; y <= H; y += paint.spacing) {
        for (let x = c; x <= W; x += paint.spacing) {
          out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${paint.radius}" fill="${esc(paint.dotColor)}"/>`)
        }
      }
      return out.join('\n')
    }
  }
}
