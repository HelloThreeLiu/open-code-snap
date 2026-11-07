import { describe, expect, it } from 'vitest'
import { readStyleFromConfig, DEFAULT_STYLE, type ConfigLike } from '../src/core/model'

/** Mock config: `values` = effective values, `explicit` = keys the user actually set. */
function makeConfig(values: Record<string, unknown> = {}, explicit: string[] = []): ConfigLike {
  return {
    get: (section, defaultValue) => (section in values ? (values[section] as never) : defaultValue),
    inspect: (section) =>
      explicit.includes(section) ? { globalValue: values[section] as never } : undefined,
  }
}

describe('readStyleFromConfig defaults', () => {
  it('returns DEFAULT_STYLE for an untouched config', () => {
    const s = readStyleFromConfig(makeConfig(), {})
    expect(s).toEqual(DEFAULT_STYLE)
  })

  it('follows editor font/ligatures when not overridden', () => {
    const s = readStyleFromConfig(makeConfig(), { fontFamily: 'Fira Code', fontLigatures: true })
    expect(s.fontFamily).toBe('Fira Code')
    expect(s.ligatures).toBe(true)
  })
})

describe('lineNumbers enum + legacy migration (PRD F2.3)', () => {
  it('reads the enum when explicitly set', () => {
    expect(readStyleFromConfig(makeConfig({ lineNumbers: 'real' }, ['lineNumbers']), {}).lineNumbers).toBe('real')
    expect(readStyleFromConfig(makeConfig({ lineNumbers: 'off' }, ['lineNumbers']), {}).lineNumbers).toBe('off')
  })

  it('falls back to relative for an invalid enum value', () => {
    expect(readStyleFromConfig(makeConfig({ lineNumbers: 'bogus' }, ['lineNumbers']), {}).lineNumbers).toBe('relative')
  })

  it('migrates legacy showLineNumbers=false to off', () => {
    const s = readStyleFromConfig(makeConfig({ showLineNumbers: false }, ['showLineNumbers']), {})
    expect(s.lineNumbers).toBe('off')
  })

  it('migrates legacy realLineNumbers=true to real', () => {
    const s = readStyleFromConfig(makeConfig({ realLineNumbers: true }, ['realLineNumbers']), {})
    expect(s.lineNumbers).toBe('real')
  })

  it('migrates legacy both-set with off taking precedence', () => {
    const s = readStyleFromConfig(
      makeConfig({ showLineNumbers: false, realLineNumbers: true }, ['showLineNumbers', 'realLineNumbers']),
      {}
    )
    expect(s.lineNumbers).toBe('off')
  })

  it('new key wins over legacy keys when both are set', () => {
    const s = readStyleFromConfig(
      makeConfig({ lineNumbers: 'real', showLineNumbers: false }, ['lineNumbers', 'showLineNumbers']),
      {}
    )
    expect(s.lineNumbers).toBe('real')
  })

  it('diagonal case: explicit relative + legacy off stays relative', () => {
    const s = readStyleFromConfig(
      makeConfig({ lineNumbers: 'relative', showLineNumbers: false }, ['lineNumbers', 'showLineNumbers']),
      {}
    )
    expect(s.lineNumbers).toBe('relative')
  })

  it('explicit null is treated as unset, legacy keys still migrate', () => {
    const s = readStyleFromConfig(
      makeConfig({ lineNumbers: null, showLineNumbers: false }, ['lineNumbers', 'showLineNumbers']),
      {}
    )
    expect(s.lineNumbers).toBe('off')
  })

  it('unset legacy keys yield the relative default (no regression)', () => {
    expect(readStyleFromConfig(makeConfig(), {}).lineNumbers).toBe('relative')
  })
})

describe('new M1 style knobs', () => {
  it('reads shadowOffsetX / languageOverride', () => {
    const s = readStyleFromConfig(
      makeConfig({ shadowOffsetX: -20, languageOverride: 'python' }, ['shadowOffsetX', 'languageOverride']),
      {}
    )
    expect(s.shadowOffsetX).toBe(-20)
    expect(s.languageOverride).toBe('python')
  })
})

describe('M2 background/watermark knobs (F5/F6)', () => {
  it('defaults keep the pre-0.3 solid background and no watermark', () => {
    const s = readStyleFromConfig(makeConfig(), {})
    expect(s.backgroundType).toBe('solid')
    expect(s.watermarkText).toBe('')
    expect(s.gradientAngle).toBe(135)
  })

  it('reads explicit background and watermark values', () => {
    const s = readStyleFromConfig(
      makeConfig(
        {
          backgroundType: 'gradient',
          gradientColorA: '#FF0000',
          gradientColorB: '#0000FF',
          gradientAngle: 45,
          watermarkText: '@liu {date}',
          watermarkPosition: 'tile',
          watermarkFontSize: 18,
          watermarkOpacity: 0.8,
        },
        [
          'backgroundType',
          'gradientColorA',
          'gradientColorB',
          'gradientAngle',
          'watermarkText',
          'watermarkPosition',
          'watermarkFontSize',
          'watermarkOpacity',
        ]
      ),
      {}
    )
    expect(s.backgroundType).toBe('gradient')
    expect(s.gradientColorA).toBe('#FF0000')
    expect(s.gradientColorB).toBe('#0000FF')
    expect(s.gradientAngle).toBe(45)
    expect(s.watermarkText).toBe('@liu {date}')
    expect(s.watermarkPosition).toBe('tile')
    expect(s.watermarkFontSize).toBe(18)
    expect(s.watermarkOpacity).toBe(0.8)
  })
})

describe('retired keys in old settings.json (dom engine removed)', () => {
  it('ignores a leftover exportEngine value and reads everything else', () => {
    // VS Code keeps unknown keys in settings.json; reading must not break
    // and the leftover value must not resurrect a removed field.
    const s = readStyleFromConfig(
      makeConfig({ exportEngine: 'dom', padding: 48 }, ['exportEngine', 'padding']),
      {}
    )
    expect(s).toEqual({ ...DEFAULT_STYLE, padding: 48 })
    expect('exportEngine' in s).toBe(false)
  })
})
