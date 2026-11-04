/**
 * Map VS Code workbench theme display names to Shiki bundled theme ids.
 * Normalization: lowercase, drop everything after ":" (theme pack prefixes
 * like "Dracula Theme: Dracula"), keep alphanumerics only.
 */

const FALLBACK_THEME = 'github-dark'

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
  if (ALIASES[normalized]) {
    return { id: ALIASES[normalized], exact: true }
  }
  // Second pass: try alias keys contained in the normalized name,
  // e.g. "Dracula Theme" -> contains "dracula"; "GitHub Theme Dark Default".
  const hit = Object.keys(ALIASES).find((key) => normalized.includes(key))
  if (hit) {
    return { id: ALIASES[hit], exact: true }
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
