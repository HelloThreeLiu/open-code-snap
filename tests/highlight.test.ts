import { describe, expect, it } from 'vitest'
import { KNOWN_LANG_IDS, KNOWN_THEME_IDS, normalizeLang } from '../src/core/highlight'
import { CURATED_LANGUAGES } from '../src/core/languages'
import { ALIASES, APPROX_ALIASES, CURATED_THEMES } from '../src/core/theme-map'

describe('normalizeLang (hang-⑥ case regression)', () => {
  it('maps empty ids to plain text', () => {
    expect(normalizeLang('')).toBe('text')
  })

  it('maps plaintext variants to plain text', () => {
    expect(normalizeLang('plaintext')).toBe('text')
    expect(normalizeLang('plain_text')).toBe('text')
    expect(normalizeLang('plain')).toBe('text')
    expect(normalizeLang('PLAIN')).toBe('text')
  })

  it('lowercases capitalized languageIds (regression)', () => {
    // "TypeScript" previously kept its case, missed the Shiki registry
    // and silently fell back to plain text highlighting.
    expect(normalizeLang('TypeScript')).toBe('typescript')
    expect(normalizeLang('JavaScript')).toBe('javascript')
    expect(normalizeLang('ShellScript')).toBe('shellscript')
  })

  it('keeps already-lowercase ids untouched', () => {
    expect(normalizeLang('python')).toBe('python')
    expect(normalizeLang('cpp')).toBe('cpp')
  })
})

describe('slim registry integrity (M3)', () => {
  it('every curated language has a grammar import', () => {
    for (const { id } of CURATED_LANGUAGES) {
      expect(KNOWN_LANG_IDS.has(id), `missing grammar import for "${id}"`).toBe(true)
    }
  })

  it('every curated theme has a theme import', () => {
    for (const id of CURATED_THEMES) {
      expect(KNOWN_THEME_IDS.has(id), `missing theme import "${id}"`).toBe(true)
    }
  })

  it('every theme-map resolution target has a theme import', () => {
    const targets: string[] = [
      ...Object.values(ALIASES),
      ...Object.values(APPROX_ALIASES),
      'github-dark', // theme-map FALLBACK_THEME
      'github-light', // light-name heuristic fallback
    ]
    for (const id of targets) {
      expect(KNOWN_THEME_IDS.has(id), `theme-map resolves to unimported theme "${id}"`).toBe(true)
    }
  })
})
