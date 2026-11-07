import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gutterWidth, measureText, setMeasureTextImpl } from '../src/core/geometry'
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
