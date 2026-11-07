import { describe, expect, it } from 'vitest'
import {
  colorLuminance,
  contrastOverlay,
  cssPaintSizes,
  cssPaintString,
  gradientEndpoints,
  mixColors,
  paintAccent,
  resolveBackgroundPaint,
} from '../src/core/background'
import { DEFAULT_STYLE } from '../src/core/model'
import type { StyleConfig } from '../src/core/protocol'

const style = (overrides: Partial<StyleConfig> = {}): StyleConfig => ({
  ...DEFAULT_STYLE,
  ...overrides,
})

describe('colorLuminance', () => {
  it('parses 6-digit and 3-digit hex', () => {
    expect(colorLuminance('#ffffff')).toBeCloseTo(1)
    expect(colorLuminance('#000000')).toBe(0)
    expect(colorLuminance('#fff')).toBeCloseTo(1)
  })

  it('parses rgb()/rgba()', () => {
    expect(colorLuminance('rgb(255, 255, 255)')).toBeCloseTo(1)
    expect(colorLuminance('rgba(0, 0, 0, 0.5)')).toBe(0)
  })

  it('returns null for unknown formats', () => {
    expect(colorLuminance('rebeccapurple')).toBeNull()
    expect(colorLuminance('')).toBeNull()
  })
})

describe('contrastOverlay', () => {
  it('gives a dark overlay on the default light background', () => {
    expect(contrastOverlay('#abb8c3')).toBe('rgba(0, 0, 0, 0.14)')
  })

  it('gives a light overlay on the default editor-dark background', () => {
    expect(contrastOverlay('#1e1e1e')).toBe('rgba(255, 255, 255, 0.14)')
  })

  it('treats unparseable colors as dark (light overlay)', () => {
    expect(contrastOverlay('azure')).toBe('rgba(255, 255, 255, 0.14)')
  })
})

describe('resolveBackgroundPaint', () => {
  it('defaults to solid with backgroundColor', () => {
    expect(resolveBackgroundPaint(style())).toEqual({ type: 'solid', color: '#abb8c3' })
  })

  it('resolves gradient with both colors and angle', () => {
    const p = resolveBackgroundPaint(style({ backgroundType: 'gradient' }))
    expect(p).toEqual({ type: 'gradient', colorA: '#7093FF', colorB: '#B379F5', angle: 135 })
  })

  it('resolves grid with an auto-derived line color', () => {
    const p = resolveBackgroundPaint(style({ backgroundType: 'grid' }))
    expect(p).toEqual({
      type: 'grid',
      color: '#abb8c3',
      lineColor: 'rgba(0, 0, 0, 0.14)',
      spacing: 24,
      thickness: 1,
    })
  })

  it('resolves dots with an auto-derived dot color', () => {
    const p = resolveBackgroundPaint(style({ backgroundType: 'dots', backgroundColor: '#111111' }))
    expect(p).toEqual({
      type: 'dots',
      color: '#111111',
      dotColor: 'rgba(255, 255, 255, 0.14)',
      spacing: 24,
      radius: 1.5,
    })
  })
})

describe('cssPaintString / cssPaintSizes', () => {
  it('solid is the bare color', () => {
    expect(cssPaintString(resolveBackgroundPaint(style()))).toBe('#abb8c3')
    expect(cssPaintSizes(resolveBackgroundPaint(style()))).toEqual([])
  })

  it('gradient uses CSS angle syntax', () => {
    expect(cssPaintString(resolveBackgroundPaint(style({ backgroundType: 'gradient' })))).toBe(
      'linear-gradient(135deg, #7093FF, #B379F5)'
    )
    expect(cssPaintSizes(resolveBackgroundPaint(style({ backgroundType: 'gradient' })))).toEqual([])
  })

  it('grid has two tiled layers with matching sizes', () => {
    const paint = resolveBackgroundPaint(style({ backgroundType: 'grid' }))
    expect(cssPaintString(paint)).toContain('linear-gradient(to right,')
    expect(cssPaintString(paint)).toContain('linear-gradient(to bottom,')
    expect(cssPaintSizes(paint)).toEqual(['24px 24px', '24px 24px'])
  })

  it('dots is a radial circle with one tiled layer', () => {
    const paint = resolveBackgroundPaint(style({ backgroundType: 'dots' }))
    expect(cssPaintString(paint)).toBe('radial-gradient(circle, rgba(0, 0, 0, 0.14) 1.5px, transparent 1.5px)')
    expect(cssPaintSizes(paint)).toEqual(['24px 24px'])
  })
})

describe('mixColors / paintAccent (review M-4/N-5)', () => {
  it('blends two hex colors at the midpoint', () => {
    expect(mixColors('#000000', '#ffffff')).toBe('#808080')
    expect(mixColors('#102030', '#304050')).toBe('#203040')
  })

  it('expands 3-digit hex before blending', () => {
    expect(mixColors('#000', '#fff')).toBe('#808080')
  })

  it('falls back to the first color on unparseable input', () => {
    expect(mixColors('azure', '#ffffff')).toBe('azure')
    expect(mixColors('#123456', 'nope')).toBe('#123456')
  })

  it('paintAccent uses the gradient midpoint, plain color otherwise', () => {
    expect(
      paintAccent({ type: 'gradient', colorA: '#000000', colorB: '#ffffff', angle: 90 })
    ).toBe('#808080')
    expect(paintAccent({ type: 'solid', color: '#abb8c3' })).toBe('#abb8c3')
  })
})

describe('gradient color guard (review M-3)', () => {
  it('falls back invalid gradient colors to their partner, then backgroundColor', () => {
    const p = resolveBackgroundPaint(
      style({ backgroundType: 'gradient', gradientColorA: '#ff00zz', gradientColorB: '#B379F5' })
    )
    expect(p).toMatchObject({ type: 'gradient', colorA: '#B379F5', colorB: '#B379F5' })

    const both = resolveBackgroundPaint(
      style({ backgroundType: 'gradient', gradientColorA: 'junk', gradientColorB: 'garbage' })
    )
    expect(both).toMatchObject({ type: 'gradient', colorA: '#abb8c3', colorB: '#abb8c3' })
  })
})

describe('gradientEndpoints (CSS angle semantics)', () => {
  it('0deg runs bottom -> top (to top)', () => {
    const e = gradientEndpoints(0, 100, 100)
    expect(e.x1).toBeCloseTo(50)
    expect(e.y1).toBeCloseTo(100) // start = bottom
    expect(e.x2).toBeCloseTo(50)
    expect(e.y2).toBeCloseTo(0)
  })

  it('90deg runs left -> right (to right)', () => {
    const e = gradientEndpoints(90, 100, 100)
    expect(e.x1).toBeCloseTo(0)
    expect(e.x2).toBeCloseTo(100)
    expect(e.y1).toBeCloseTo(50)
    expect(e.y2).toBeCloseTo(50)
  })

  it('180deg runs top -> bottom with colorA on top', () => {
    const e = gradientEndpoints(180, 100, 100)
    expect(e.y1).toBeCloseTo(0)
    expect(e.y2).toBeCloseTo(100)
  })

  it('135deg on a square runs the top-left -> bottom-right diagonal', () => {
    const e = gradientEndpoints(135, 100, 100)
    expect(e.x1).toBeCloseTo(0)
    expect(e.y1).toBeCloseTo(0)
    expect(e.x2).toBeCloseTo(100)
    expect(e.y2).toBeCloseTo(100)
  })

  it('non-square rect extends the gradient line past the corners', () => {
    // len = |200*sin45| + |100*cos45| = 212.1; endpoints overshoot the rect.
    const e = gradientEndpoints(135, 200, 100)
    const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1)
    expect(len).toBeCloseTo(Math.abs(200 * Math.SQRT1_2) + Math.abs(100 * Math.SQRT1_2))
  })
})
