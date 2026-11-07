/**
 * Shiki-based highlighting. Runs inside the webview (needs DOM for wasm),
 * lazily loads grammars and themes; repeated calls with the same language
 * hit a warm highlighter (<30ms).
 */
import { createHighlighter, bundledLanguages, type Highlighter, type ThemedToken } from 'shiki'
import type { LayoutedCode } from './layout'

export interface Token {
  text: string
  color: string
  italic: boolean
  bold: boolean
}

export interface ThemedLine {
  tokens: Token[]
}

export interface ThemeColors {
  fg: string
  bg: string
  type: 'light' | 'dark'
}

export interface HighlightResult {
  lines: ThemedLine[]
  colors: ThemeColors
}

/** Special "no language" id that always exists. */
const PLAIN_LANG = 'text'

let highlighterPromise: Promise<Highlighter> | null = null
const loadedLangs = new Set<string>()
const loadedThemes = new Set<string>()

/** Exported for unit tests only. */
export function normalizeLang(languageId: string): string {
  if (!languageId) return PLAIN_LANG
  // Lowercase ids match Shiki's bundled registry — "TypeScript" used to
  // slip through with its original case and fall back to plain text (hang-⑥).
  const id = languageId.toLowerCase()
  if (id === 'plaintext' || id === 'plain_text' || id === 'plain') return PLAIN_LANG
  return id
}

async function getHighlighter(theme: string, lang: string): Promise<Highlighter> {
  const isKnownLang = (l: string) => l === PLAIN_LANG || l in bundledLanguages
  const safeLang = isKnownLang(lang) ? lang : PLAIN_LANG
  const safeTheme = (t: string) => t // theme validity enforced by caller

  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [safeTheme(theme)],
      langs: [safeLang === PLAIN_LANG ? 'text' : safeLang],
    })
    loadedLangs.add(safeLang)
    loadedThemes.add(safeTheme(theme))
    return highlighterPromise
  }
  const hl = await highlighterPromise
  const jobs: Promise<unknown>[] = []
  if (!loadedThemes.has(theme)) {
    jobs.push(hl.loadTheme(theme as never))
    loadedThemes.add(theme)
  }
  if (!loadedLangs.has(safeLang)) {
    jobs.push(safeLang === PLAIN_LANG ? Promise.resolve() : hl.loadLanguage(safeLang as never))
    loadedLangs.add(safeLang)
  }
  await Promise.all(jobs)
  return hl
}

/**
 * Highlight already-laid-out code (tabs expanded, indent stripped) so that
 * token boundaries line up 1:1 with layout lines.
 */
export async function highlightCode(
  layouted: LayoutedCode,
  languageId: string,
  themeId: string
): Promise<HighlightResult> {
  const lang = normalizeLang(languageId)
  const hl = await getHighlighter(themeId, lang)

  const theme = hl.getTheme(themeId as never)
  const fallbackColor = theme.fg || '#d4d4d4'
  const code = layouted.lines.map((l) => l.text).join('\n')

  let tokenLines: ThemedToken[][]
  try {
    tokenLines = hl.codeToTokens(code, { lang: lang as never, theme: themeId as never }).tokens
  } catch {
    // Unknown language slipped through: retry as plain text.
    tokenLines = hl.codeToTokens(code, { lang: PLAIN_LANG as never, theme: themeId as never }).tokens
  }

  // Shiki FontStyle enum: Italic=1, Bold=2, Underline=4.
  const lines: ThemedLine[] = tokenLines.map((line) => ({
    tokens: line.map((t) => ({
      text: t.content,
      color: t.color || fallbackColor,
      italic: (t.fontStyle ?? 0) % 2 === 1,
      bold: ((t.fontStyle ?? 0) & 2) !== 0,
    })),
  }))

  return {
    lines,
    colors: {
      fg: theme.fg || '#d4d4d4',
      bg: theme.bg || '#1e1e1e',
      type: theme.type === 'light' ? 'light' : 'dark',
    },
  }
}
