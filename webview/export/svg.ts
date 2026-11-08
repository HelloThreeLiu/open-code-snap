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
  measureText,
} from '../../src/core/geometry'
import { MARK_COLORS } from '../../src/core/diff'
import {
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

/** XML-escape text content and attribute values. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

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
        `<text x="${n(wx + windowW / 2)}" y="${n(wy + titleH / 2 + 1)}" dy=".35em" text-anchor="middle" fill="${esc(fg)}" fill-opacity="0.55" font-size="${Math.round(style.fontSize * 0.9)}">${esc(input.windowTitle)}</text>`
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

  // --- line numbers + F7 row washes ---
  if (style.lineNumbers !== 'off' && layout.lines.length > 0) {
    const numX = wx + pad + input.gutterWidth - GUTTER_GAP
    layout.lines.forEach((line, i) => {
      const y = wy + titleH + pad + i * lineH
      const mark = input.lineMarks[i]
      if (mark) {
        parts.push(
          `<rect x="${n(wx)}" y="${n(y)}" width="${n(windowW)}" height="${n(lineH)}" fill="${esc(MARK_COLORS[mark].rowBg)}"/>`
        )
        parts.push(
          `<text x="${n(numX)}" y="${n(y)}" text-anchor="end" fill="${esc(MARK_COLORS[mark].accent)}" fill-opacity="0.9" font-size="${style.fontSize}">${esc(String(lineNumberFor(line, style.lineNumbers)))}</text>`
        )
      } else {
        parts.push(
          `<text x="${n(numX)}" y="${n(y)}" text-anchor="end" fill="${esc(fg)}" fill-opacity="0.45" font-size="${style.fontSize}">${esc(String(lineNumberFor(line, style.lineNumbers)))}</text>`
        )
      }
    })
  }

  // --- code tokens: one <text> per token at the same x/y the canvas draws ---
  const codeX = wx + pad + input.gutterWidth
  layout.lines.forEach((_, i) => {
    const y = wy + titleH + pad + i * lineH
    const tokens = highlight.lines[i]?.tokens ?? []
    let x = codeX
    for (const t of tokens) {
      const font = fontString(style, { italic: t.italic, bold: t.bold })
      const italic = t.italic ? ' font-style="italic"' : ''
      const bold = t.bold ? ' font-weight="bold"' : ''
      parts.push(
        `<text x="${n(x)}" y="${n(y)}" fill="${esc(t.color)}" font-size="${style.fontSize}"${italic}${bold} xml:space="preserve">${esc(t.text)}</text>`
      )
      x += measureText(t.text, font)
    }
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
          `<text x="${n(p.x)}" y="${n(p.y)}" text-anchor="${p.align === 'left' ? 'start' : 'end'}" fill="${esc(paintAccent(paint))}" fill-opacity="${style.watermarkOpacity}" font-size="${style.watermarkFontSize}">${esc(text)}</text>`
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
