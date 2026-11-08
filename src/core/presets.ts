/**
 * Named style presets (PRD F9). core owns the shape and the trust boundary:
 * an imported JSON file is untrusted input and must pass the same per-key
 * whitelist as webview setting updates. The host stores sanitized presets in
 * globalState and applies them key by key.
 * Pure TS — unit-tested in tests/presets.test.ts.
 */
import type { StyleConfig } from './protocol'
import { validateSettingUpdate } from './settings'

export interface PresetFile {
  version: 1
  settings: Record<string, unknown>
}

/** Trimmed, 1..64 chars; null signals an invalid name. */
export function validatePresetName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 64) return null
  return trimmed
}

/**
 * Filter an untrusted preset payload down to the writable style surface.
 * Unknown keys and type/range violations are silently dropped — the result
 * is always safe to feed into validateSettingUpdate again (defense in depth).
 */
export function sanitizePreset(raw: unknown): { ok: true; settings: Partial<StyleConfig> } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: '预设必须是一个 JSON 对象' }
  }
  const record = raw as Record<string, unknown>
  const settings = record.settings ?? record
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    return { ok: false, reason: '预设缺少 settings 对象' }
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(settings as Record<string, unknown>)) {
    const result = validateSettingUpdate(key, value)
    if (result.ok) out[key] = result.value
    // Violations are dropped, not fatal: a preset from a newer/older version
    // still applies its understood subset.
  }
  return { ok: true, settings: out as Partial<StyleConfig> }
}

/** Full snapshot of the current style knobs, ready for export/storage. */
export function serializePreset(style: StyleConfig): PresetFile {
  const settings: Record<string, unknown> = {}
  // Snapshot the StyleConfig surface itself, not SETTING_RULES: the whitelist
  // also covers knobs that live outside the style snapshot on purpose
  // (document-dependent tabSize travels in SnippetRequest.font) and would
  // serialize as undefined, silently dropping from the round trip.
  for (const [key, value] of Object.entries(style)) {
    settings[key] = value
  }
  return { version: 1, settings }
}
