import { describe, expect, it } from 'vitest'
import { MARK_COLORS, MARK_SVG_COLORS, nextMark } from '../src/core/diff'

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
  it('row washes are translucent, accents are opaque (exact GitHub palette)', () => {
    expect(MARK_COLORS.added).toEqual({ rowBg: 'rgba(63, 185, 80, 0.16)', accent: 'rgb(63, 185, 80)' })
    expect(MARK_COLORS.removed).toEqual({ rowBg: 'rgba(248, 81, 73, 0.16)', accent: 'rgb(248, 81, 73)' })
  })

  it('SVG palette channels match the rgba() palette exactly (review M-6)', () => {
    expect(MARK_SVG_COLORS.added).toEqual({ fill: '#3fb950', opacity: 0.16 })
    expect(MARK_SVG_COLORS.removed).toEqual({ fill: '#f85149', opacity: 0.16 })
  })
})
