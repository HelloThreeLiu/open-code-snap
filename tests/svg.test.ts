import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { esc, exportSvgString } from '../webview/export/svg'
import { setMeasureTextImpl, setMeasureFontBoxImpl } from '../src/core/geometry'
import { layoutCode } from '../src/core/layout'
import type { HighlightResult } from '../src/core/highlight'
import { DEFAULT_STYLE } from '../src/core/model'
import type { CanvasExportInput } from '../webview/export/canvas'

// Deterministic measurement: every char is exactly 8px wide.
const stubMeasure = (text: string): number => text.length * 8

const highlight: HighlightResult = {
  lines: [{ tokens: [{ text: 'const', color: '#c586c0', italic: false, bold: false }] }],
  colors: { fg: '#d4d4d4', bg: '#1e1e1e', type: 'dark' },
}

function makeInput(overrides: Partial<CanvasExportInput> = {}): CanvasExportInput {
  return {
    layout: layoutCode('const a = 1\nconst b = 2', { tabSize: 4, startLine: 0 }),
    highlight: {
      lines: [
        highlight.lines[0],
        { tokens: [{ text: 'const b = 2', color: '#d4d4d4', italic: false, bold: false }] },
      ],
      colors: highlight.colors,
    },
    style: { ...DEFAULT_STYLE },
    gutterWidth: 40,
    windowTitle: 'main.ts',
    lineMarks: {},
    masks: [],
    ...overrides,
  }
}

describe('esc (review M-3)', () => {
  it('escapes the five XML-significant characters', () => {
    expect(esc(`<a href="x">&'y'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;y&apos;&lt;/a&gt;')
  })

  it('strips XML-forbidden control characters', () => {
    expect(esc('a\u0000b\u000Bc\u000Cd\u001Fe\uFFFEf\uFFFFg')).toBe('abcdefg')
  })

  it('keeps tabs, newlines and printable text', () => {
    expect(esc('a\tb\nc — 中文')).toBe('a\tb\nc — 中文')
  })

  it('drops lone surrogates but keeps valid pairs (review m-2)', () => {
    expect(esc('a\uD800b\uDC00c')).toBe('abc')
    expect(esc('a\uFFFEb')).toBe('ab')
    expect(esc('a\u{1F600}b')).toBe('a\u{1F600}b')
  })
})

describe('exportSvgString', () => {
  beforeEach(() => {
    setMeasureTextImpl(stubMeasure)
    // F10: deterministic font content-area (ascent 8 + descent 4 = 12px bar).
    setMeasureFontBoxImpl(() => ({ ascent: 8, descent: 4 }))
  })
  afterEach(() => {
    setMeasureTextImpl(null)
    setMeasureFontBoxImpl(null)
  })

  it('starts with an XML declaration and a proper svg root (review N-8)', () => {
    const svg = exportSvgString(makeInput())
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
  })

  it('aligns text to the top edge like canvas textBaseline=top (review C-2)', () => {
    const svg = exportSvgString(makeInput())
    // Numbers and tokens carry the shared top-baseline attribute.
    expect(svg).toContain('dominant-baseline="text-before-edge"')
  })

  it('escapes token text and keeps the output XML-safe', () => {
    const svg = exportSvgString(
      makeInput({
        windowTitle: '<weird> & "title"',
        highlight: {
          lines: [{ tokens: [{ text: '</text>&<x>', color: '#fff', italic: false, bold: false }] }],
          colors: highlight.colors,
        },
        layout: layoutCode('</text>&<x>', { tabSize: 4, startLine: 0 }),
      })
    )
    expect(svg).toContain('&lt;/text&gt;&amp;&lt;x&gt;')
    expect(svg).toContain('&lt;weird&gt; &amp; &quot;title&quot;')
    expect(svg).not.toContain('</text>&<x>')
  })

  it('drops control characters from tokens (review M-3)', () => {
    const svg = exportSvgString(
      makeInput({
        highlight: {
          lines: [{ tokens: [{ text: 'a\u000Bb', color: '#fff', italic: false, bold: false }] }],
          colors: highlight.colors,
        },
        layout: layoutCode('a\u000Bb', { tabSize: 4, startLine: 0 }),
      })
    )
    expect(svg).toContain('>ab<')
  })

  it('renders F7 washes as fill+fill-opacity (review M-6)', () => {
    const svg = exportSvgString(makeInput({ lineMarks: { 0: 'added', 1: 'removed' } }))
    expect(svg).toContain('fill="#3fb950" fill-opacity="0.16"')
    expect(svg).toContain('fill="#f85149" fill-opacity="0.16"')
    expect(svg).not.toContain('rgba(63, 185, 80')
  })

  it('never leaks masked source text into the SVG — block mode (review m-1)', () => {
    const secret = 'hunter2secret'
    const source = `const pwd = "${secret}"`
    const svg = exportSvgString(
      makeInput({
        layout: layoutCode(source, { tabSize: 4, startLine: 0 }),
        highlight: {
          lines: [{ tokens: [{ text: source, color: '#d4d4d4', italic: false, bold: false }] }],
          colors: highlight.colors,
        },
        // 'const pwd = "' is 13 chars; the secret follows.
        masks: [{ line: 0, start: 13, end: 13 + secret.length }],
      })
    )
    expect(svg).not.toContain(secret)
    expect(svg).toContain('<rect')
  })

  it('never leaks masked source text into the SVG — asterisk mode (review m-1)', () => {
    const secret = 'hunter2secret'
    const source = `const pwd = "${secret}"`
    const svg = exportSvgString(
      makeInput({
        layout: layoutCode(source, { tabSize: 4, startLine: 0 }),
        highlight: {
          lines: [{ tokens: [{ text: source, color: '#d4d4d4', italic: false, bold: false }] }],
          colors: highlight.colors,
        },
        masks: [{ line: 0, start: 13, end: 13 + secret.length }],
        style: { ...DEFAULT_STYLE, maskStyle: 'asterisk' },
      })
    )
    expect(svg).not.toContain(secret)
    expect(svg).toMatch(/\*{5,}/)
  })

  it('stains the watermark with a contrast overlay, never the backdrop itself (review C-1)', () => {
    const svg = exportSvgString(
      makeInput({ style: { ...DEFAULT_STYLE, watermarkText: '@me', watermarkOpacity: 0.5 } })
    )
    expect(svg).toContain('@me')
    expect(svg).toMatch(/fill="rgba\(0, 0, 0, 0\.14\)"/)
  })

  it('draws the gradient via userSpaceOnUse defs', () => {
    const svg = exportSvgString(makeInput({ style: { ...DEFAULT_STYLE, backgroundType: 'gradient' } }))
    expect(svg).toContain('<linearGradient id="ocs-bg" gradientUnits="userSpaceOnUse"')
  })

  it('omits background and shadow entirely for transparent exports', () => {
    const svg = exportSvgString(
      makeInput({ style: { ...DEFAULT_STYLE, transparentBackground: true, watermarkText: '@me' } })
    )
    expect(svg).not.toContain('ocs-shadow')
    expect(svg).not.toContain('@me') // watermark skipped on transparent
  })
})
