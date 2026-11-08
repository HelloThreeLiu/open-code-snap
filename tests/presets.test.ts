import { describe, expect, it } from 'vitest'
import { sanitizePreset, serializePreset, validatePresetName } from '../src/core/presets'
import { DEFAULT_STYLE } from '../src/core/model'
import type { StyleConfig } from '../src/core/protocol'

describe('validatePresetName', () => {
  it('trims and accepts ordinary names', () => {
    expect(validatePresetName('  团队默认  ')).toBe('团队默认')
  })

  it('rejects empty and over-long names', () => {
    expect(validatePresetName('   ')).toBeNull()
    expect(validatePresetName('')).toBeNull()
    expect(validatePresetName('x'.repeat(65))).toBeNull()
    expect(validatePresetName('x'.repeat(64))).not.toBeNull()
  })
})

describe('sanitizePreset', () => {
  it('accepts the {version, settings} envelope and the bare settings object', () => {
    const enveloped = sanitizePreset({ version: 1, settings: { padding: 48 } })
    expect(enveloped).toEqual({ ok: true, settings: { padding: 48 } })
    expect(sanitizePreset({ padding: 48 })).toEqual({ ok: true, settings: { padding: 48 } })
  })

  it('rejects non-object payloads', () => {
    expect(sanitizePreset(null).ok).toBe(false)
    expect(sanitizePreset('padding=48').ok).toBe(false)
    expect(sanitizePreset([1, 2]).ok).toBe(false)
    expect(sanitizePreset({ settings: 42 }).ok).toBe(false)
  })

  it('drops unknown keys, type violations and out-of-range values', () => {
    const r = sanitizePreset({
      padding: 48,
      evil: 'nope',
      fontSize: 'big',
      shadowBlur: -1,
      backgroundType: 'noise',
      watermarkOpacity: 2,
    })
    expect(r.ok && r.settings).toEqual({ padding: 48 })
  })

  it('never lets prototype pollution through', () => {
    const r = sanitizePreset({ __proto__: { evil: true }, constructor: { x: 1 }, padding: 8 })
    expect(r.ok && r.settings).toEqual({ padding: 8 })
    expect(Object.keys(r.ok ? r.settings : {})).not.toContain('__proto__')
  })
})

describe('serialize/sanitize round trip (roadmap M2 acceptance)', () => {
  const styled: StyleConfig = {
    ...DEFAULT_STYLE,
    backgroundType: 'gradient',
    gradientColorA: '#112233',
    gradientAngle: 90,
    watermarkText: '@me {date}',
    watermarkPosition: 'tile',
    watermarkOpacity: 0.8,
    theme: 'one-dark-pro',
    fontFamily: 'Fira Code',
  }

  it('applies every StyleConfig key to the exported file', () => {
    const file = serializePreset(styled)
    // Exactly the StyleConfig surface: document-dependent tabSize lives in
    // SnippetRequest.font and must not be frozen into a preset.
    expect(Object.keys(file.settings)).toEqual(Object.keys({ ...DEFAULT_STYLE }))
    expect(file.version).toBe(1)
  })

  it('survives JSON stringify/parse with zero loss', () => {
    const file = serializePreset(styled)
    const parsed = JSON.parse(JSON.stringify(file)) // through a real file round trip
    const r = sanitizePreset(parsed)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // The sanitized subset must reproduce the source style exactly.
    for (const [key, value] of Object.entries(r.settings)) {
      expect((styled as unknown as Record<string, unknown>)[key]).toEqual(value)
    }
    expect(Object.keys(r.settings).length).toBe(Object.keys(serializePreset(styled).settings).length)
  })

  it('default style round trips to itself', () => {
    const parsed = JSON.parse(JSON.stringify(serializePreset(DEFAULT_STYLE)))
    const r = sanitizePreset(parsed)
    expect(r.ok && r.settings).toEqual({ ...DEFAULT_STYLE })
  })
})
