#!/usr/bin/env node
/**
 * Bundles the Excalidraw editor into a single HTML file the app ships.
 *
 * Excalidraw's dist is ESM with dynamic imports and 13 MB of fonts, 12 of
 * which are the CJK family alone. A WebView reading from `file://` cannot load
 * ES modules, so everything is bundled into one classic script, the styles and
 * the fonts our languages need are inlined next to it, and the result is one
 * asset with nothing left to fetch — which is what makes the editor work with
 * no network.
 */
import { build } from 'esbuild'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'assets/webviewer')
const distDir = path.join(root, 'node_modules/@excalidraw/excalidraw/dist/prod')

// Xiaolai is the CJK family: 12 MB of the 13 MB of fonts, for scripts the app
// does not ship. Everything else is kept.
const SKIPPED_FONT_FAMILIES = ['Xiaolai']

const collectFonts = async () => {
  const families = await readdir(path.join(distDir, 'fonts'))
  const fonts = []
  for (const family of families) {
    if (SKIPPED_FONT_FAMILIES.includes(family)) continue
    const dir = path.join(distDir, 'fonts', family)
    for (const file of await readdir(dir)) {
      if (!file.endsWith('.woff2')) continue
      fonts.push({ name: file, data: await readFile(path.join(dir, file)) })
    }
  }
  return fonts
}

const main = async () => {
  if (!existsSync(distDir)) {
    throw new Error('@excalidraw/excalidraw is not installed; run npm install first')
  }

  const result = await build({
    entryPoints: [path.join(root, 'webview/excalidraw/index.jsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['safari15'],
    minify: true,
    write: false,
    outfile: 'excalidraw-bundle.js',
    jsx: 'automatic',
    loader: { '.woff2': 'dataurl', '.ttf': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl' },
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.IS_PREACT': '"false"'
    }
  })

  const bundle = result.outputFiles.find(file => file.path.endsWith('.js'))?.text ?? ''
  const styles =
    result.outputFiles.find(file => file.path.endsWith('.css'))?.text ??
    (await readFile(path.join(distDir, 'index.css'), 'utf8'))

  const fonts = await collectFonts()
  const fontFaces = fonts
    .map(
      font =>
        `/* ${font.name} */`
    )
    .join('\n')

  const template = await readFile(path.join(root, 'webview/excalidraw/template.html'), 'utf8')
  // Replacements go through a function: a minified bundle is full of `$&` and
  // `$1`, which String.replace would otherwise expand into the match.
  const html = template
    .replace('/* __STYLES__ */', () => `${styles}\n${fontFaces}`)
    .replace('__ASSET_PATH__', () => 'data:')
    .replace('/* __BUNDLE__ */', () => bundle)

  await mkdir(outDir, { recursive: true })
  const outFile = path.join(outDir, 'excalidraw.html')
  await writeFile(outFile, html)

  const mb = (Buffer.byteLength(html) / (1024 * 1024)).toFixed(2)
  console.log(`excalidraw.html written: ${mb} MB (${fonts.length} fonts kept)`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
