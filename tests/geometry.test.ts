import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gutterWidth, measureText, setMeasureTextImpl, stageInsets, titleBarHeight } from '../src/core/geometry'
import { DEFAULT_STYLE } from '../src/core/model'
import type { StyleConfig } from '../src/core/protocol'

const style = (overrides: Partial<StyleConfig> = {}): StyleConfig => ({
  ...DEFAULT_STYLE,
  ...overrides,
})

// Deterministic monospace-ish measurement: every char is exactly 8px wide.
const stubMeasure = (text: string): number => text.length * 8

describe('measureText injection', () => {
  it('throws before an implementation is injected', () => {
    setMeasureTextImpl(null)
    expect(() => measureText('a', '12px x')).toThrow()
  })

  it('delegates to the injected implementation', () => {
    setMeasureTextImpl(stubMeasure)
    expect(measureText('abcd', 'ignored')).toBe(32)
  })
})

describe('gutterWidth', () => {
  beforeEach(() => setMeasureTextImpl(stubMeasure))
  afterEach(() => setMeasureTextImpl(null))

  it('is 0 when line numbers are off', () => {
    expect(gutterWidth(10, style({ lineNumbers: 'off' }))).toBe(0)
  })

  it('is 0 when there are no lines', () => {
    expect(gutterWidth(0, style())).toBe(0)
  })

  it('measures the widest number plus the gutter gap', () => {
    // '300' -> 24px, + GUTTER_GAP(16)
    expect(gutterWidth(300, style())).toBe(40)
  })

  it('grows with line count digits', () => {
    // '9' -> 8px, '99' -> 16px
    expect(gutterWidth(9, style())).toBeLessThan(gutterWidth(99, style()))
  })
})

describe('stageInsets (hang-④ negative shadow offset)', () => {
  it('leaves symmetric padding when the shadow has no offset', () => {
    const i = stageInsets(style({ shadowBlur: 40, shadowOffsetX: 0, shadowOffsetY: 0 }))
    // safety = ceil(40/2) = 20
    expect(i).toEqual({ top: 52, right: 52, bottom: 52, left: 52 })
  })

  it('reserves extra room only in the direction the shadow points (positive Y)', () => {
    const i = stageInsets(style({ shadowBlur: 40, shadowOffsetY: 20 }))
    expect(i.top).toBe(52)
    expect(i.bottom).toBe(72) // 52 + 20
  })

  it('moves the shadow margin to the top for negative Y (regression)', () => {
    const i = stageInsets(style({ shadowBlur: 40, shadowOffsetY: -30 }))
    expect(i.top).toBe(82) // 52 + 30 — was clipped before the fix
    expect(i.bottom).toBe(52) // no extra room downward anymore
  })

  it('moves the shadow margin left/right with X offset', () => {
    const i = stageInsets(style({ shadowBlur: 40, shadowOffsetX: -25 }))
    expect(i.left).toBe(77) // 52 + 25
    expect(i.right).toBe(52)
  })

  it('rounds the safety margin up', () => {
    const i = stageInsets(style({ shadowBlur: 33, shadowOffsetY: 0 }))
    expect(i.top).toBe(32 + 17) // ceil(33/2)
  })
})

describe('titleBarHeight', () => {
  it('is 0 when the whole chrome is hidden', () => {
    expect(titleBarHeight(style({ windowStyle: 'none', showWindowTitle: false }))).toBe(0)
  })

  it('scales with font size when chrome is shown', () => {
    expect(titleBarHeight(style({ fontSize: 14 }))).toBe(31)
  })
})
