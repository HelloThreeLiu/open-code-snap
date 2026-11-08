/**
 * Line diff marking (PRD F7). Session-level state: the webview keeps
 * per-line marks while the panel shows a snapshot; exporters consume the
 * same palette so preview, canvas and SVG all stain identically.
 * Pure TS — unit-tested in tests/diff.test.ts.
 */

export type LineMark = 'added' | 'removed'

/** GitHub diff palette: a subtle row wash plus a saturated gutter accent. */
export const MARK_COLORS: Record<LineMark, { rowBg: string; accent: string }> = {
  added: { rowBg: 'rgba(63, 185, 80, 0.16)', accent: 'rgb(63, 185, 80)' },
  removed: { rowBg: 'rgba(248, 81, 73, 0.16)', accent: 'rgb(248, 81, 73)' },
}

/**
 * Same wash as fill+opacity for SVG: PPT's renderer is unreliable on rgba()
 * fills (review M-6). Hex values match MARK_COLORS' rgb() channels exactly.
 */
export const MARK_SVG_COLORS: Record<LineMark, { fill: string; opacity: number }> = {
  added: { fill: '#3fb950', opacity: 0.16 },
  removed: { fill: '#f85149', opacity: 0.16 },
}

/** Click cycle on a line number: unmarked → added(+) → removed(−) → unmarked. */
export function nextMark(current: LineMark | undefined): LineMark | undefined {
  if (!current) return 'added'
  if (current === 'added') return 'removed'
  return undefined
}
