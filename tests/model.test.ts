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

  it('unset legacy keys yield the relative default (no regression)', () => {
    expect(readStyleFromConfig(makeConfig(), {}).lineNumbers).toBe('relative')
  })
})

describe('new M1 style knobs', () => {
  it('reads shadowOffsetX / tabSize / languageOverride', () => {
    const s = readStyleFromConfig(
      makeConfig(
        { shadowOffsetX: -20, tabSize: 8, languageOverride: 'python' },
        ['shadowOffsetX', 'tabSize', 'languageOverride']
      ),
      {}
    )
    expect(s.shadowOffsetX).toBe(-20)
    expect(s.tabSize).toBe(8)
    expect(s.languageOverride).toBe('python')
  })
})
