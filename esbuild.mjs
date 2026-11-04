import { build, context } from 'esbuild'

const watch = process.argv.includes('--watch')

/** Extension host bundle (Node.js, CJS, vscode external) */
const hostOptions = {
  entryPoints: ['src/host/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: 'dist/extension.js',
  sourcemap: true,
  external: ['vscode'],
  logLevel: 'info',
}

/** Webview bundle (Chromium, IIFE). Emits dist/webview.css alongside. */
const webviewOptions = {
  entryPoints: ['webview/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  outfile: 'dist/webview.js',
  sourcemap: true,
  logLevel: 'info',
}

if (watch) {
  const [host, webview] = await Promise.all([
    context(hostOptions),
    context(webviewOptions),
  ])
  await Promise.all([host.watch(), webview.watch()])
  console.log('[esbuild] watching...')
} else {
  await Promise.all([build(hostOptions), build(webviewOptions)])
  console.log('[esbuild] build done')
}
