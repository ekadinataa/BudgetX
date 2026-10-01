import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildSingleHtml } from '../../../scripts/build-single-html.mjs'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const dist = join(projectRoot, 'dist')

// The script only works on a finished `vite build`. dist/ is gitignored, so on a
// fresh clone there is nothing to assert against — skip instead of failing.
const hasBuild = existsSync(join(dist, 'index.html')) && existsSync(join(dist, 'logo.png'))

/** Splits the output into the head and the inline module body. */
function parts(html) {
  const open = '<script type="module">'
  const start = html.indexOf(open)
  expect(start).toBeGreaterThan(-1)
  return {
    head: html.slice(0, start),
    code: html.slice(start + open.length, html.indexOf('</script>', start)),
  }
}

describe('single-file HTML build', () => {
  it.skipIf(!hasBuild)('is standalone — references no sibling file', async () => {
    const { html } = await buildSingleHtml(dist)
    const { head, code } = parts(html)

    expect(head).not.toContain('/assets/')
    expect(head).not.toContain('/logo.png')
    expect(head).not.toMatch(/(?:src|href)="\/(?!data:|#|https?:)/)
    expect(code).not.toContain('/logo.png')
  })

  it.skipIf(!hasBuild)('inlines exactly one module bundle and one stylesheet', async () => {
    const { html } = await buildSingleHtml(dist)

    expect(html.match(/<script type="module">/g)).toHaveLength(1)
    expect(html.match(/<style>/g)).toHaveLength(1)
    expect(html.match(/<link[^>]*\/assets\//g) ?? []).toHaveLength(0)
  })

  it.skipIf(!hasBuild)('points every logo call site at the inlined data URI', async () => {
    const { html, logoRefs } = await buildSingleHtml(dist)
    const { head, code } = parts(html)

    expect(logoRefs).toBeGreaterThan(0)
    expect(head).toContain('window.__BUDGETX_LOGO__ = "data:image/png;base64,')
    // The call sites become a bare identifier, so quote style does not matter.
    expect(code.split('__BUDGETX_LOGO__')).toHaveLength(logoRefs + 1)
  })

  it.skipIf(!hasBuild)('defines the logo global before the module runs', async () => {
    // Classic scripts in <head> execute before deferred module scripts; a
    // `type="module"` global would be a ReferenceError on first render.
    const { html } = await buildSingleHtml(dist)
    const { head, code } = parts(html)

    expect(head.indexOf('window.__BUDGETX_LOGO__')).toBeLessThan(head.length)
    expect(head.indexOf('window.__BUDGETX_LOGO__')).toBeLessThan(code.length)
    expect(code).toContain('__BUDGETX_LOGO__')
  })

  it.skipIf(!hasBuild)('keeps the bundle intact — no early </script', async () => {
    // A raw `</script` inside the inline module ends the element early; the rest
    // is parsed as HTML. Silent, and it breaks the app.
    const { html } = await buildSingleHtml(dist)
    const { code } = parts(html)

    expect(code).not.toMatch(/<\/script/i)
    expect(code).toContain('createRoot')
  })

  it.skipIf(!hasBuild)('has no $ substitution damage from String.replace', async () => {
    // Regression: passing the bundle as a *string* replacement makes `$\`` and
    // `$&` inside it expand to the surrounding HTML, corrupting the output.
    const { html } = await buildSingleHtml(dist)
    const { code } = parts(html)

    expect(code).not.toContain('<link rel="preconnect"')
    expect(code).not.toContain('</head>')
    expect(code).not.toContain('<div id="root">')
  })
})
