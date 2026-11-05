/**
 * Curated language overrides for the webview dropdown (PRD F1.4).
 * Ids must be valid Shiki bundled language ids; unknown ids would silently
 * fall back to plain text in highlight.ts, so this list is kept deliberate.
 */

export interface LanguageOption {
  /** Shiki language id; empty string = auto-detect from the document. */
  id: string
  label: string
}

export const CURATED_LANGUAGES: readonly LanguageOption[] = [
  { id: '', label: '自动识别' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'php', label: 'PHP' },
  { id: 'swift', label: 'Swift' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'sql', label: 'SQL' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'shellscript', label: 'Shell' },
  { id: 'dockerfile', label: 'Dockerfile' },
]
