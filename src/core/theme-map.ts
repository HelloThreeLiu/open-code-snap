/**
 * Map VS Code workbench theme display names to Shiki bundled theme ids.
 * Normalization: lowercase, drop everything after ":" (theme pack prefixes
 * like "Dracula Theme: Dracula"), keep alphanumerics only.
 */

const FALLBACK_THEME = 'github-dark'

/**
 * Named-but-inexact mappings: editor themes Shiki does not bundle, mapped
 * to the closest bundled palette. The UI labels these "近似映射" instead
 * of claiming an exact match or silently eating the notice.
 */
const APPROX_ALIASES: Record<string, string> = {
  // Noctis family (dark blue-grey -> one-dark-pro; Lux is light).
  noctis: 'one-dark-pro',
  noctisminimus: 'one-dark-pro',
  noctishibernus: 'one-dark-pro',
  noctisuva: 'one-dark-pro',
  noctislux: 'github-light',
}

/** normalized editor theme name -> shiki theme id */
const ALIASES: Record<string, string> = {
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
  quietlight: 'quiet-light',
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
  tokyonightstorm: 'tokyo-night-storm',
  everforest: 'everforest',
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
