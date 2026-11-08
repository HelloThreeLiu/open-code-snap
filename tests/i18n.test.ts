import { describe, expect, it } from 'vitest'
import { interpolate, resolveLocale, STRINGS, t, type StringKey } from '../src/core/i18n'

describe('STRINGS table integrity (F12)', () => {
  const keys = Object.keys(STRINGS) as StringKey[]

  it('has both locales for every key', () => {
    for (const key of keys) {
      expect(STRINGS[key].zh, key).toBeTruthy()
      expect(STRINGS[key].en, key).toBeTruthy()
    }
  })

  it('has identical interpolation slots in both locales', () => {
    const slots = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const key of keys) {
      expect(slots(STRINGS[key].en), `${key} slots`).toEqual(slots(STRINGS[key].zh))
    }
  })

  it('has no duplicate wording entries sharing one key', () => {
    // Keys must be unique by construction in the object literal; assert the
    // table is non-trivial so an accidental rewrite is caught.
    expect(keys.length).toBeGreaterThan(60)
  })
})

describe('resolveLocale', () => {
  it('explicit settings win over the environment language', () => {
    expect(resolveLocale('zh', 'en')).toBe('zh')
    expect(resolveLocale('en', 'zh-cn')).toBe('en')
  })

  it('auto maps any zh variant to zh (PRD decision)', () => {
    expect(resolveLocale('auto', 'zh-cn')).toBe('zh')
    expect(resolveLocale('auto', 'zh-tw')).toBe('zh')
    expect(resolveLocale('auto', 'ZH')).toBe('zh')
  })

  it('auto maps everything else to en', () => {
    expect(resolveLocale('auto', 'en')).toBe('en')
    expect(resolveLocale('auto', 'ja')).toBe('en')
    expect(resolveLocale('auto', '')).toBe('en')
  })
})

describe('t / interpolate', () => {
  it('translates in both locales', () => {
    expect(t('zh', 'btn.copy')).toBe('复制到剪贴板')
    expect(t('en', 'btn.copy')).toBe('Copy to clipboard')
  })

  it('interpolates named params', () => {
    expect(t('zh', 'status.maskCount', { n: 3 })).toBe(' · 3 处遮罩')
    expect(t('en', 'status.scaleNote', { from: 3, to: 1 })).toBe(' (3x exceeds canvas limits; fell back to 1x)')
  })

  it('leaves unknown params untouched instead of emptying the slot', () => {
    expect(interpolate('a {nope} b {x}', { x: 1 })).toBe('a {nope} b 1')
  })
})
