/**
 * Shiki-based highlighting (F12-slim build). Runs inside the webview and
 * loads grammars/themes statically — the 22 curated languages and the 20
 * themes reachable from theme-map replace the old full bundled registry,
 * which inlined EVERY grammar (~9.4MB bundle). The JavaScript regex engine
 * replaces oniguruma (no wasm → CSP drops 'wasm-unsafe-eval'). Repeated
 * calls with the same language hit a warm highlighter (<30ms).
 *
 * Trade-off (PRD M3): languages outside the curated set render as plain
 * text with a status note instead of silently working via the mega-bundle.
 */
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import tsGrammar from 'shiki/langs/typescript.mjs'
import jsGrammar from 'shiki/langs/javascript.mjs'
import pythonGrammar from 'shiki/langs/python.mjs'
import javaGrammar from 'shiki/langs/java.mjs'
import cGrammar from 'shiki/langs/c.mjs'
import cppGrammar from 'shiki/langs/cpp.mjs'
import csharpGrammar from 'shiki/langs/csharp.mjs'
import goGrammar from 'shiki/langs/go.mjs'
import rustGrammar from 'shiki/langs/rust.mjs'
import rubyGrammar from 'shiki/langs/ruby.mjs'
import phpGrammar from 'shiki/langs/php.mjs'
import swiftGrammar from 'shiki/langs/swift.mjs'
import kotlinGrammar from 'shiki/langs/kotlin.mjs'
import sqlGrammar from 'shiki/langs/sql.mjs'
import jsonGrammar from 'shiki/langs/json.mjs'
import yamlGrammar from 'shiki/langs/yaml.mjs'
import htmlGrammar from 'shiki/langs/html.mjs'
import cssGrammar from 'shiki/langs/css.mjs'
import markdownGrammar from 'shiki/langs/markdown.mjs'
import shellGrammar from 'shiki/langs/shellscript.mjs'
import dockerGrammar from 'shiki/langs/dockerfile.mjs'
import darkPlus from 'shiki/themes/dark-plus.mjs'
import lightPlus from 'shiki/themes/light-plus.mjs'
import githubDark from 'shiki/themes/github-dark.mjs'
import githubLight from 'shiki/themes/github-light.mjs'
import githubDarkDefault from 'shiki/themes/github-dark-default.mjs'
import githubLightDefault from 'shiki/themes/github-light-default.mjs'
import monokai from 'shiki/themes/monokai.mjs'
import solarizedDark from 'shiki/themes/solarized-dark.mjs'
import solarizedLight from 'shiki/themes/solarized-light.mjs'
import oneDarkPro from 'shiki/themes/one-dark-pro.mjs'
import dracula from 'shiki/themes/dracula.mjs'
import nightOwl from 'shiki/themes/night-owl.mjs'
import nord from 'shiki/themes/nord.mjs'
import synthwave84 from 'shiki/themes/synthwave-84.mjs'
import tokyoNight from 'shiki/themes/tokyo-night.mjs'
import everforestDark from 'shiki/themes/everforest-dark.mjs'
import catppuccinMocha from 'shiki/themes/catppuccin-mocha.mjs'
import catppuccinLatte from 'shiki/themes/catppuccin-latte.mjs'
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
  /**
   * Requested language id when it is not bundled and plain text was used
   * instead (the webview surfaces a status note).
   */
  langFallback?: string
}

/** Special "no language" mode; shiki core handles it without a grammar. */
const PLAIN_LANG = 'text'

/** Theme used when nothing better matches (also the theme-map fallback). */
const FALLBACK_THEME = 'github-dark'

/** Grammar imports keyed by their canonical Shiki/VS Code language id. */
export const LANG_GRAMMARS: Record<string, unknown> = {
  typescript: tsGrammar,
  javascript: jsGrammar,
  python: pythonGrammar,
  java: javaGrammar,
  c: cGrammar,
  cpp: cppGrammar,
  csharp: csharpGrammar,
  go: goGrammar,
  rust: rustGrammar,
  ruby: rubyGrammar,
  php: phpGrammar,
  swift: swiftGrammar,
  kotlin: kotlinGrammar,
  sql: sqlGrammar,
  json: jsonGrammar,
  yaml: yamlGrammar,
  html: htmlGrammar,
  css: cssGrammar,
  markdown: markdownGrammar,
  shellscript: shellGrammar,
  dockerfile: dockerGrammar,
}

/** Theme imports keyed by Shiki theme id (superset of CURATED_THEMES). */
export const THEME_IMPORTS: Record<string, unknown> = {
  'dark-plus': darkPlus,
  'light-plus': lightPlus,
  'github-dark': githubDark,
  'github-light': githubLight,
  'github-dark-default': githubDarkDefault,
  'github-light-default': githubLightDefault,
  monokai,
  'solarized-dark': solarizedDark,
  'solarized-light': solarizedLight,
  'one-dark-pro': oneDarkPro,
  dracula,
  'night-owl': nightOwl,
  nord,
  'synthwave-84': synthwave84,
  'tokyo-night': tokyoNight,
  'everforest-dark': everforestDark,
  'catppuccin-mocha': catppuccinMocha,
  'catppuccin-latte': catppuccinLatte,
}

/** Exported for unit tests (curated lists must stay within these sets). */
export const KNOWN_LANG_IDS: ReadonlySet<string> = new Set(Object.keys(LANG_GRAMMARS))
export const KNOWN_THEME_IDS: ReadonlySet<string> = new Set(Object.keys(THEME_IMPORTS))

/** Exported for unit tests only. */
export function normalizeLang(languageId: string): string {
  if (!languageId) return PLAIN_LANG
  // Lowercase ids match the grammar registry — "TypeScript" used to slip
  // through with its original case and fall back to plain text (hang-⑥).
  const id = languageId.toLowerCase()
  if (id === 'plaintext' || id === 'plain_text' || id === 'plain') return PLAIN_LANG
  return id
}

let highlighterPromise: Promise<HighlighterCore> | null = null
const loadedLangs = new Set<string>()
const loadedThemes = new Set<string>()

const engine = createJavaScriptRegexEngine({ forgiving: true })

async function getHighlighter(theme: string, lang: string): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [THEME_IMPORTS[theme] as never],
      langs: lang === PLAIN_LANG ? [] : [LANG_GRAMMARS[lang] as never],
      engine,
    })
    loadedLangs.add(lang)
    loadedThemes.add(theme)
    return highlighterPromise
  }
  const hl = await highlighterPromise
  const jobs: Promise<unknown>[] = []
  if (!loadedThemes.has(theme)) {
    jobs.push(hl.loadTheme(THEME_IMPORTS[theme] as never))
    loadedThemes.add(theme)
  }
  if (!loadedLangs.has(lang) && lang !== PLAIN_LANG) {
    jobs.push(hl.loadLanguage(LANG_GRAMMARS[lang] as never))
    loadedLangs.add(lang)
  }
  await Promise.all(jobs)
  return hl
}

/**
 * Highlight already-laid-out code (tabs expanded, indent stripped) so that
 * token boundaries line up 1:1 with layout lines. Unbundled languages and
 * themes degrade instead of throwing: plain text and the fallback theme,
 * both flagged on the result for the caller to surface.
 */
export async function highlightCode(
  layouted: LayoutedCode,
  languageId: string,
  themeId: string
): Promise<HighlightResult> {
  const requested = normalizeLang(languageId)
  const lang = requested === PLAIN_LANG || KNOWN_LANG_IDS.has(requested) ? requested : PLAIN_LANG
  const theme = KNOWN_THEME_IDS.has(themeId) ? themeId : FALLBACK_THEME

  const hl = await getHighlighter(theme, lang)

  const activeTheme = hl.getTheme(theme as never)
  const fallbackColor = activeTheme.fg || '#d4d4d4'
  const code = layouted.lines.map((l) => l.text).join('\n')

  const tokenLines = hl.codeToTokens(code, { lang, theme })

  // Shiki FontStyle enum: Italic=1, Bold=2, Underline=4.
  const lines: ThemedLine[] = tokenLines.tokens.map((line) => ({
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
      fg: activeTheme.fg || '#d4d4d4',
      bg: activeTheme.bg || '#1e1e1e',
      type: activeTheme.type === 'light' ? 'light' : 'dark',
    },
    langFallback: lang === PLAIN_LANG && requested !== PLAIN_LANG ? languageId : undefined,
  }
}
