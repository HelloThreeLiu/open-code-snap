import { describe, expect, it } from 'vitest'
import { validateSettingUpdate, SETTING_RULES } from '../src/core/settings'
import { DEFAULT_STYLE } from '../src/core/model'

/** Every StyleConfig knob the webview can write back must be whitelisted. */
describe('SETTING_RULES covers the style surface', () => {
  it('has a rule for every key of DEFAULT_STYLE', () => {
    for (const key of Object.keys(DEFAULT_STYLE)) {
      expect(SETTING_RULES[key], `missing rule for "${key}"`).toBeDefined()
    }
  })
})

describe('validateSettingUpdate', () => {
  it('accepts valid values of every type', () => {
    expect(validateSettingUpdate('theme', 'one-dark-pro')).toEqual({ ok: true, value: 'one-dark-pro' })
    expect(validateSettingUpdate('theme', '')).toEqual({ ok: true, value: '' })
    expect(validateSettingUpdate('padding', 32)).toEqual({ ok: true, value: 32 })
    expect(validateSettingUpdate('showWindowTitle', false)).toEqual({ ok: true, value: false })
  })

  it('accepts boundary values', () => {
    expect(validateSettingUpdate('padding', 0).ok).toBe(true)
    expect(validateSettingUpdate('padding', 128).ok).toBe(true)
    expect(validateSettingUpdate('shadowOffsetY', -128).ok).toBe(true)
    expect(validateSettingUpdate('fontSize', 8).ok).toBe(true)
    expect(validateSettingUpdate('lineHeight', 3).ok).toBe(true)
  })

  it('rejects out-of-range numbers', () => {
    expect(validateSettingUpdate('padding', -1).ok).toBe(false)
    expect(validateSettingUpdate('padding', 129).ok).toBe(false)
    expect(validateSettingUpdate('fontSize', 7).ok).toBe(false)
    expect(validateSettingUpdate('lineHeight', 0.5).ok).toBe(false)
  })

  it('rejects non-finite numbers', () => {
    expect(validateSettingUpdate('padding', NaN).ok).toBe(false)
    expect(validateSettingUpdate('padding', Infinity).ok).toBe(false)
    expect(validateSettingUpdate('shadowBlur', -Infinity).ok).toBe(false)
  })

  it('rejects enum violations', () => {
    expect(validateSettingUpdate('exportEngine', 'svg').ok).toBe(false)
    expect(validateSettingUpdate('windowStyle', 'linux').ok).toBe(false)
    expect(validateSettingUpdate('exportScale', 4).ok).toBe(false)
    expect(validateSettingUpdate('exportScale', 2).ok).toBe(true)
  })

  it('rejects wrong types', () => {
    expect(validateSettingUpdate('padding', '32').ok).toBe(false)
    expect(validateSettingUpdate('theme', 42).ok).toBe(false)
    expect(validateSettingUpdate('ligatures', 'true').ok).toBe(false)
    expect(validateSettingUpdate('ligatures', 1).ok).toBe(false)
  })

  it('rejects unknown keys (no write path beyond the whitelist)', () => {
    expect(validateSettingUpdate('windowTitle', 'evil.png').ok).toBe(false)
    expect(validateSettingUpdate('__proto__', 'x').ok).toBe(false)
    expect(validateSettingUpdate('constructor', 'x').ok).toBe(false)
    expect(validateSettingUpdate('', 'x').ok).toBe(false)
  })

  it('rejects oversized strings', () => {
    expect(validateSettingUpdate('theme', 'a'.repeat(257)).ok).toBe(false)
    expect(validateSettingUpdate('theme', 'a'.repeat(256)).ok).toBe(true)
    expect(validateSettingUpdate('fontFamily', 'x'.repeat(1000)).ok).toBe(false)
  })

  it('validates new M1 keys at value level', () => {
    expect(validateSettingUpdate('lineNumbers', 'real').ok).toBe(true)
    expect(validateSettingUpdate('lineNumbers', 'absolute').ok).toBe(false)
    expect(validateSettingUpdate('tabSize', 0).ok).toBe(true)
    expect(validateSettingUpdate('tabSize', 17).ok).toBe(false)
    expect(validateSettingUpdate('shadowOffsetX', -128).ok).toBe(true)
    expect(validateSettingUpdate('shadowOffsetX', 129).ok).toBe(false)
    expect(validateSettingUpdate('languageOverride', 'vue').ok).toBe(true)
  })

  it('gives a reason mentioning the key on failure', () => {
    const result = validateSettingUpdate('padding', -1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('padding')
  })
})
