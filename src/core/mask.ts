/**
 * Content redaction masks (PRD F10). A mask hides a char range on one
 * layouted line behind a solid block or same-width asterisks, consistently
 * across preview, canvas and SVG exports. Ranges use half-open [start, end)
 * coordinates on the LAYOUTED line text (what the preview shows). Session
 * state lives in the webview (like F7 lineMarks) — it never crosses the
 * protocol. Pure TS — unit-tested in tests/mask.test.ts.
 */
import { measureText } from './geometry'
import type { Token } from './highlight'

/** Half-open char range [start, end) on one layouted line. */
export interface MaskRange {
  line: number
  start: number
  end: number
}

/** One rendered slice of a line, possibly behind a mask. */
export interface MaskedSegment {
  text: string
  color: string
  italic: boolean
  bold: boolean
  masked: boolean
  /** Original char range within the line (half-open), mask or not. */
  start: number
  end: number
}

/**
 * Normalize: drop empty/inverted ranges, sort, then merge overlapping AND
 * adjacent ranges on the same line. Merged ranges are removed as a whole on
 * click — an accepted trade-off (PRD decision) that keeps rendering and
 * hit-testing trivial. Mutates nothing; the input array is copied.
 */
export function normalizeMasks(masks: MaskRange[]): MaskRange[] {
  const valid = masks.filter(
    (m) =>
      Number.isInteger(m.line) &&
      m.line >= 0 &&
      Number.isInteger(m.start) &&
      Number.isInteger(m.end) &&
      m.start >= 0 &&
      m.end > m.start
  )
  valid.sort((a, b) => a.line - b.line || a.start - b.start)
  const out: MaskRange[] = []
  for (const m of valid) {
    const last = out[out.length - 1]
    if (last && last.line === m.line && m.start <= last.end) {
      if (m.end > last.end) last.end = m.end
    } else {
      out.push({ line: m.line, start: m.start, end: m.end })
    }
  }
  return out
}

/** Add selection ranges (possibly several lines) to the session mask list. */
export function addMasks(existing: MaskRange[], added: MaskRange[]): MaskRange[] {
  return normalizeMasks([...existing, ...added])
}

/** Remove exactly the given normalized range; unmatched input is a no-op. */
export function removeMask(existing: MaskRange[], target: MaskRange): MaskRange[] {
  return existing.filter(
    (m) => !(m.line === target.line && m.start === target.start && m.end === target.end)
  )
}

/** The normalized range fully containing [col, col+len) on `line`, if any. */
export function maskContaining(
  masks: MaskRange[],
  line: number,
  col: number,
  len: number
): MaskRange | undefined {
  return masks.find((m) => m.line === line && m.start <= col && col + len <= m.end)
}

/**
 * Split a line's tokens at mask boundaries. Segments concatenate back to the
 * original token texts; every segment carries its ORIGINAL [start, end) so
 * callers can advance geometry by the untouched width (asterisk mode
 * replaces the text but keeps the total advance) and hit-test clicks.
 */
export function applyMasksToLine(tokens: Token[], ranges: MaskRange[]): MaskedSegment[] {
  const total = tokens.reduce((n, t) => n + t.text.length, 0)
  // Char-level flags make the splitting obvious; line lengths are far below
  // sizes where a per-char array would matter.
  const masked = new Uint8Array(total)
  for (const r of ranges) {
    const from = Math.max(0, r.start)
    const to = Math.min(total, r.end)
    for (let i = from; i < to; i++) masked[i] = 1
  }
  const out: MaskedSegment[] = []
  let offset = 0
  for (const t of tokens) {
    let pos = 0
    while (pos < t.text.length) {
      const isMasked = masked[offset + pos] === 1
      let end = pos + 1
      while (end < t.text.length && (masked[offset + end] === 1) === isMasked) end++
      // Never cut between the halves of a UTF-16 surrogate pair (review m-2):
      // a lone surrogate renders as U+FFFD in DOM/canvas and is INVALID XML
      // in the SVG export. Fold one half over the boundary to keep pairs.
      if (
        end < t.text.length &&
        end > pos + 1 &&
        t.text.charCodeAt(end - 1) >= 0xd800 &&
        t.text.charCodeAt(end - 1) <= 0xdbff &&
        t.text.charCodeAt(end) >= 0xdc00 &&
        t.text.charCodeAt(end) <= 0xdfff
      ) {
        end-- // pair moves wholly into the next segment
      } else if (
        end === pos + 1 &&
        end < t.text.length &&
        t.text.charCodeAt(end - 1) >= 0xd800 &&
        t.text.charCodeAt(end - 1) <= 0xdbff &&
        t.text.charCodeAt(end) >= 0xdc00 &&
        t.text.charCodeAt(end) <= 0xdfff
      ) {
        end++ // boundary at the segment start: fold the pair in here
      }
      out.push({
        text: t.text.slice(pos, end),
        color: t.color,
        italic: t.italic,
        bold: t.bold,
        masked: isMasked,
        start: offset + pos,
        end: offset + end,
      })
      pos = end
    }
    offset += t.text.length
  }
  return out
}

/**
 * Asterisk replacement preserving the original advance width: CJK runs are
 * wider than `*`, so the count derives from the measured width, not the char
 * count. Callers still advance by the ORIGINAL width afterwards.
 */
export function maskAsteriskText(width: number, font: string): string {
  const unit = measureText('*', font)
  if (unit <= 0) return '*'
  return '*'.repeat(Math.max(1, Math.round(width / unit)))
}
