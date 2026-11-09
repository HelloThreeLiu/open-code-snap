/**
 * UI strings in zh/en (PRD F12). Pure TS, no vscode/DOM dependencies.
 * Keys are typed via `keyof typeof STRINGS`, so a missing key is a compile
 * error rather than a runtime blank. `t()` is explicit about the locale —
 * no hidden global state; the host resolves the locale once per message.
 */

export type Locale = 'zh' | 'en'
export type UiLanguageSetting = 'auto' | 'zh' | 'en'

/**
 * Resolve the UI locale from the `uiLanguage` setting and the host's
 * `vscode.env.language` (auto). Any zh variant (zh-cn/zh-tw/…) maps to the
 * simplified zh pack (recorded in the PRD); everything else falls to en.
 */
export function resolveLocale(setting: UiLanguageSetting, envLanguage: string): Locale {
  if (setting === 'zh') return 'zh'
  if (setting === 'en') return 'en'
  return envLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/**
 * The string table. zh is the original wording (the product's first
 * language); en is the international default. Interpolation slots use
 * `{name}` and must exist in BOTH languages (tests/i18n.test.ts enforces).
 */
export const STRINGS = {
  // --- webview toolbar ---
  'theme.follow': { zh: '跟随编辑器主题', en: 'Follow editor theme' },
  'title.theme': { zh: 'Shiki 主题', en: 'Shiki theme' },
  'title.lang': { zh: '强制语言（留空自动识别）', en: 'Language override (empty = auto)' },
  'lang.auto': { zh: '自动识别', en: 'Auto-detect' },
  'lineno.off': { zh: '无行号', en: 'No line numbers' },
  'lineno.relative': { zh: '相对行号', en: 'Relative line numbers' },
  'lineno.real': { zh: '真实行号', en: 'Real line numbers' },
  'title.lineno': { zh: '行号模式', en: 'Line numbers' },
  'window.macos': { zh: 'macOS 窗口', en: 'macOS window' },
  'window.windows': { zh: 'Windows 窗口', en: 'Windows window' },
  'window.none': { zh: '无窗口', en: 'No window' },
  'title.window': { zh: '窗口样式', en: 'Window style' },
  'transparent.label': { zh: '透明', en: 'Transparent' },
  'transparent.title': { zh: '透明背景', en: 'Transparent background' },
  'scale.title': { zh: '导出缩放', en: 'Export scale' },
  'btn.savePng': { zh: '保存 PNG', en: 'Save PNG' },
  'btn.saveSvg': { zh: '保存 SVG', en: 'Save SVG' },
  'btn.copy': { zh: '复制到剪贴板', en: 'Copy to clipboard' },
  'btn.mask': { zh: '打码', en: 'Mask' },
  'title.saveSvg': {
    zh: '矢量导出（F8）；缩放倍数不适用于 SVG',
    en: 'Vector export (F8); export scale does not apply to SVG',
  },
  'title.mask': {
    zh: '将预览中选中的文本替换为遮罩（F10）；点击遮罩可恢复',
    en: 'Replace the selected preview text with a mask (F10); click a mask to restore',
  },
  'bgtype.solid': { zh: '纯色背景', en: 'Solid background' },
  'bgtype.gradient': { zh: '渐变背景', en: 'Gradient background' },
  'bgtype.grid': { zh: '网格背景', en: 'Grid background' },
  'bgtype.dots': { zh: '点阵背景', en: 'Dots background' },
  'title.bgtype': { zh: '背景类型', en: 'Background type' },
  'title.gradA': { zh: '渐变起始色', en: 'Gradient start color' },
  'title.gradB': { zh: '渐变结束色', en: 'Gradient end color' },
  'title.gradAngle': { zh: '渐变角度（0-360）', en: 'Gradient angle (0-360)' },
  'wm.placeholder': { zh: '水印，如 @me {date}', en: 'e.g. @me {date}' },
  'title.wmText': {
    zh: '水印文字（支持 {date} {file} 模板变量，留空不显示）',
    en: 'Watermark text ({date} {file} placeholders supported; empty = hidden)',
  },
  'wmpos.topLeft': { zh: '水印：左上', en: 'Watermark: top left' },
  'wmpos.topRight': { zh: '水印：右上', en: 'Watermark: top right' },
  'wmpos.bottomLeft': { zh: '水印：左下', en: 'Watermark: bottom left' },
  'wmpos.bottomRight': { zh: '水印：右下', en: 'Watermark: bottom right' },
  'wmpos.tile': { zh: '水印：平铺', en: 'Watermark: tile' },
  'title.wmPos': { zh: '水印位置', en: 'Watermark position' },
  'title.wmSize': { zh: '水印字号', en: 'Watermark font size' },
  'title.wmOpacity': { zh: '水印透明度', en: 'Watermark opacity' },
  'preset.placeholder': { zh: '预设', en: 'Presets' },
  'preset.save': { zh: '💾 保存当前为预设…', en: '💾 Save current as preset…' },
  'preset.export': { zh: '📤 导出预设…', en: '📤 Export preset…' },
  'preset.import': { zh: '📥 导入 JSON…', en: '📥 Import JSON…' },
  'preset.delete': { zh: '🗑 删除预设…', en: '🗑 Delete preset…' },
  'preset.sep': { zh: '───', en: '───' },

  // --- webview status & errors ---
  'status.waiting': { zh: '等待代码选区…', en: 'Waiting for a code selection…' },
  'status.empty': {
    zh: '在编辑器中选中代码 ✂️',
    en: 'Select some code in the editor ✂️',
  },
  'status.lines': { zh: '{n} 行', en: '{n} lines' },
  'status.themeExact': { zh: '（已匹配编辑器主题）', en: ' (matched editor theme)' },
  'status.themeApprox': { zh: '（近似映射：{editor} → {id}）', en: ' (approximate: {editor} → {id})' },
  'status.themeFallback': {
    zh: '（编辑器主题 “{editor}” 未精确映射，已回退）',
    en: ' (editor theme "{editor}" has no exact mapping; fell back)',
  },
  'status.maskCount': { zh: ' · {n} 处遮罩', en: ' · {n} masks' },
  'status.langFallback': {
    zh: ' · 语言 {lang} 未收录，按纯文本高亮',
    en: ' · language {lang} not bundled, plain text',
  },
  'status.themeUnbundled': {
    zh: ' · 主题 {id} 未收录，已回退 {fallback}',
    en: ' · theme {id} not bundled, fell back to {fallback}',
  },
  'status.longHint': {
    zh: ' · ⚠ 行数较多，建议分片导出',
    en: ' · ⚠ many lines — consider splitting the selection',
  },
  'status.scaleNote': {
    zh: '（{from}x 超出画布上限，已自动降为 {to}x）',
    en: ' ({from}x exceeds canvas limits; fell back to {to}x)',
  },
  'status.longNote': { zh: ' ⚠ 行数较多，建议分片导出', en: ' ⚠ many lines — consider splitting' },
  'status.saved': {
    zh: '已生成{note}，请在弹出的保存对话框中选择位置（{ms} ms）',
    en: 'Generated{note} — pick a location in the save dialog ({ms} ms)',
  },
  'status.copied': {
    zh: '已复制到剪贴板{note}（{ms} ms，{kb} KB）——现在可去任意位置 Ctrl+V 粘贴',
    en: 'Copied to clipboard{note} ({ms} ms, {kb} KB) — paste with Ctrl+V anywhere',
  },
  'status.savedSvg': {
    zh: '已生成 SVG（矢量，{ms} ms，{kb} KB），请在弹出的保存对话框中选择位置',
    en: 'SVG generated (vector, {ms} ms, {kb} KB) — pick a location in the save dialog',
  },
  'status.masked': {
    zh: '已打码 {n} 处，共 {total} 处（点击遮罩可恢复）',
    en: 'Masked {n} range(s), {total} in total (click a mask to restore)',
  },
  'error.export': { zh: '❌ 导出失败: {err}', en: '❌ Export failed: {err}' },
  'error.svgExport': { zh: '❌ SVG 导出失败: {err}', en: '❌ SVG export failed: {err}' },
  'error.render': { zh: '❌ 渲染失败: {err}', en: '❌ Render failed: {err}' },

  // --- webview preview bits ---
  'gutter.markAdd.title': {
    zh: '点击标记为新增(+)，再点为删除(−)',
    en: 'Click to mark as added (+), again for removed (−)',
  },
  'gutter.markRemove.title': {
    zh: '点击取消 +/− 标记',
    en: 'Click to clear the +/− mark',
  },
  'mask.unmask.title': { zh: '点击取消遮罩', en: 'Click to remove this mask' },
  'notify.themeFallback': {
    zh: 'Open Code Snap: 编辑器主题 “{editor}” 暂无精确映射，已回退到 {id}。',
    en: 'Open Code Snap: editor theme "{editor}" has no exact mapping, fell back to {id}.',
  },

  // --- host messages ---
  'host.noEditor': {
    zh: 'Open Code Snap: 当前没有活动的编辑器。',
    en: 'Open Code Snap: no active editor.',
  },
  'host.rejectImage': {
    zh: 'Open Code Snap: 拒绝了非法的图片数据（未通过校验）。',
    en: 'Open Code Snap: rejected invalid image data (failed validation).',
  },
  'host.imageTooLarge': {
    zh: 'Open Code Snap: 导出图片过大，请降低缩放倍数或减少所选行数后重试。',
    en: 'Open Code Snap: exported image too large — lower the scale or select fewer lines.',
  },
  'host.saveImageFailed': { zh: 'Open Code Snap: 保存图片失败: {err}', en: 'Open Code Snap: failed to save image: {err}' },
  'host.rejectSvg': {
    zh: 'Open Code Snap: 拒绝了非法的 SVG 数据（未通过校验）。',
    en: 'Open Code Snap: rejected invalid SVG data (failed validation).',
  },
  'host.svgTooLarge': {
    zh: 'Open Code Snap: SVG 内容过大，请减少所选行数后重试。',
    en: 'Open Code Snap: SVG content too large — select fewer lines.',
  },
  'host.saveSvgFailed': { zh: 'Open Code Snap: 保存 SVG 失败: {err}', en: 'Open Code Snap: failed to save SVG: {err}' },
  'host.saved': { zh: 'Open Code Snap: 已保存 {name}', en: 'Open Code Snap: saved {name}' },
  'host.rejectSetting': { zh: 'Open Code Snap: 拒绝了设置更新（{reason}）', en: 'Open Code Snap: rejected setting update ({reason})' },
  'host.writeSettingFailed': { zh: 'Open Code Snap: 写入设置失败: {err}', en: 'Open Code Snap: failed to write settings: {err}' },
  'host.workspaceOverride': {
    zh: 'Open Code Snap: 工作区设置覆盖了 “{key}”，面板改动未生效，请到工作区设置中修改。',
    en: 'Open Code Snap: a workspace setting overrides "{key}"; the panel change did not take effect. Edit the workspace setting instead.',
  },
  'host.savePresetFailed': { zh: 'Open Code Snap: 保存预设失败: {err}', en: 'Open Code Snap: failed to save preset: {err}' },
  'host.applyPresetFailed': { zh: 'Open Code Snap: 应用预设失败: {err}', en: 'Open Code Snap: failed to apply preset: {err}' },
  'host.deletePresetFailed': { zh: 'Open Code Snap: 删除预设失败: {err}', en: 'Open Code Snap: failed to delete preset: {err}' },
  'host.exportPresetFailed': { zh: 'Open Code Snap: 导出预设失败: {err}', en: 'Open Code Snap: failed to export preset: {err}' },
  'host.importPresetFailed': { zh: 'Open Code Snap: 导入预设失败: {err}', en: 'Open Code Snap: failed to import preset: {err}' },

  // --- host preset flows ---
  'host.presetNamePrompt': {
    zh: 'Open Code Snap: 输入预设名称（保存当前面板全部样式）',
    en: 'Open Code Snap: preset name (snapshots all current panel styles)',
  },
  'host.presetNamePlaceholder': { zh: '如：团队默认', en: 'e.g. Team default' },
  'host.presetNameInvalid': {
    zh: '名称不能为空，且不超过 64 字符',
    en: 'Name must be 1-64 characters',
  },
  'host.presetLimit': {
    zh: 'Open Code Snap: 预设数量已达上限（{max}），请先删除部分预设。',
    en: 'Open Code Snap: preset limit reached ({max}); delete some first.',
  },
  'host.presetSavedNew': { zh: 'Open Code Snap: 预设「{name}」已保存。', en: 'Open Code Snap: preset "{name}" saved.' },
  'host.presetSavedOverwrite': {
    zh: 'Open Code Snap: 预设「{name}」已覆盖保存。',
    en: 'Open Code Snap: preset "{name}" overwritten.',
  },
  'host.presetMissing': {
    zh: 'Open Code Snap: 预设「{name}」不存在，列表已刷新。',
    en: 'Open Code Snap: preset "{name}" no longer exists; list refreshed.',
  },
  'host.presetCorrupt': {
    zh: 'Open Code Snap: 预设「{name}」数据损坏（{reason}）。',
    en: 'Open Code Snap: preset "{name}" is corrupt ({reason}).',
  },
  'host.presetOverridden': {
    zh: 'Open Code Snap: {n} 项样式被工作区设置覆盖，未完全生效。',
    en: 'Open Code Snap: {n} style(s) were overridden by workspace settings and did not take effect.',
  },
  'host.presetPartial': {
    zh: 'Open Code Snap: 预设「{name}」应用了 {applied} 项{failed}{dropped}。',
    en: 'Open Code Snap: preset "{name}" applied {applied} item(s){failed}{dropped}.',
  },
  'host.presetPartialFailed': { zh: '，{n} 项写入失败', en: ', {n} failed to write' },
  'host.presetPartialDropped': { zh: '，{n} 项非法被忽略', en: ', {n} invalid ignored' },
  'host.presetApplied': {
    zh: 'Open Code Snap: 已应用预设「{name}」（{n} 项）。',
    en: 'Open Code Snap: preset "{name}" applied ({n} item(s)).',
  },
  'host.noPresets': { zh: 'Open Code Snap: 还没有已保存的预设。', en: 'Open Code Snap: no saved presets yet.' },
  'host.pickPresetPlaceholder': { zh: '选择预设', en: 'Pick a preset' },
  'host.deletePresetTitle': { zh: '删除预设', en: 'Delete preset' },
  'host.exportPresetTitle': { zh: '导出预设', en: 'Export preset' },
  'host.deleteConfirm': { zh: 'Open Code Snap: 删除预设「{name}」？', en: 'Open Code Snap: delete preset "{name}"?' },
  'host.deleteBtn': { zh: '删除', en: 'Delete' },
  'host.presetDeleted': { zh: 'Open Code Snap: 预设「{name}」已删除。', en: 'Open Code Snap: preset "{name}" deleted.' },
  'host.presetExported': {
    zh: 'Open Code Snap: 预设已导出到 {name}',
    en: 'Open Code Snap: preset exported to {name}',
  },
  'host.presetFileTooLarge': {
    zh: 'Open Code Snap: 预设文件过大，已拒绝导入。',
    en: 'Open Code Snap: preset file too large; import rejected.',
  },
  'host.presetNotJson': {
    zh: 'Open Code Snap: 预设文件不是合法 JSON，导入失败。',
    en: 'Open Code Snap: preset file is not valid JSON; import failed.',
  },
  'host.presetImportInvalid': { zh: 'Open Code Snap: {reason}，导入失败。', en: 'Open Code Snap: {reason} — import failed.' },
  'host.presetFilenameInvalid': {
    zh: 'Open Code Snap: 文件名无法作为预设名（需 1~64 字符），请重命名后重试。',
    en: 'Open Code Snap: file name is not a valid preset name (1-64 chars); rename and retry.',
  },
  'host.presetImportedNew': {
    zh: 'Open Code Snap: 预设「{name}」已导入（{n} 项）。',
    en: 'Open Code Snap: preset "{name}" imported ({n} item(s)).',
  },
  'host.presetImportedOverwrite': {
    zh: 'Open Code Snap: 预设「{name}」已覆盖更新（{n} 项）。',
    en: 'Open Code Snap: preset "{name}" overwritten ({n} item(s)).',
  },
} as const

export type StringKey = keyof typeof STRINGS

/** Replace `{name}` slots; unknown params are left as-is (defensive). */
export function interpolate(template: string, params: Record<string, string | number> | undefined): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  )
}

/** Translate `key` in `locale`, interpolating `params`. */
export function t(locale: Locale, key: StringKey, params?: Record<string, string | number>): string {
  return interpolate(STRINGS[key][locale], params)
}
