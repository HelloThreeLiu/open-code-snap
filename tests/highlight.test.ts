import { describe, expect, it } from 'vitest'
import { normalizeLang } from '../src/core/highlight'

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
