import { describe, expect, it } from 'vitest'
import { MARK_COLORS, nextMark } from '../src/core/diff'

describe('nextMark (F7 click cycle)', () => {
  it('starts at added', () => {
    expect(nextMark(undefined)).toBe('added')
  })

  it('cycles added -> removed -> unmarked', () => {
    expect(nextMark('added')).toBe('removed')
    expect(nextMark('removed')).toBeUndefined()
  })

  it('is stable across repeated calls', () => {
    let mark: 'added' | 'removed' | undefined
    const seq = []
    for (let i = 0; i < 6; i++) {
      mark = nextMark(mark)
      seq.push(mark)
    }
    expect(seq).toEqual(['added', 'removed', undefined, 'added', 'removed', undefined])
  })
})

describe('MARK_COLORS palette', () => {
  it('row washes are translucent, accents are opaque', () => {
    for (const { rowBg, accent } of Object.values(MARK_COLORS)) {
      expect(rowBg).toMatch(/rgba\(\d+, \d+, \d+, 0\.16\)/)
      expect(accent).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
    }
  })
})
