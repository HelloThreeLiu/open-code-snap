import { describe, expect, it } from 'vitest'
import { expandTabs, layoutCode, lineNumberFor, maxLineNumber } from '../src/core/layout'

describe('expandTabs', () => {
  it('leaves text without tabs untouched', () => {
    expect(expandTabs('const a = 1', 4)).toBe('const a = 1')
  })
  it('expands tabs to the given unit', () => {
    expect(expandTabs('\treturn 1', 2)).toBe('  return 1')
  })
})

describe('layoutCode', () => {
  it('returns empty for empty input', () => {
    expect(layoutCode('', { tabSize: 4, startLine: 0 }).lines).toEqual([])
  })

  it('returns empty for whitespace-only input', () => {
    expect(layoutCode('\n\n   \n', { tabSize: 4, startLine: 0 }).lines).toEqual([])
  })

  it('trims leading/trailing blank lines', () => {
    const { lines } = layoutCode('\n\nconst a = 1\n\n\n', { tabSize: 4, startLine: 0 })
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('const a = 1')
  })

  it('keeps real line numbers offset when leading blanks are trimmed', () => {
    const { lines } = layoutCode('\n\nconst a = 1\nconst b = 2', { tabSize: 4, startLine: 9 })
    expect(lines[0].realNo).toBe(12) // doc lines 10,11 blank; first kept = 12
    expect(lines[0].displayNo).toBe(1)
    expect(lines[1].realNo).toBe(13)
  })

  it('strips common indentation but keeps relative indent', () => {
    const code = '        function f() {\n            return 1\n        }'
    const { lines } = layoutCode(code, { tabSize: 4, startLine: 0 })
    expect(lines[0].text).toBe('function f() {')
    expect(lines[1].text).toBe('    return 1')
    expect(lines[2].text).toBe('}')
  })

  it('does not strip when any line has no indent', () => {
    const code = '    a\nb'
    const { lines } = layoutCode(code, { tabSize: 4, startLine: 0 })
    expect(lines[0].text).toBe('    a')
  })

  it('expands tabs before indent measurement', () => {
    const { lines } = layoutCode('\tconst a = 1\n\t\tb', { tabSize: 4, startLine: 0 })
    expect(lines[0].text).toBe('const a = 1')
    expect(lines[1].text).toBe('    b')
  })

  it('handles CRLF line endings', () => {
    const { lines } = layoutCode('const a = 1\r\nconst b = 2\r\n', { tabSize: 4, startLine: 0 })
    expect(lines).toHaveLength(2)
    expect(lines[1].text).toBe('const b = 2')
  })
})

describe('lineNumberFor', () => {
  const line = { text: 'x', displayNo: 1, realNo: 42 }
  it('uses display numbers in relative mode', () => {
    expect(lineNumberFor(line, 'relative')).toBe(1)
  })
  it('uses real numbers in real mode', () => {
    expect(lineNumberFor(line, 'real')).toBe(42)
  })
})

describe('maxLineNumber', () => {
  it('returns 0 for empty layout', () => {
    expect(maxLineNumber([], 'real')).toBe(0)
    expect(maxLineNumber([], 'relative')).toBe(0)
  })
  it('counts lines in relative mode', () => {
    const { lines } = layoutCode('a\nb\nc', { tabSize: 4, startLine: 0 })
    expect(maxLineNumber(lines, 'relative')).toBe(3)
  })
  it('uses the last realNo in real mode, including trimmed leading blanks', () => {
    // Two leading blank lines are dropped but keep their document offset:
    // doc line 1 (0-based startLine=0) blank, line 2 blank, lines 3-4 kept.
    const { lines } = layoutCode('\n\nconst a = 1\nconst b = 2', { tabSize: 4, startLine: 0 })
    expect(lines).toHaveLength(2)
    expect(lines[1].realNo).toBe(4)
    // Regression (review M-1): startLine + length (2) understates the true
    // max; the gutter then runs a digit short on digit-boundary crossings.
    expect(maxLineNumber(lines, 'real')).toBe(4)
  })
})
