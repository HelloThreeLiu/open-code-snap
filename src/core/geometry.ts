/**
 * Shared geometry between DOM preview and Canvas export.
 * Both consume these numbers so the exported image matches the preview 1:1.
 */
import type { StyleConfig } from './protocol'

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Space around the code window inside the exported image.
 * `padding` is the user's aesthetic margin; the shadow safety margin is added
 * so box-shadow is never clipped (unlike polacode/codesnap, which crop it).
 */
export function stageInsets(style: StyleConfig): Insets {
  const safety = Math.ceil(style.shadowBlur / 2)
  return {
    // Shadow extends vertically by blur/2 plus |offset| in its direction —
    // a negative offset pushes the shadow UP, so the top needs the room
    // (hang-④: it previously got none, clipping the glow).
    top: style.padding + safety + Math.max(0, -style.shadowOffsetY),
    right: style.padding + safety + Math.max(0, style.shadowOffsetX),
    bottom: style.padding + safety + Math.max(0, style.shadowOffsetY),
    left: style.padding + safety + Math.max(0, -style.shadowOffsetX),
  }
}

/** Inner padding of the code window. */
export const WINDOW_INNER_PAD = 16

/** Title bar height; 0 when the whole chrome is hidden. */
export function titleBarHeight(style: StyleConfig): number {
  const hasChrome = style.windowStyle !== 'none' || style.showWindowTitle
  return hasChrome ? Math.round(style.fontSize * 2.2) : 0
}

/** Font string for Canvas 2D / CSS, honoring per-token decorations. */
export function fontString(
  style: StyleConfig,
  opts: { italic?: boolean; bold?: boolean; size?: number } = {}
): string {
  const parts: string[] = []
  if (opts.italic) parts.push('italic')
  if (opts.bold) parts.push('bold')
  parts.push(`${opts.size ?? style.fontSize}px`)
  parts.push(style.fontFamily || 'Consolas, monospace')
  return parts.join(' ')
}

/** Horizontal gap between the line-number column and the code. */
export const GUTTER_GAP = 16

let measureImpl: ((text: string, font: string) => number) | null = null

/**
 * Width cache (F11): the canvas/SVG exporters measure every token at least
 * twice (width pass + draw pass) and long files repeat the same token shapes
 * (keywords, indentation, numbers) — cache hits dominate on 1000+ lines.
 * Two-level map (font → text → width) makes collisions impossible even for
 * exotic font strings.
 */
const MEASURE_CACHE_LIMIT = 8192
const measureCache = new Map<string, Map<string, number>>()
let measureCacheCount = 0

/**
 * Inject the DOM-backed text measurement. core itself stays DOM-free: the
 * webview wires the real canvas 2d context at bootstrap, and tests inject
 * a stub before calling geometry consumers. Pass null to unbind (tests).
 * Rebinding clears the cache — a new source means new numbers.
 */
export function setMeasureTextImpl(
  impl: ((text: string, font: string) => number) | null
): void {
  measureImpl = impl
  measureCache.clear()
  measureCacheCount = 0
}

/** Measure text width with the same font the preview/canvas will use. */
export function measureText(text: string, font: string): number {
  if (!measureImpl) {
    throw new Error('measureText used before setMeasureTextImpl was called')
  }
  let perFont = measureCache.get(font)
  if (!perFont) {
    perFont = new Map()
    measureCache.set(font, perFont)
  }
  const hit = perFont.get(text)
  if (hit !== undefined) return hit
  const width = measureImpl(text, font)
  if (measureCacheCount >= MEASURE_CACHE_LIMIT) {
    measureCache.clear()
    measureCacheCount = 0
  }
  perFont.set(text, width)
  measureCacheCount++
  return width
}

export interface FontBox {
  ascent: number
  descent: number
}

let measureFontBoxImpl: ((font: string) => FontBox) | null = null

/**
 * Inject the font-metrics probe (ascent/descent of the font's content area —
 * exactly what a DOM inline background covers). Same injection pattern as
 * measureText: core stays DOM-free, the webview wires a canvas 2d context.
 */
export function setMeasureFontBoxImpl(impl: ((font: string) => FontBox) | null): void {
  measureFontBoxImpl = impl
}

/** Font content-area metrics, shared by mask-block rendering (F10). */
export function fontBox(font: string): FontBox {
  if (!measureFontBoxImpl) {
    throw new Error('fontBox used before setMeasureFontBoxImpl was called')
  }
  return measureFontBoxImpl(font)
}

// --- F11: raster canvas size caps (Chromium) ---

export const CANVAS_MAX_SIDE = 32767
export const CANVAS_MAX_AREA = 2 ** 28

/** Export scale; mirrors `openCodeSnap.exportScale`. */
export type ExportScale = 1 | 2 | 3

function canvasFits(width: number, height: number, scale: number): boolean {
  const w = width * scale
  const h = height * scale
  return w <= CANVAS_MAX_SIDE && h <= CANVAS_MAX_SIDE && w * h <= CANVAS_MAX_AREA
}

/**
 * Largest scale ≤ requested whose raster stays inside the Chromium canvas
 * caps. Throws when even 1x cannot render — callers must surface this as a
 * user-visible error instead of exporting a blank or clipped image (F11).
 * Pure so the caps are unit-testable; canvas.ts consumes it.
 */
export function resolveCanvasScale(
  width: number,
  height: number,
  requested: ExportScale
): ExportScale {
  for (let s = requested; s >= 1; s--) {
    if (canvasFits(width, height, s)) return s as ExportScale
  }
  throw new Error(
    `image size ${Math.ceil(width)}×${Math.ceil(height)} @1x exceeds canvas limits (${CANVAS_MAX_SIDE}px side / ${CANVAS_MAX_AREA}px² area) — shrink font size or split the selection`
  )
}

/** Total gutter width (numbers + gap); 0 when line numbers are off. */
export function gutterWidth(
  maxLineNumber: number,
  style: StyleConfig
): number {
  if (style.lineNumbers === 'off' || maxLineNumber <= 0) return 0
  const w = measureText(String(maxLineNumber), fontString(style))
  return Math.ceil(w) + GUTTER_GAP
}
