import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'
import type { HostMessage, SnippetRequest, ThemeContext, WebviewMessage } from '../core/protocol'
import { readStyleFromConfig } from '../core/model'
import { validateSettingUpdate } from '../core/settings'
import { sanitizePreset, serializePreset, validatePresetName } from '../core/presets'
import { resolveLocale, t, type Locale, type StringKey } from '../core/i18n'

const VIEW_TYPE = 'openCodeSnap.panel'
const PANEL_TITLE = 'Open Code Snap 📸'

/** Message-body guards (hang-⑤): the webview is trusted-but-fallible, so
 *  every webview→host payload is shape-checked before the host acts on it. */
const MAX_NOTIFY_CHARS = 2000
/** base64 chars; 3x-scale 300-line exports are ~13M chars, so this leaves headroom. */
const MAX_SAVE_IMAGE_CHARS = 32 * 1024 * 1024
const PNG_DATAURL_PREFIX = 'data:image/png;base64,'
/** F8: SVG source cap; 300-line exports are well under 1MB of text. */
const MAX_SAVE_SVG_CHARS = 8 * 1024 * 1024
/** F9: preset storage in globalState — sanitized settings keyed by name. */
const PRESETS_KEY = 'openCodeSnap.presets'
const MAX_PRESETS = 100
const MAX_PRESET_JSON_CHARS = 1024 * 1024

let panel: vscode.WebviewPanel | undefined
let selectionListener: vscode.Disposable | undefined
let activeEditorListener: vscode.Disposable | undefined
let configListener: vscode.Disposable | undefined
let pendingTimer: ReturnType<typeof setTimeout> | undefined
let webviewReady = false
let lastSnippet: SnippetRequest | null = null
/** The editor the panel currently follows; survives webview taking focus. */
let sourceEditor: vscode.TextEditor | undefined

export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand('openCodeSnap.start', () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showWarningMessage(tr('host.noEditor'))
      return
    }
    showPanel(context)
  })
  context.subscriptions.push(command)
}

export function deactivate(): void {
  selectionListener?.dispose()
  activeEditorListener?.dispose()
  configListener?.dispose()
}

function showPanel(context: vscode.ExtensionContext): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside, true)
    return
  }
  // Capture the snippet at command time: opening the panel must not depend
  // on the active editor staying focused afterwards.
  const editor = vscode.window.activeTextEditor
  const snippet = editor ? snippetFrom(editor) : null
  if (snippet) {
    lastSnippet = snippet
    sourceEditor = editor
  }
  panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    PANEL_TITLE,
    // preserveFocus: keep focus (and the selection context) in the editor —
    // stealing it would clear activeTextEditor and blank the first render.
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    }
  )
  panel.webview.html = buildWebviewHtml(context, panel.webview)

  panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
    switch (msg.type) {
      case 'ready':
        webviewReady = true
        pushCurrentState()
        pushPresets(context)
        break
      case 'saveImage': {
        if (typeof msg.dataURL !== 'string' || !msg.dataURL.startsWith(PNG_DATAURL_PREFIX)) {
          vscode.window.showErrorMessage(tr('host.rejectImage'))
          break
        }
        // Oversized but well-formed: a legit export the user can act on.
        if (msg.dataURL.length > MAX_SAVE_IMAGE_CHARS) {
          vscode.window.showErrorMessage(tr('host.imageTooLarge'))
          break
        }
        void saveImage(context, msg.dataURL).catch((err) => {
          vscode.window.showErrorMessage(tr('host.saveImageFailed', { err: String(err) }))
        })
        break
      }
      case 'saveSvg': {
        if (typeof msg.svg !== 'string' || !(msg.svg.startsWith('<svg') || msg.svg.startsWith('<?xml'))) {
          vscode.window.showErrorMessage(tr('host.rejectSvg'))
          break
        }
        // Oversized but well-formed: a legit long selection the user can act on.
        if (msg.svg.length > MAX_SAVE_SVG_CHARS) {
          vscode.window.showErrorMessage(tr('host.svgTooLarge'))
          break
        }
        void saveSvg(context, msg.svg).catch((err) => {
          vscode.window.showErrorMessage(tr('host.saveSvgFailed', { err: String(err) }))
        })
        break
      }
      // --- F9: preset management (storage + names stay host-side) ---
      case 'savePreset':
        void savePresetFlow(context).catch((err) => {
          vscode.window.showErrorMessage(tr('host.savePresetFailed', { err: String(err) }))
        })
        break
      case 'applyPreset':
        if (typeof msg.name === 'string' && msg.name.length <= 128) {
          void applyPreset(context, msg.name).catch((err) => {
            vscode.window.showErrorMessage(tr('host.applyPresetFailed', { err: String(err) }))
          })
        }
        break
      case 'deletePreset':
        void deletePresetFlow(context).catch((err) => {
          vscode.window.showErrorMessage(tr('host.deletePresetFailed', { err: String(err) }))
        })
        break
      case 'exportPreset':
        void exportPresetFlow(context).catch((err) => {
          vscode.window.showErrorMessage(tr('host.exportPresetFailed', { err: String(err) }))
        })
        break
      case 'importPreset':
        void importPresetFlow(context).catch((err) => {
          vscode.window.showErrorMessage(tr('host.importPresetFailed', { err: String(err) }))
        })
        break
      case 'updateSetting':
        void applySettingUpdate(msg.key, msg.value)
        break
      case 'notify': {
        if (
          (msg.level === 'info' || msg.level === 'warn' || msg.level === 'error') &&
          typeof msg.text === 'string' &&
          msg.text.length <= MAX_NOTIFY_CHARS
        ) {
          notify(msg.level, msg.text)
        } else {
          console.warn('Open Code Snap: dropped malformed notify message')
        }
        break
      }
    }
  })

  selectionListener = vscode.window.onDidChangeTextEditorSelection(
    (e) => {
      if (!e.selections[0] || e.selections[0].isEmpty) return
      // Follow the tracked source editor even when the webview holds focus;
      // also accept whichever editor is currently active (switching files).
      if (e.textEditor !== sourceEditor && e.textEditor !== vscode.window.activeTextEditor) return
      // Debounce: a drag-selection fires dozens of events per second.
      if (pendingTimer) clearTimeout(pendingTimer)
      pendingTimer = setTimeout(() => pushSnippetFrom(e.textEditor), 120)
    },
    undefined,
    context.subscriptions
  )

  // F1 acceptance: switching editor tabs must re-target the panel when the
  // newly activated editor has a selection (tab switches fire no selection
  // event on their own). No selection -> keep showing the previous snippet.
  activeEditorListener = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      // Cancel any pending debounce first: its timer captured the PREVIOUS
      // editor and would overwrite this fresher push ~120ms later (review M-1).
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        pendingTimer = undefined
      }
      if (editor) pushSnippetFrom(editor)
    },
    undefined,
    context.subscriptions
  )

  configListener = vscode.workspace.onDidChangeConfiguration(
    (e) => {
      if (e.affectsConfiguration('openCodeSnap') || e.affectsConfiguration('workbench.colorTheme')) {
        pushCurrentState()
      }
    },
    undefined,
    context.subscriptions
  )

  panel.onDidDispose(
    () => {
      panel = undefined
      webviewReady = false
      lastSnippet = null
      sourceEditor = undefined
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        pendingTimer = undefined
      }
      selectionListener?.dispose()
      selectionListener = undefined
      activeEditorListener?.dispose()
      activeEditorListener = undefined
      configListener?.dispose()
      configListener = undefined
    },
    undefined,
    context.subscriptions
  )
}

function buildWebviewHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js'))
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.css'))
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data: blob:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    // 'wasm-unsafe-eval' is required by Shiki's oniguruma engine (WASM),
    // and only permits WebAssembly compilation — not arbitrary eval.
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'`,
  ].join('; ')

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>${PANEL_TITLE}</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
}

/**
 * Build a SnippetRequest from the editor WITHOUT touching the clipboard.
 * This is the deliberate difference vs. polacode/codesnap (see docs ADR D1).
 */
function snippetFrom(editor: vscode.TextEditor): SnippetRequest | null {
  const selection = editor.selections[0]
  if (!selection || selection.isEmpty) return null
  const document = editor.document
  const fontLigatures = vscode.workspace.getConfiguration('editor').get<boolean>('fontLigatures', false)
  return {
    code: document.getText(selection),
    languageId: document.languageId,
    startLine: selection.start.line,
    windowTitle: path.basename(document.fileName),
    documentKey: document.uri.toString(),
    font: {
      family: vscode.workspace.getConfiguration('editor').get<string>('fontFamily', 'Consolas, monospace'),
      ligatures: fontLigatures === true,
      tabSize: effectiveTabSize(editor),
    },
  }
}

/** openCodeSnap.tabSize > 0 overrides the document's tab size (PRD F2.5). */
function effectiveTabSize(editor: vscode.TextEditor | undefined): number {
  const override = vscode.workspace.getConfiguration('openCodeSnap').get<number>('tabSize', 0)
  if (override > 0) return override
  if (editor) return Number(editor.options.tabSize ?? 4) || 4 // option can be a string in rare configs
  return 4
}

function currentStyle(): ReturnType<typeof readStyleFromConfig> {
  return readStyleFromConfig(vscode.workspace.getConfiguration('openCodeSnap'), {
    fontFamily: vscode.workspace.getConfiguration('editor').get('fontFamily'),
    fontLigatures: vscode.workspace.getConfiguration('editor').get('fontLigatures'),
  })
}

function editorThemeName(): string {
  return vscode.workspace.getConfiguration('workbench').get<string>('colorTheme', '')
}

// --- F12: UI locale (setting + env language), shared by host messages ---

function uiLanguageSetting(): 'auto' | 'zh' | 'en' {
  const v = vscode.workspace.getConfiguration('openCodeSnap').get<string>('uiLanguage', 'auto')
  return v === 'zh' || v === 'en' ? v : 'auto'
}

function uiLocale(): Locale {
  return resolveLocale(uiLanguageSetting(), vscode.env.language)
}

/** Translate against the CURRENT resolved locale. */
function tr(key: StringKey, params?: Record<string, string | number>): string {
  return t(uiLocale(), key, params)
}

function themeContext(): ThemeContext {
  return { editorThemeName: editorThemeName(), uiLocale: uiLocale() }
}

function post(message: HostMessage): void {
  void panel?.webview.postMessage(message)
}

function pushSnippetFrom(editor: vscode.TextEditor): void {
  const snippet = snippetFrom(editor)
  if (!snippet) return
  lastSnippet = snippet
  sourceEditor = editor
  if (webviewReady) {
    post({ type: 'update', request: snippet, style: currentStyle(), themeContext: themeContext() })
  }
}

function pushCurrentState(): void {
  if (!webviewReady) return
  const style = currentStyle()
  const context = themeContext()
  if (lastSnippet) {
    // Re-resolve tabSize so an open panel picks up a tabSize setting change
    // without waiting for the next selection (review N-3).
    const tabSize = effectiveTabSize(sourceEditor)
    const request =
      lastSnippet.font.tabSize === tabSize
        ? lastSnippet
        : { ...lastSnippet, font: { ...lastSnippet.font, tabSize } }
    post({ type: 'update', request, themeContext: context, style })
  } else {
    const editor = vscode.window.activeTextEditor
    const snippet = editor ? snippetFrom(editor) : null
    if (snippet) {
      lastSnippet = snippet
      post({ type: 'update', request: snippet, style, themeContext: context })
    } else {
      post({ type: 'style', style, themeContext: context })
    }
  }
}

/**
 * F4.2: persist a webview-originated style knob to USER settings.
 * The value passes the core whitelist first; a workspace-level override
 * (which wins over user settings) is detected and surfaced instead of
 * silently eating the change.
 */
async function applySettingUpdate(key: string, value: unknown): Promise<void> {
  const result = validateSettingUpdate(key, value)
  if (!result.ok) {
    vscode.window.showErrorMessage(tr('host.rejectSetting', { reason: result.reason }))
    return
  }
  try {
    await vscode.workspace
      .getConfiguration('openCodeSnap')
      .update(key, result.value, vscode.ConfigurationTarget.Global)
  } catch (err) {
    vscode.window.showErrorMessage(tr('host.writeSettingFailed', { err: String(err) }))
    return
  }
  // Deterministic override check (review N-2): a workspace-level value wins
  // over user settings regardless of when the change event lands.
  const inspect = vscode.workspace.getConfiguration('openCodeSnap').inspect(key)
  if (inspect && (inspect.workspaceValue !== undefined || inspect.workspaceFolderValue !== undefined)) {
    vscode.window.showWarningMessage(tr('host.workspaceOverride', { key }))
  }
  // Push the (possibly unchanged) effective style so the toolbar snaps back
  // when a workspace override won, and renders promptly when it did not.
  pushCurrentState()
}

async function saveImage(context: vscode.ExtensionContext, dataURL: string): Promise<void> {
  // The caller has verified the exact `data:image/png;base64,` prefix.
  const base64 = dataURL.slice(PNG_DATAURL_PREFIX.length)
  const key = 'openCodeSnap.lastSaveDir'
  const lastDir = context.globalState.get<string>(key)
  const defaultUri = vscode.Uri.file(
    path.resolve(lastDir || path.join(homedir(), 'Desktop'), `code-${Date.now()}.png`)
  )
  const uri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { Images: ['png'] },
  })
  if (!uri) return
  fs.writeFileSync(uri.fsPath, Buffer.from(base64, 'base64'))
  context.globalState.update(key, path.dirname(uri.fsPath))
  vscode.window.showInformationMessage(tr('host.saved', { name: path.basename(uri.fsPath) }))
}

/** F8: persist the generated SVG next to the usual save flow. */
async function saveSvg(context: vscode.ExtensionContext, svg: string): Promise<void> {
  const key = 'openCodeSnap.lastSaveDir'
  const lastDir = context.globalState.get<string>(key)
  const defaultUri = vscode.Uri.file(
    path.resolve(lastDir || path.join(homedir(), 'Desktop'), `code-${Date.now()}.svg`)
  )
  const uri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { 'SVG image': ['svg'] },
  })
  if (!uri) return
  fs.writeFileSync(uri.fsPath, svg, 'utf8')
  context.globalState.update(key, path.dirname(uri.fsPath))
  vscode.window.showInformationMessage(`Open Code Snap: saved ${path.basename(uri.fsPath)}`)
}

// --- F9: preset management (host owns storage; values re-pass the whitelist) ---

function loadPresets(context: vscode.ExtensionContext): Record<string, unknown> {
  // Null prototype: a preset literally named "__proto__" must be an own key,
  // not a trigger for the prototype setter (review Major-3).
  return Object.assign(
    Object.create(null) as Record<string, unknown>,
    context.globalState.get<Record<string, unknown>>(PRESETS_KEY, {}) ?? {}
  )
}

function pushPresets(context: vscode.ExtensionContext): void {
  post({ type: 'presets', names: Object.keys(loadPresets(context)).sort() })
}

async function writePresets(
  context: vscode.ExtensionContext,
  presets: Record<string, unknown>
): Promise<void> {
  await context.globalState.update(PRESETS_KEY, presets)
  pushPresets(context)
}

async function savePresetFlow(context: vscode.ExtensionContext): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: tr('host.presetNamePrompt'),
    placeHolder: tr('host.presetNamePlaceholder'),
    validateInput: (v) => (validatePresetName(v) ? null : tr('host.presetNameInvalid')),
  })
  if (name === undefined) return
  const valid = validatePresetName(name)
  if (!valid) return
  const presets = loadPresets(context)
  const existed = presets[valid] !== undefined
  if (!existed && Object.keys(presets).length >= MAX_PRESETS) {
    vscode.window.showWarningMessage(tr('host.presetLimit', { max: MAX_PRESETS }))
    return
  }
  presets[valid] = serializePreset(currentStyle()).settings
  await writePresets(context, presets)
  vscode.window.showInformationMessage(existed ? tr('host.presetSavedOverwrite', { name: valid }) : tr('host.presetSavedNew', { name: valid }))
}

async function applyPreset(context: vscode.ExtensionContext, name: string): Promise<void> {
  const raw = loadPresets(context)[name]
  if (raw === undefined) {
    vscode.window.showWarningMessage(tr('host.presetMissing', { name }))
    pushPresets(context)
    return
  }
  const result = sanitizePreset(raw)
  if (!result.ok) {
    vscode.window.showErrorMessage(tr('host.presetCorrupt', { name, reason: result.reason }))
    return
  }
  const config = vscode.workspace.getConfiguration('openCodeSnap')
  let applied = 0
  let failed = 0
  let dropped = 0
  let overridden = 0
  for (const [key, value] of Object.entries(result.settings)) {
    // Defense in depth: sanitize already ran this whitelist, but every write
    // to user settings must prove itself again.
    const check = validateSettingUpdate(key, value)
    if (!check.ok) {
      dropped += 1
      continue
    }
    try {
      await config.update(key, check.value, vscode.ConfigurationTarget.Global)
      applied += 1
    } catch {
      // No rollback for earlier keys, but the user must hear about it (M-2/M-8).
      failed += 1
    }
    const inspect = config.inspect(key)
    if (inspect && (inspect.workspaceValue !== undefined || inspect.workspaceFolderValue !== undefined)) {
      overridden += 1
    }
  }
  if (overridden > 0) {
    vscode.window.showWarningMessage(tr('host.presetOverridden', { n: overridden }))
  }
  pushCurrentState()
  if (failed > 0 || dropped > 0) {
    vscode.window.showWarningMessage(
      tr('host.presetPartial', {
        name,
        applied,
        failed: failed ? tr('host.presetPartialFailed', { n: failed }) : '',
        dropped: dropped ? tr('host.presetPartialDropped', { n: dropped }) : '',
      })
    )
  } else {
    vscode.window.showInformationMessage(tr('host.presetApplied', { name, n: applied }))
  }
}

/** QuickPick over the stored names; null when the user cancelled or none exist. */
async function pickPreset(context: vscode.ExtensionContext, title: string): Promise<string | null> {
  const names = Object.keys(loadPresets(context)).sort()
  if (names.length === 0) {
    vscode.window.showInformationMessage(tr('host.noPresets'))
    return null
  }
  const picked = await vscode.window.showQuickPick(names, { title, placeHolder: tr('host.pickPresetPlaceholder') })
  return picked ?? null
}

async function deletePresetFlow(context: vscode.ExtensionContext): Promise<void> {
  const name = await pickPreset(context, tr('host.deletePresetTitle'))
  if (name === null) return
  const presets = loadPresets(context)
  if (presets[name] === undefined) {
    vscode.window.showWarningMessage(`Open Code Snap: 预设「${name}」不存在，列表已刷新。`)
    pushPresets(context)
    return
  }
  const deleteBtn = tr('host.deleteBtn')
  const confirm = await vscode.window.showWarningMessage(tr('host.deleteConfirm', { name }), { modal: true }, deleteBtn)
  if (confirm !== deleteBtn) return
  delete presets[name]
  await writePresets(context, presets)
  vscode.window.showInformationMessage(tr('host.presetDeleted', { name }))
}

async function exportPresetFlow(context: vscode.ExtensionContext): Promise<void> {
  const name = await pickPreset(context, tr('host.exportPresetTitle'))
  if (name === null) return
  const raw = loadPresets(context)[name]
  if (raw === undefined) {
    vscode.window.showWarningMessage(`Open Code Snap: 预设「${name}」不存在，列表已刷新。`)
    pushPresets(context)
    return
  }
  const file = { version: 1 as const, name, settings: raw }
  const lastDir = context.globalState.get<string>('openCodeSnap.lastSaveDir')
  // Preset names are free-form; strip filesystem-hostile characters and any
  // leading path traversal before they reach the dialog default (review m-5).
  const safe = name.replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '')
  const defaultUri = vscode.Uri.file(path.resolve(lastDir || homedir(), `${safe}.json`))
  const uri = await vscode.window.showSaveDialog({ defaultUri, filters: { JSON: ['json'] } })
  if (!uri) return
  fs.writeFileSync(uri.fsPath, JSON.stringify(file, null, 2), 'utf8')
  context.globalState.update('openCodeSnap.lastSaveDir', path.dirname(uri.fsPath))
  vscode.window.showInformationMessage(tr('host.presetExported', { name: path.basename(uri.fsPath) }))
}

async function importPresetFlow(context: vscode.ExtensionContext): Promise<void> {
  const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { JSON: ['json'] } })
  const uri = uris?.[0]
  if (!uri) return
  // Size-check before reading: a huge file should not enter memory at all.
  const size = fs.statSync(uri.fsPath).size
  if (size > MAX_PRESET_JSON_CHARS) {
    vscode.window.showErrorMessage(tr('host.presetFileTooLarge'))
    return
  }
  const text = fs.readFileSync(uri.fsPath, 'utf8')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    vscode.window.showErrorMessage(tr('host.presetNotJson'))
    return
  }
  const result = sanitizePreset(raw)
  if (!result.ok) {
    vscode.window.showErrorMessage(tr('host.presetImportInvalid', { reason: result.reason }))
    return
  }
  // The preset name comes from the file name: users control it by renaming.
  const base = path.basename(uri.fsPath, path.extname(uri.fsPath))
  const name = validatePresetName(base)
  if (!name) {
    vscode.window.showErrorMessage(tr('host.presetFilenameInvalid'))
    return
  }
  const presets = loadPresets(context)
  const existed = presets[name] !== undefined
  if (!existed && Object.keys(presets).length >= MAX_PRESETS) {
    vscode.window.showWarningMessage(`Open Code Snap: 预设数量已达上限（${MAX_PRESETS}），请先删除部分预设。`)
    return
  }
  presets[name] = result.settings
  await writePresets(context, presets)
  vscode.window.showInformationMessage(
    existed
      ? tr('host.presetImportedOverwrite', { name, n: Object.keys(result.settings).length })
      : tr('host.presetImportedNew', { name, n: Object.keys(result.settings).length })
  )
}

function notify(level: 'info' | 'warn' | 'error', text: string): void {
  const fn =
    level === 'error' ? vscode.window.showErrorMessage : level === 'warn' ? vscode.window.showWarningMessage : vscode.window.showInformationMessage
  fn(text)
}
