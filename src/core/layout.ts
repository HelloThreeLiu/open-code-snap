/**
 * Pure text layout: tab expansion, blank-line trimming, common-indent strip.
 * Runs BEFORE highlighting so tokens and layout always agree.
 */

export interface LayoutOptions {
  tabSize: number
  /** 0-based line number of the first line (for real line numbers). */
  startLine: number
}

export interface LayoutedLine {
  /** Display text with tabs expanded; never has trailing newline. */
  text: string
  /** 1-based display line number. */
  displayNo: number
  /** Real line number in the source document. */
  realNo: number
}

export interface LayoutedCode {
  lines: LayoutedLine[]
}

/** Expand leading/inner tab characters to spaces. */
export function expandTabs(text: string, tabSize: number): string {
  if (!text.includes('\t')) return text
  const unit = Math.max(1, tabSize)
  return text.replace(/\t/g, () => {
    // Per-line column-aware expansion is overkill here: VS Code selections
    // almost always carry tabs only as leading indentation, where a fixed
    // unit keeps monospace alignment correct.
    return ' '.repeat(unit)
  })
}

/**
 * Layout raw selected code into display lines:
 * 1. expand tabs
 * 2. drop leading/trailing blank lines (real line numbers keep the offset)
 * 3. strip the common leading indentation (polacode/codesnap behavior)
 * 4. assign display + real line numbers
 */
export function layoutCode(code: string, options: LayoutOptions): LayoutedCode {
  const { tabSize, startLine } = options
  if (!code) return { lines: [] }

  const rows = code.replace(/\r\n?/g, '\n').split('\n').map((l) => expandTabs(l, tabSize))

  // Trim fully-blank leading/trailing lines, remembering the leading offset
  // so real (document) line numbers stay correct.
  let leading = 0
  while (leading < rows.length && rows[leading].trim() === '') leading++
  let trailing = rows.length
  while (trailing > leading && rows[trailing - 1].trim() === '') trailing--
  const kept = rows.slice(leading, trailing)
  if (kept.length === 0) return { lines: [] }

  // Strip common indent over lines that have any content.
  const indents = kept
    .filter((r) => r.trim() !== '')
    .map((r) => r.match(/^ */)![0].length)
  const minIndent = Math.min(...indents)
  const lines = (minIndent > 0
    ? kept.map((r) => (r.trim() === '' ? '' : r.slice(minIndent)))
    : kept
  ).map((text, i) => ({
    text,
    displayNo: i + 1,
    realNo: startLine + leading + i + 1,
  }))

  return { lines }
}

/** Which number to show for a line given style settings. */
export function lineNumberFor(line: LayoutedLine, realLineNumbers: boolean): number {
  return realLineNumbers ? line.realNo : line.displayNo
}
