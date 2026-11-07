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
 * Inject the DOM-backed text measurement. core itself stays DOM-free: the
 * webview wires the real canvas 2d context at bootstrap, and tests inject
 * a stub before calling geometry consumers. Pass null to unbind (tests).
 */
export function setMeasureTextImpl(
  impl: ((text: string, font: string) => number) | null
): void {
  measureImpl = impl
}

/** Measure text width with the same font the preview/canvas will use. */
export function measureText(text: string, font: string): number {
  if (!measureImpl) {
    throw new Error('measureText used before setMeasureTextImpl was called')
  }
  return measureImpl(text, font)
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
