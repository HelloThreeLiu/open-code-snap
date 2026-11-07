import { describe, expect, it } from 'vitest'
import {
  TILE_SPACING,
  WATERMARK_MARGIN,
  resolveWatermarkText,
  watermarkIsEnabled,
  watermarkPlacements,
} from '../src/core/watermark'

describe('resolveWatermarkText', () => {
  const date = new Date(2026, 10, 8) // 2026-11-08 local

  it('replaces {date} with local YYYY-MM-DD', () => {
    expect(resolveWatermarkText('{date}', { date })).toBe('2026-11-08')
  })

  it('zero-pads month and day', () => {
    expect(resolveWatermarkText('{date}', { date: new Date(2026, 0, 5) })).toBe('2026-01-05')
  })

  it('replaces {file} with the window title', () => {
    expect(resolveWatermarkText('code by @{file}', { file: 'main.ts' })).toBe('code by @main.ts')
  })

  it('replaces multiple variables in one template', () => {
    expect(resolveWatermarkText('{file} · {date}', { date, file: 'a.ts' })).toBe('a.ts · 2026-11-08')
  })

  it('leaves unknown placeholders verbatim', () => {
    expect(resolveWatermarkText('{name} {date}', { date })).toBe('{name} 2026-11-08')
    expect(resolveWatermarkText('{} {date')).toBe('{} {date')
  })

  it('defaults {file} to empty when no title is known', () => {
    expect(resolveWatermarkText('[{file}]', { date })).toBe('[]')
  })

  it('empty template yields empty string', () => {
    expect(resolveWatermarkText('', { date })).toBe('')
  })
})

describe('watermarkPlacements', () => {
  const stage = { width: 400, height: 200 }
  const opts = { fontSize: 14 }

  it('anchors top-left at the corner margin', () => {
    expect(watermarkPlacements(stage, 'top-left', opts)).toEqual([
      { x: WATERMARK_MARGIN, y: WATERMARK_MARGIN, align: 'left' },
    ])
  })

  it('anchors top-right to the right edge', () => {
    const p = watermarkPlacements(stage, 'top-right', opts)[0]
    expect(p).toEqual({ x: stage.width - WATERMARK_MARGIN, y: WATERMARK_MARGIN, align: 'right' })
  })

  it('anchors bottom-right above the bottom margin', () => {
    const p = watermarkPlacements(stage, 'bottom-right', opts)[0]
    expect(p).toEqual({
      x: stage.width - WATERMARK_MARGIN,
      y: stage.height - WATERMARK_MARGIN - opts.fontSize,
      align: 'right',
    })
  })

  it('anchors bottom-left above the bottom margin', () => {
    const p = watermarkPlacements(stage, 'bottom-left', opts)[0]
    expect(p.y).toBe(stage.height - WATERMARK_MARGIN - opts.fontSize)
    expect(p.align).toBe('left')
  })

  it('tiles a grid with non-overlapping columns and rows', () => {
    const textWidth = 100
    const p = watermarkPlacements(stage, 'tile', { ...opts, textWidth })
    expect(p.length).toBeGreaterThan(1)
    // column step = max(TILE_SPACING, textW+48) = 160; rows fit in height.
    expect(p[0]).toEqual({ x: WATERMARK_MARGIN, y: WATERMARK_MARGIN, align: 'left' })
    expect(p[1].x).toBe(WATERMARK_MARGIN + TILE_SPACING)
    for (const item of p) {
      expect(item.x + textWidth).toBeLessThanOrEqual(stage.width - WATERMARK_MARGIN)
      expect(item.y + opts.fontSize).toBeLessThanOrEqual(stage.height - WATERMARK_MARGIN)
    }
  })

  it('tile spacing never exceeds the stage width (single column fallback)', () => {
    // text wider than the stage minus margins -> at least one row appears.
    const p = watermarkPlacements(stage, 'tile', { fontSize: 14, textWidth: 380 })
    expect(p.length).toBeGreaterThanOrEqual(1)
  })
})

describe('watermarkIsEnabled', () => {
  it('is false for empty or whitespace-only text', () => {
    expect(watermarkIsEnabled({ watermarkText: '' } as never)).toBe(false)
    expect(watermarkIsEnabled({ watermarkText: '   ' } as never)).toBe(false)
  })

  it('is true for any non-empty text', () => {
    expect(watermarkIsEnabled({ watermarkText: '@me' } as never)).toBe(true)
  })
})
