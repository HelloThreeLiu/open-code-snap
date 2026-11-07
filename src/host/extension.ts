import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'
import type { HostMessage, SnippetRequest, WebviewMessage } from '../core/protocol'
import { readStyleFromConfig } from '../core/model'
import { validateSettingUpdate } from '../core/settings'

const VIEW_TYPE = 'openCodeSnap.panel'
const PANEL_TITLE = 'Open Code Snap 📸'

/** Message-body guards (hang-⑤): the webview is trusted-but-fallible, so
 *  every webview→host payload is shape-checked before the host acts on it. */
const MAX_NOTIFY_CHARS = 2000
/** base64 chars; 3x-scale 300-line exports are ~13M chars, so this leaves headroom. */
const MAX_SAVE_IMAGE_CHARS = 32 * 1024 * 1024
const PNG_DATAURL_PREFIX = 'data:image/png;base64,'

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
      vscode.window.showWarningMessage('Open Code Snap: no active editor.')
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
        break
      case 'saveImage': {
        if (typeof msg.dataURL !== 'string' || !msg.dataURL.startsWith(PNG_DATAURL_PREFIX)) {
          vscode.window.showErrorMessage('Open Code Snap: 拒绝了非法的图片数据（未通过校验）。')
          break
        }
        // Oversized but well-formed: a legit export the user can act on.
        if (msg.dataURL.length > MAX_SAVE_IMAGE_CHARS) {
          vscode.window.showErrorMessage(
            'Open Code Snap: 导出图片过大，请降低缩放倍数或减少所选行数后重试。'
          )
          break
        }
        void saveImage(context, msg.dataURL)
        break
      }
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

function post(message: HostMessage): void {
  void panel?.webview.postMessage(message)
}

function pushSnippetFrom(editor: vscode.TextEditor): void {
  const snippet = snippetFrom(editor)
  if (!snippet) return
  lastSnippet = snippet
  sourceEditor = editor
  if (webviewReady) {
    post({ type: 'update', request: snippet, style: currentStyle(), themeContext: { editorThemeName: editorThemeName() } })
  }
}

function pushCurrentState(): void {
  if (!webviewReady) return
  const style = currentStyle()
  const themeContext = { editorThemeName: editorThemeName() }
  if (lastSnippet) {
    // Re-resolve tabSize so an open panel picks up a tabSize setting change
    // without waiting for the next selection (review N-3).
    const tabSize = effectiveTabSize(sourceEditor)
    const request =
      lastSnippet.font.tabSize === tabSize
        ? lastSnippet
        : { ...lastSnippet, font: { ...lastSnippet.font, tabSize } }
    post({ type: 'update', request, themeContext, style })
  } else {
    const editor = vscode.window.activeTextEditor
    const snippet = editor ? snippetFrom(editor) : null
    if (snippet) {
      lastSnippet = snippet
      post({ type: 'update', request: snippet, style, themeContext })
    } else {
      post({ type: 'style', style, themeContext })
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
    vscode.window.showErrorMessage(`Open Code Snap: 拒绝了设置更新（${result.reason}）`)
    return
  }
  try {
    await vscode.workspace
      .getConfiguration('openCodeSnap')
      .update(key, result.value, vscode.ConfigurationTarget.Global)
  } catch (err) {
    vscode.window.showErrorMessage(`Open Code Snap: 写入设置失败: ${String(err)}`)
    return
  }
  // Deterministic override check (review N-2): a workspace-level value wins
  // over user settings regardless of when the change event lands.
  const inspect = vscode.workspace.getConfiguration('openCodeSnap').inspect(key)
  if (inspect && (inspect.workspaceValue !== undefined || inspect.workspaceFolderValue !== undefined)) {
    vscode.window.showWarningMessage(
      `Open Code Snap: 工作区设置覆盖了 "${key}"，面板改动未生效，请到工作区设置中修改。`
    )
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
  vscode.window.showInformationMessage(`Open Code Snap: saved ${path.basename(uri.fsPath)}`)
}

function notify(level: 'info' | 'warn' | 'error', text: string): void {
  const fn =
    level === 'error' ? vscode.window.showErrorMessage : level === 'warn' ? vscode.window.showWarningMessage : vscode.window.showInformationMessage
  fn(text)
}
