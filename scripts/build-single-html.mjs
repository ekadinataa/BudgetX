/**
 * Build a single self-contained HTML file from the Vite production build.
 *
 *   npm run build && node scripts/build-single-html.mjs
 *
 * Inlines the hashed CSS and JS bundles plus every local asset into
 * dist/index.html, so the result opens straight from the filesystem with no
 * server and no sibling files. Google Fonts stays as a <link> — the app falls
 * back to system sans when offline, and embedding the woff2 payloads would add
 * ~250 KB for a purely cosmetic gain.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, basename } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * @param {string} distDir Vite output directory.
 * @returns {Promise<{html: string, jsName: string, cssName: string, logoBytes: number, logoRefs: number}>}
 */
export async function buildSingleHtml(distDir) {
  const assetsDir = join(distDir, 'assets')
  const files = await readdir(assetsDir)
  const jsName = files.find((f) => f.endsWith('.js'))
  const cssName = files.find((f) => f.endsWith('.css'))

  if (!jsName || !cssName) {
    throw new Error('Expected one .js and one .css in dist/assets — run `npm run build` first.')
  }

  const js = await readFile(join(assetsDir, jsName), 'utf8')
  const css = await readFile(join(assetsDir, cssName), 'utf8')
  const logo = await readFile(join(distDir, 'logo.png'))
  const logoDataUri = `data:image/png;base64,${logo.toString('base64')}`

  const shell = await readFile(join(distDir, 'index.html'), 'utf8')

  // Every local reference in the shell must be one we inline below, otherwise the
  // output would still depend on sibling files. Checked before the bundles go in,
  // because the bundle text itself contains those same paths in source strings.
  const localRefs = [...new Set(shell.match(/(?:src|href)="\/(?!data:)[^"]*"/g) ?? [])]
  const expected = new Set([`href="/assets/${cssName}"`, `src="/assets/${jsName}"`, 'href="/logo.png"'])
  const unexpected = localRefs.filter((ref) => !expected.has(ref))
  if (unexpected.length) {
    throw new Error(`Un-inlined local asset reference(s): ${unexpected.join(', ')}`)
  }

  // The app hardcodes `<img src="/logo.png">` in five components (sidebar, mobile
  // top bar, three auth pages). That path is resolved against the server root, so
  // it 404s the moment the file stands alone. Rewrite those call sites to a global
  // holding the data URI — inlining the 55 KB base64 at every site would be worse.
  const LOGO_GLOBAL = '__BUDGETX_LOGO__'
  const logoRefs = js.match(/(["'`])\/logo\.png\1/g)?.length ?? 0
  const patchedJs = js.replace(/(["'`])\/logo\.png\1/g, () => LOGO_GLOBAL)
  if (logoRefs === 0) throw new Error('No /logo.png reference found in the bundle — check the patch.')
  if (patchedJs.includes('/logo.png')) throw new Error('Un-patched /logo.png reference remains.')

  const inlinedJs = patchedJs.replace(/<\/script/gi, '<\\/script')
  const styleTag = `<style>\n${css}\n  </style>`
  const scriptTag = `<script type="module">\n${inlinedJs}\n  </script>`
  // Classic script in <head>: inline module scripts are deferred, so this global
  // is guaranteed to exist before the bundle evaluates.
  const logoScript = `<script>window.${LOGO_GLOBAL} = "${logoDataUri}";</script>`

  // Every replace below passes a function replacer on purpose. A minified bundle is
  // full of `$&`, `$'` and `` $` `` sequences; as a *string* replacement those are
  // substitution patterns and would splice the surrounding HTML into the code.
  const stylesRe = new RegExp(`<link[^>]*href="/assets/${cssName}"[^>]*>`)
  if (!stylesRe.test(shell)) throw new Error('Stylesheet link not found in dist/index.html')
  let html = shell.replace(stylesRe, () => styleTag)

  const scriptRe = new RegExp(`<script[^>]*src="/assets/${jsName}"[^>]*></script>`)
  if (!scriptRe.test(html)) throw new Error('Module script not found in dist/index.html')
  html = html.replace(scriptRe, () => scriptTag)

  html = html.replace('href="/logo.png"', () => `href="${logoDataUri}"`)
  html = html.replace('<head>', () => `<head>\n    ${logoScript}`)

  // Round-trip check: the bytes the browser will parse must match the bundles
  // exactly, apart from the `</script` escaping.
  const scriptStart = html.indexOf('<script type="module">') + '<script type="module">'.length
  const scriptEnd = html.indexOf('</script>', scriptStart)
  if (html.slice(scriptStart, scriptEnd).trim() !== inlinedJs) {
    throw new Error('Inlined JS does not round-trip — output would be corrupt.')
  }
  const styleStart = html.indexOf('<style>') + '<style>'.length
  const styleEnd = html.indexOf('</style>', styleStart)
  if (html.slice(styleStart, styleEnd).trim() !== css.trim()) {
    throw new Error('Inlined CSS does not round-trip — output would be corrupt.')
  }
  if (html.includes('/logo.png') || html.includes('/assets/')) {
    throw new Error('Output still references a sibling file — it is not standalone.')
  }

  return { html, jsName, cssName, logoBytes: logo.length, logoRefs }
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { html, jsName, cssName, logoBytes, logoRefs } = await buildSingleHtml(join(root, 'dist'))
  const out = join(root, '..', 'budgetx.html')
  await writeFile(out, html, 'utf8')
  console.log(`Wrote ${basename(out)} (${mb(Buffer.byteLength(html))})`)
  console.log(
    `  inlined: ${jsName}, ${cssName}, logo.png ${mb(logoBytes)} (${logoRefs} call sites)`,
  )
}
