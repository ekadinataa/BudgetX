import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { chromium, localOnly } from './browser-support';
import { measureTextContrast } from './contrast-support';

const URL = globalThis.process?.env?.UAT_URL || 'http://localhost:5173';
const fixtures = ['login', 'register', 'forgot', 'transaction', 'wallet', 'transfer', 'income', 'allocation', 'allocation-empty', 'period', 'transition', 'recurring', 'repurchase', 'subscription', 'pay', 'debt', 'payment', 'investment', 'buy', 'sell', 'value', 'asset', 'cycle', 'import', 'reset'];
let browser;
beforeAll(async () => { if (chromium) browser = await chromium.launch({ channel: 'chrome' }); }, 60_000);
afterAll(async () => { await browser?.close(); });

describe.skipIf(!chromium)('production forms with the reference tokens', () => {
  it.each([[1280, false], [1280, true], [360, false], [360, true]])('all 25 auth/form surfaces fit at %ipx dark=%s', async (width, darkMode) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await localOnly(page);
    await page.addInitScript(darkMode => { if (!localStorage.getItem('budgetku_state')) localStorage.setItem('budgetku_state', JSON.stringify({ darkMode })); }, darkMode);
    try {
      await page.goto(URL, { waitUntil: 'networkidle' });
      for (const kind of fixtures) {
        // String form keeps Vitest from rewriting the browser's dynamic import.
        await page.evaluate(`import('/src/__tests__/layout/modal-fixtures.jsx').then(m => m.mountModalFixture(${JSON.stringify(kind)}))`);
        const surface = page.locator('#visual-modal-fixture .modal, #visual-modal-fixture .authCard');
        try { await surface.waitFor({ timeout: 5_000 }); }
        catch { throw new Error(`Fixture ${kind} did not render: ${errors.join('; ')}; host=${await page.evaluate(() => document.getElementById('visual-modal-fixture')?.outerHTML?.slice(0, 500) || 'missing')}`); }
        const layout = await surface.evaluate(el => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, width: r.width, horizontalOverflow: el.scrollWidth > el.clientWidth + 1, bodyOverflow: [...el.querySelectorAll('.modalBody')].some(body => body.scrollWidth > body.clientWidth + 1) };
        });
        expect(layout.left, `${kind} left edge`).toBeGreaterThanOrEqual(0);
        expect(layout.right, `${kind} right edge`).toBeLessThanOrEqual(width + 1);
        expect(layout.width).toBeGreaterThan(200);
        expect(layout.horizontalOverflow, `${kind} panel overflow`).toBe(false);
        expect(layout.bodyOverflow, `${kind} form overflow`).toBe(false);
        const contrast = await page.evaluate(measureTextContrast, '#visual-modal-fixture');
        expect(contrast.tested, `${kind} needs visible text to test`).toBeGreaterThan(0);
        expect(contrast.failures, `${kind} text contrast`).toEqual([]);
      }
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, 120_000);
});
