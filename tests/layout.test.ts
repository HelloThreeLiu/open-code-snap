import { describe, expect, it } from 'vitest'
import { expandTabs, layoutCode, lineNumberFor } from '../src/core/layout'

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
  it('uses display numbers by default', () => {
    expect(lineNumberFor(line, false)).toBe(1)
  })
  it('uses real numbers when enabled', () => {
    expect(lineNumberFor(line, true)).toBe(42)
  })
})
