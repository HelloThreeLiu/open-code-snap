/**
 * Validation for setting updates originating from the webview.
 * The webview is a trusted-but-fallible client: every `updateSetting`
 * message must pass this whitelist before the host touches user settings.
 * Pure TS — no VS Code / DOM dependencies, unit-tested in tests/settings.test.ts.
 */

export type SettingValue = string | number | boolean

export interface SettingRule {
  type: 'string' | 'number' | 'boolean'
  /** Closed set of allowed values (enums in package.json). */
  enum?: readonly SettingValue[]
  min?: number
  max?: number
}

/** Whitelist mirroring the `openCodeSnap.*` settings in package.json. */
export const SETTING_RULES: Record<string, SettingRule> = {
  theme: { type: 'string' },
  windowStyle: { type: 'string', enum: ['macos', 'windows', 'none'] },
  showWindowTitle: { type: 'boolean' },
  lineNumbers: { type: 'string', enum: ['off', 'relative', 'real'] },
  languageOverride: { type: 'string' },
  backgroundColor: { type: 'string' },
  transparentBackground: { type: 'boolean' },
  padding: { type: 'number', min: 0, max: 128 },
  borderRadius: { type: 'number', min: 0, max: 64 },
  shadowColor: { type: 'string' },
  shadowBlur: { type: 'number', min: 0, max: 256 },
  shadowOffsetX: { type: 'number', min: -128, max: 128 },
  shadowOffsetY: { type: 'number', min: -128, max: 128 },
  fontFamily: { type: 'string' },
  fontSize: { type: 'number', min: 8, max: 72 },
  lineHeight: { type: 'number', min: 1, max: 3 },
  ligatures: { type: 'boolean' },
  tabSize: { type: 'number', min: 0, max: 16 },
  exportScale: { type: 'number', enum: [1, 2, 3] },
}

/** Longest string we accept; theme ids and font lists stay far below this. */
const MAX_STRING_LENGTH = 256

export type SettingValidation =
  | { ok: true; value: SettingValue }
  | { ok: false; reason: string }

/**
 * Validate one webview-originated setting update.
 * Never throws; returns the normalized value or a human-readable reason.
 */
export function validateSettingUpdate(key: string, value: unknown): SettingValidation {
  // hasOwnProperty guard: a plain lookup would hit Object.prototype for
  // keys like "__proto__" / "constructor" and sneak past the whitelist.
  const rule = Object.prototype.hasOwnProperty.call(SETTING_RULES, key)
    ? SETTING_RULES[key as keyof typeof SETTING_RULES]
    : undefined
  if (!rule) {
    return { ok: false, reason: `unknown setting "${key}"` }
  }
  if (rule.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, reason: `"${key}" expects a finite number` }
    }
    if (rule.enum && !rule.enum.includes(value)) {
      return { ok: false, reason: `"${key}" must be one of ${rule.enum.join(', ')}` }
    }
    if (rule.min !== undefined && value < rule.min) {
      return { ok: false, reason: `"${key}" must be >= ${rule.min}` }
    }
    if (rule.max !== undefined && value > rule.max) {
      return { ok: false, reason: `"${key}" must be <= ${rule.max}` }
    }
    return { ok: true, value }
  }
  if (rule.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return { ok: false, reason: `"${key}" expects a boolean` }
    }
    return { ok: true, value }
  }
  // string
  if (typeof value !== 'string') {
    return { ok: false, reason: `"${key}" expects a string` }
  }
  if (value.length > MAX_STRING_LENGTH) {
    return { ok: false, reason: `"${key}" exceeds ${MAX_STRING_LENGTH} characters` }
  }
  if (rule.enum && !rule.enum.includes(value)) {
    return { ok: false, reason: `"${key}" must be one of ${rule.enum.join(', ')}` }
  }
  return { ok: true, value }
}
