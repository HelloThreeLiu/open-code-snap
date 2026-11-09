/**
 * Map VS Code workbench theme display names to Shiki bundled theme ids.
 * Normalization: lowercase, drop everything after ":" (theme pack prefixes
 * like "Dracula Theme: Dracula"), keep alphanumerics only.
 */

const FALLBACK_THEME = 'github-dark'

/**
 * Named-but-inexact mappings: editor themes whose exact palette is NOT in
 * our slim theme imports, mapped to the closest available palette. The UI
 * labels these "近似映射" instead of claiming an exact match or silently
 * eating the notice.
 * Only list variants that DIFFER from the family default — the generic key
 * (e.g. "noctis") already catches every variant via substring matching.
 */
/** Named-but-inexact mappings (see docstring above). Exported for tests. */
export const APPROX_ALIASES: Record<string, string> = {
  // Noctis family: dark blue-grey -> one-dark-pro; Lux is the light variant.
  noctis: 'one-dark-pro',
  noctislux: 'github-light',
  // Quiet Light: no longer in shiki's theme set (slim build, M3) — the
  // nearest warm light palette is Solarized Light.
  quietlight: 'solarized-light',
  // Tokyo Night Storm: folded into the base tokyo-night palette in shiki
  // 3.23 — close, but a distinct shade (approx, not exact).
  tokyonightstorm: 'tokyo-night',
  // Everforest has dark and light palettes; longest key wins, so the light
  // variant maps to the light palette and the family default to dark.
  everforestlight: 'everforest-light',
  everforest: 'everforest-dark',
}

/** normalized editor theme name -> shiki theme id. Exported for tests. */
export const ALIASES: Record<string, string> = {
  // VS Code built-ins
  defaultdark: 'dark-plus',
  defaultlight: 'light-plus',
  defaultdarkmodern: 'github-dark-default',
  defaultlightmodern: 'github-light-default',
  darkplus: 'dark-plus', // defensive
  lightplus: 'light-plus',
  monokai: 'monokai',
  solardark: 'solarized-dark',
  solarizeddark: 'solarized-dark',
  solarlight: 'solarized-light',
  solarizedlight: 'solarized-light',
  dimmedmonokai: 'monokai', // close enough fallback
  // Legacy VS Code built-in theme names
  visualstudiodark: 'dark-plus',
  visualstudiolight: 'light-plus',
  darkvisualstudio: 'dark-plus', // "Dark (Visual Studio)"
  lightvisualstudio: 'light-plus',

  // Popular extension themes
  dracula: 'dracula',
  onedark: 'one-dark-pro',
  onedarkpro: 'one-dark-pro',
  nightowl: 'night-owl',
  githubdark: 'github-dark',
  githublight: 'github-light',
  // "GitHub Theme" extension (Dark/Light Default variants)
  githubthemedarkdefault: 'github-dark-default',
  githubthemelightdefault: 'github-light-default',
  githubthemedark: 'github-dark',
  githubthemelight: 'github-light',
  nord: 'nord',
  synthwave84: 'synthwave-84',
  tokyonight: 'tokyo-night',
  catppuccin: 'catppuccin-mocha',
  catppuccinmocha: 'catppuccin-mocha',
  catppuccinlatte: 'catppuccin-latte',
}

export function normalizeThemeName(name: string): string {
  return name
    .split(':')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export interface ResolvedTheme {
  /** Shiki bundled theme id. */
  id: string
  /** Whether the editor theme was matched exactly. */
  exact: boolean
  /** Named mapping to a close-but-different palette (exact is false). */
  approx?: boolean
}

/**
 * Resolve a VS Code theme display name to a Shiki theme id.
 * Never throws; unknown names fall back with exact=false.
 */
export function resolveTheme(editorThemeName: string): ResolvedTheme {
  if (!editorThemeName) {
    return { id: FALLBACK_THEME, exact: false }
  }
  const normalized = normalizeThemeName(editorThemeName)
  // Exact-name approximations come FIRST: "Tokyo Night Storm" must not be
  // swallowed by the shorter "tokyonight" alias in the substring pass,
  // which would label a distinct shade as an exact match (review M-2).
  if (Object.prototype.hasOwnProperty.call(APPROX_ALIASES, normalized)) {
    return { id: APPROX_ALIASES[normalized], exact: false, approx: true }
  }
  if (Object.prototype.hasOwnProperty.call(ALIASES, normalized)) {
    return { id: ALIASES[normalized], exact: true }
  }
  // Substring passes: longest key wins ("noctislux" must beat "noctis").
  const longestMatch = (map: Record<string, string>): string | undefined =>
    Object.keys(map)
      .sort((a, b) => b.length - a.length)
      .find((key) => normalized.includes(key))
  // Second pass: try alias keys contained in the normalized name,
  // e.g. "Dracula Theme" -> contains "dracula"; "GitHub Theme Dark Default".
  const hit = longestMatch(ALIASES)
  if (hit) {
    return { id: ALIASES[hit], exact: true }
  }
  const approxKey = longestMatch(APPROX_ALIASES)
  if (approxKey) {
    return { id: APPROX_ALIASES[approxKey], exact: false, approx: true }
  }
  // Light/dark heuristics from the name to pick a sensible fallback.
  if (/(light|white)/.test(normalized)) {
    return { id: 'github-light', exact: false }
  }
  return { id: FALLBACK_THEME, exact: false }
}

/** Curated theme ids offered in the webview dropdown. */
export const CURATED_THEMES: string[] = [
  'dark-plus',
  'light-plus',
  'github-dark-default',
  'github-light-default',
  'one-dark-pro',
  'monokai',
  'dracula',
  'nord',
  'night-owl',
  'tokyo-night',
  'catppuccin-mocha',
  'catppuccin-latte',
]
// Note: CURATED never listed 'quiet-light' / 'tokyo-night-storm'; those ids
// only appeared as theme-map resolution targets and are now approximated
// (see APPROX_ALIASES and the tokyonight comment above).
