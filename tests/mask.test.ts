import { beforeEach, describe, expect, it } from 'vitest'
import { setMeasureTextImpl } from '../src/core/geometry'
import {
  addMasks,
  applyMasksToLine,
  maskAsteriskText,
  maskContaining,
  normalizeMasks,
  removeMask,
} from '../src/core/mask'
import type { Token } from '../src/core/highlight'

const tok = (text: string, color = '#fff', italic = false, bold = false): Token => ({
  text,
  color,
  italic,
  bold,
})

beforeEach(() => {
  // 1 char = 1px; enough for asterisk-width math.
  setMeasureTextImpl((t) => t.length)
})

describe('normalizeMasks', () => {
  it('drops empty, inverted and malformed ranges', () => {
    expect(
      normalizeMasks([
        { line: 0, start: 5, end: 5 },
        { line: 0, start: 3, end: 1 },
        { line: 0, start: -2, end: 4 },
        { line: 0.5, start: 0, end: 2 },
        { line: 0, start: 0, end: 2 },
      ])
    ).toEqual([{ line: 0, start: 0, end: 2 }])
  })

  it('sorts by line then start', () => {
    expect(
      normalizeMasks([
        { line: 2, start: 0, end: 1 },
        { line: 0, start: 4, end: 6 },
        { line: 0, start: 0, end: 1 },
      ])
    ).toEqual([
      { line: 0, start: 0, end: 1 },
      { line: 0, start: 4, end: 6 },
      { line: 2, start: 0, end: 1 },
    ])
  })

  it('merges overlapping and adjacent ranges on the same line', () => {
    expect(
      normalizeMasks([
        { line: 0, start: 0, end: 5 },
        { line: 0, start: 3, end: 8 },
        { line: 0, start: 8, end: 9 },
      ])
    ).toEqual([{ line: 0, start: 0, end: 9 }])
  })

  it('keeps disjoint ranges and never merges across lines', () => {
    expect(
      normalizeMasks([
        { line: 0, start: 0, end: 2 },
        { line: 0, start: 4, end: 6 },
        { line: 1, start: 0, end: 2 },
      ])
    ).toEqual([
      { line: 0, start: 0, end: 2 },
      { line: 0, start: 4, end: 6 },
      { line: 1, start: 0, end: 2 },
    ])
  })

  it('does not mutate the input array', () => {
    const input = [
      { line: 0, start: 0, end: 2 },
      { line: 0, start: 1, end: 3 },
    ]
    normalizeMasks(input)
    expect(input).toEqual([
      { line: 0, start: 0, end: 2 },
      { line: 0, start: 1, end: 3 },
    ])
  })
})

describe('addMasks / removeMask', () => {
  it('adds and merges with existing masks', () => {
    const existing = [{ line: 0, start: 0, end: 4 }]
    expect(addMasks(existing, [{ line: 0, start: 2, end: 6 }])).toEqual([
      { line: 0, start: 0, end: 6 },
    ])
  })

  it('removes an exact normalized range only', () => {
    const masks = [
      { line: 0, start: 0, end: 4 },
      { line: 1, start: 2, end: 6 },
    ]
    expect(removeMask(masks, { line: 0, start: 0, end: 4 })).toEqual([{ line: 1, start: 2, end: 6 }])
    // A sub-range is NOT removed (clicks always pass whole normalized ranges).
    expect(removeMask(masks, { line: 1, start: 2, end: 4 })).toEqual(masks)
  })
})

describe('maskContaining', () => {
  const masks = [
    { line: 0, start: 2, end: 8 },
    { line: 1, start: 0, end: 3 },
  ]

  it('finds the owning range for a segment inside it', () => {
    expect(maskContaining(masks, 0, 4, 2)).toEqual({ line: 0, start: 2, end: 8 })
    expect(maskContaining(masks, 1, 0, 3)).toEqual({ line: 1, start: 0, end: 3 })
  })

  it('rejects ranges outside or straddling a mask', () => {
    expect(maskContaining(masks, 0, 0, 2)).toBeUndefined()
    expect(maskContaining(masks, 0, 6, 4)).toBeUndefined()
    expect(maskContaining(masks, 2, 0, 1)).toBeUndefined()
  })
})

describe('applyMasksToLine', () => {
  it('passes tokens through untouched when there are no masks', () => {
    const tokens = [tok('const', '#a'), tok(' x', '#b')]
    expect(applyMasksToLine(tokens, [])).toEqual([
      { text: 'const', color: '#a', italic: false, bold: false, masked: false, start: 0, end: 5 },
      { text: ' x', color: '#b', italic: false, bold: false, masked: false, start: 5, end: 7 },
    ])
  })

  it('splits one token into three around an interior mask', () => {
    const segments = applyMasksToLine([tok('password')], [{ line: 0, start: 3, end: 6 }])
    expect(segments.map((s) => [s.text, s.masked, s.start, s.end])).toEqual([
      ['pas', false, 0, 3],
      ['swo', true, 3, 6],
      ['rd', false, 6, 8],
    ])
  })

  it('masks across token boundaries keeping per-token colors', () => {
    const segments = applyMasksToLine(
      [tok('api', '#a'), tok('Key', '#b'), tok(' =', '#c')],
      [{ line: 0, start: 1, end: 5 }]
    )
    expect(segments.map((s) => [s.text, s.color, s.masked])).toEqual([
      ['a', '#a', false],
      ['pi', '#a', true],
      ['Ke', '#b', true],
      ['y', '#b', false],
      [' =', '#c', false],
    ])
  })

  it('clips ranges beyond the line length', () => {
    const segments = applyMasksToLine([tok('ab')], [{ line: 0, start: 1, end: 99 }])
    expect(segments.map((s) => [s.text, s.masked])).toEqual([
      ['a', false],
      ['b', true],
    ])
  })

  it('handles two disjoint masks on one line', () => {
    const segments = applyMasksToLine(
      [tok('secret_one_two')],
      [
        { line: 0, start: 0, end: 6 },
        { line: 0, start: 10, end: 13 },
      ]
    )
    expect(segments.map((s) => [s.text, s.masked])).toEqual([
      ['secret', true],
      ['_one', false],
      ['_tw', true],
      ['o', false],
    ])
  })

  it('returns nothing for a blank line even with a stray range', () => {
    expect(applyMasksToLine([], [{ line: 0, start: 0, end: 4 }])).toEqual([])
  })

  it('keeps the concatenation invariant (segments rebuild the line text)', () => {
    const tokens = [tok('你好'), tok(' world'), tok('！', '#x')]
    const segments = applyMasksToLine(tokens, [{ line: 0, start: 2, end: 7 }])
    expect(segments.map((s) => s.text).join('')).toBe('你好 world！')
    expect(segments.filter((s) => s.masked).map((s) => [s.text, s.start, s.end])).toEqual([
      [' worl', 2, 7],
    ])
    // CJK runs: width-derived asterisks must still cover the original span.
    const cjk = applyMasksToLine([tok('密码是abc123')], [{ line: 0, start: 0, end: 3 }])
    expect(cjk.map((s) => [s.text, s.masked])).toEqual([
      ['密码是', true],
      ['abc123', false],
    ])
  })
})

describe('maskAsteriskText', () => {
  it('repeats per measured width with a 1px unit', () => {
    expect(maskAsteriskText(5, 'font')).toBe('*****')
    expect(maskAsteriskText(2.4, 'font')).toBe('**')
  })

  it('never returns an empty replacement', () => {
    expect(maskAsteriskText(0.4, 'font')).toBe('*')
    expect(maskAsteriskText(0, 'font')).toBe('*')
  })
})
