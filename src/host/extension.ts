import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'
import type { HostMessage, SnippetRequest, WebviewMessage } from '../core/protocol'
import { readStyleFromConfig } from '../core/model'

const VIEW_TYPE = 'openCodeSnap.panel'
const PANEL_TITLE = 'Open Code Snap 📸'

let panel: vscode.WebviewPanel | undefined
let selectionListener: vscode.Disposable | undefined
let configListener: vscode.Disposable | undefined
let pendingTimer: ReturnType<typeof setTimeout> | undefined
let webviewReady = false
let lastSnippet: SnippetRequest | null = null

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
  configListener?.dispose()
}

function showPanel(context: vscode.ExtensionContext): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside, true)
    return
  }
  panel = vscode.window.createWebviewPanel(VIEW_TYPE, PANEL_TITLE, vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
  })
  panel.webview.html = buildWebviewHtml(context, panel.webview)

  panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
    switch (msg.type) {
      case 'ready':
        webviewReady = true
        pushCurrentState()
        break
      case 'saveImage':
        void saveImage(context, msg.dataURL)
        break
      case 'notify':
        notify(msg.level, msg.text)
        break
    }
  })

  selectionListener = vscode.window.onDidChangeTextEditorSelection(
    (e) => {
      if (!e.selections[0] || e.selections[0].isEmpty) return
      if (e.textEditor !== vscode.window.activeTextEditor) return
      // Debounce: a drag-selection fires dozens of events per second.
      if (pendingTimer) clearTimeout(pendingTimer)
      pendingTimer = setTimeout(() => pushSnippetFrom(e.textEditor), 120)
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
      selectionListener?.dispose()
      selectionListener = undefined
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
    font: {
      family: vscode.workspace.getConfiguration('editor').get<string>('fontFamily', 'Consolas, monospace'),
      ligatures: fontLigatures === true,
      // tabSize option can be a string in rare configs; normalize it.
      tabSize: Number(editor.options.tabSize ?? 4) || 4,
    },
  }
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
  if (webviewReady) {
    post({ type: 'update', request: snippet, style: currentStyle(), themeContext: { editorThemeName: editorThemeName() } })
  }
}

function pushCurrentState(): void {
  if (!webviewReady) return
  const style = currentStyle()
  const themeContext = { editorThemeName: editorThemeName() }
  if (lastSnippet) {
    post({ type: 'update', request: lastSnippet, style, themeContext })
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

async function saveImage(context: vscode.ExtensionContext, dataURL: string): Promise<void> {
  const base64 = dataURL.slice(dataURL.indexOf(',') + 1)
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
