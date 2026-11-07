/**
 * Watermark text and geometry (PRD F6). Pure TS: the DOM preview positions
 * spans with the same numbers the canvas exporter draws with, so both paths
 * agree. Unit-tested in tests/watermark.test.ts.
 */
import type { StyleConfig, WatermarkPosition } from './protocol'

/** Corner margin between the watermark and the stage edge. */
export const WATERMARK_MARGIN = 12
/** Minimum horizontal distance between tiled copies. */
export const TILE_SPACING = 160

export interface WatermarkPlacement {
  /** Left edge for left-aligned copies, right edge for right-aligned. */
  x: number
  /** Top edge of the text box (matches CSS `top`, canvas textBaseline 'top'). */
  y: number
  align: 'left' | 'right'
}

/**
 * Replace `{date}` with the local YYYY-MM-DD and `{file}` with the window
 * title. Unknown placeholders (e.g. `{name}`) stay verbatim; empty braces
 * and braces without a closing pair are left untouched too.
 */
export function resolveWatermarkText(
  template: string,
  ctx: { date?: Date; file?: string } = {}
): string {
  if (!template) return ''
  const d = ctx.date ?? new Date()
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return template.replace(/\{(date|file)\}/g, (_, key: string) =>
    key === 'date' ? date : (ctx.file ?? '')
  )
}

/**
 * Anchor points for watermark copies over the stage.
 * `textWidth` is needed for tile layout so copies never overlap; corner
 * positions ignore it (they anchor to the stage edges).
 */
export function watermarkPlacements(
  stage: { width: number; height: number },
  position: WatermarkPosition,
  opts: { fontSize: number; textWidth?: number }
): WatermarkPlacement[] {
  const m = WATERMARK_MARGIN
  const corner = (align: 'left' | 'right', y: number): WatermarkPlacement => ({
    x: align === 'left' ? m : stage.width - m,
    y,
    align,
  })

  switch (position) {
    case 'top-left':
      return [corner('left', m)]
    case 'top-right':
      return [corner('right', m)]
    case 'bottom-left':
      return [corner('left', stage.height - m - opts.fontSize)]
    case 'bottom-right':
      return [corner('right', stage.height - m - opts.fontSize)]
    case 'tile': {
      // Ceil here so preview and canvas pass the same effective width —
      // sub-pixel drift would shift every tiled column (review M-2).
      const textW = Math.max(Math.ceil(opts.textWidth ?? opts.fontSize * 4), 1)
      const colGap = Math.max(TILE_SPACING, textW + 48)
      const rowGap = Math.max(opts.fontSize * 4, 24)
      const placements: WatermarkPlacement[] = []
      for (let y = m; y + opts.fontSize <= stage.height - m; y += rowGap) {
        for (let x = m; x + textW <= stage.width - m; x += colGap) {
          placements.push({ x, y, align: 'left' })
        }
      }
      // A text wider than the stage fits nowhere; showing one anchored copy
      // beats silently dropping the user's watermark.
      if (placements.length === 0) placements.push(corner('left', m))
      return placements
    }
  }
}

/** Effective watermark rows, or an empty array when disabled. */
export function watermarkIsEnabled(style: StyleConfig): boolean {
  return style.watermarkText.trim().length > 0
}
