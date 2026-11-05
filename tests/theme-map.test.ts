import { describe, expect, it } from 'vitest'
import { normalizeThemeName, resolveTheme, CURATED_THEMES } from '../src/core/theme-map'

describe('normalizeThemeName', () => {
  it('lowercases and strips punctuation and theme-pack prefixes', () => {
    expect(normalizeThemeName('Dracula Theme: Dracula')).toBe('draculatheme')
    expect(normalizeThemeName('One Dark Pro')).toBe('onedarkpro')
    expect(normalizeThemeName('Default Dark Modern')).toBe('defaultdarkmodern')
  })
})

describe('resolveTheme', () => {
  it('maps VS Code built-ins', () => {
    expect(resolveTheme('Default Dark Modern').id).toBe('github-dark-default')
    expect(resolveTheme('Default Light Modern').id).toBe('github-light-default')
    expect(resolveTheme('Dark+ (default dark)').id).toBe('dark-plus')
    expect(resolveTheme('Monokai').id).toBe('monokai')
    expect(resolveTheme('Visual Studio Dark').id).toBe('dark-plus')
    expect(resolveTheme('Dark (Visual Studio)').id).toBe('dark-plus')
    expect(resolveTheme('Visual Studio Light').id).toBe('light-plus')
  })

  it('maps popular extension themes including pack prefixes', () => {
    expect(resolveTheme('Dracula Theme: Dracula').id).toBe('dracula')
    expect(resolveTheme('Dracula Theme').id).toBe('dracula')
    expect(resolveTheme('One Dark Pro').id).toBe('one-dark-pro')
    expect(resolveTheme('Night Owl').id).toBe('night-owl')
    expect(resolveTheme('GitHub Theme Dark Default').id).toBe('github-dark-default')
  })

  it('maps Noctis variants approximately (Shiki bundles no noctis)', () => {
    const r = resolveTheme('Noctis')
    expect(r.id).toBe('one-dark-pro')
    expect(r.exact).toBe(false)
    expect(r.approx).toBe(true)
    // Unlisted variants fall through to the generic family key.
    const serene = resolveTheme('Noctis Serene')
    expect(serene.id).toBe('one-dark-pro')
    expect(serene.approx).toBe(true)
    expect(resolveTheme('Noctis Minimus').id).toBe('one-dark-pro')
    const lux = resolveTheme('Noctis Lux')
    expect(lux.id).toBe('github-light')
    expect(lux.approx).toBe(true)
  })

  it('falls back with exact=false and a light hint for unknown light themes', () => {
    const r = resolveTheme('Some Unknown Light Theme')
    expect(r.exact).toBe(false)
    expect(r.id).toBe('github-light')
  })

  it('falls back to github-dark for unknown dark themes', () => {
    const r = resolveTheme('Totally Made Up Theme')
    expect(r.exact).toBe(false)
    expect(r.id).toBe('github-dark')
  })

  it('never throws on empty name', () => {
    expect(resolveTheme('').id).toBe('github-dark')
  })
})

describe('CURATED_THEMES', () => {
  it('contains no duplicates', () => {
    expect(new Set(CURATED_THEMES).size).toBe(CURATED_THEMES.length)
  })
})
