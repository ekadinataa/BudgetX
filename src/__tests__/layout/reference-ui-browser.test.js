import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { chromium, navigate, localOnly } from './browser-support';
import { measureTextContrast } from './contrast-support';

const URL = globalThis.process?.env?.UAT_URL || 'http://localhost:5173';
const demo = JSON.parse(readFileSync(new globalThis.URL('../../../public/demo/budgetx-demo-agustus-oktober-2026.json', import.meta.url), 'utf8')).data;
const routes = ['dashboard', 'wallet', 'tx', 'budget', 'recurring', 'subscription', 'wishlist', 'debt', 'invest', 'asset', 'report', 'fire', 'settings', 'help'];
let browser;
beforeAll(async () => { if (chromium) browser = await chromium.launch({ channel: 'chrome' }); }, 60_000);
afterAll(async () => { await browser?.close(); });

describe.skipIf(!chromium)('video-reference production UI (local synthetic data only)', () => {
  it.each([false, true])('all 14 destinations fit 12 viewport sizes, dark=%s', async darkMode => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await localOnly(page);
    await page.addInitScript(({ demo, darkMode }) => { if (!localStorage.getItem('budgetku_state')) localStorage.setItem('budgetku_state', JSON.stringify({ ...demo, page: 'dashboard', darkMode })); }, { demo, darkMode });
    try {
      await page.goto(URL, { waitUntil: 'networkidle' });
      for (const width of [360, 390, 414, 640, 768, 820, 900, 1024, 1280, 1440, 1640, 2000]) {
        await page.setViewportSize({ width, height: 900 });
        for (const id of routes) {
          await navigate(page, id);
          const check = await page.evaluate(() => {
            const box = document.querySelector('.container').getBoundingClientRect();
            const clipped = [...document.querySelectorAll('.largeTitle, .statLabel, .topnav summary')].filter(el => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth + 1).map(el => el.textContent);
            return { overflow: document.documentElement.scrollWidth > innerWidth + 1, clipped, content: box.width, heading: document.querySelector('h1')?.textContent || document.querySelector('.helpTitle')?.textContent };
          });
          expect(check.overflow, `${id} ${width}px dark=${darkMode}`).toBe(false);
          expect(check.clipped, `${id} ${width}px labels`).toEqual([]);
          expect(check.heading, `${id} must render content`).toBeTruthy();
          expect(check.content).toBeGreaterThan(Math.min(width - 40, 880));
          if (width === 1280 || width === 390) {
            const contrast = await page.evaluate(measureTextContrast, '.appShell');
            expect(contrast.failures, `${id} ${width}px text contrast`).toEqual([]);
          }
        }
      }
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, 120_000);

  it.each([1280, 390])('keyboard menus, compose focus trap and chart tooltip at %ipx', async width => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await localOnly(page);
    await page.addInitScript(demo => { if (!localStorage.getItem('budgetku_state')) localStorage.setItem('budgetku_state', JSON.stringify({ ...demo, page: 'dashboard' })); }, demo);
    try {
      await page.goto(URL, { waitUntil: 'networkidle' });
      const summary = page.locator(width <= 900 ? '.mobileNavMenu > summary' : '.navDetails > summary').first();
      await summary.focus();
      await page.keyboard.press('Enter');
      expect(await summary.evaluate(el => el.parentElement.open)).toBe(true);
      await page.keyboard.press('Escape');
      expect(await summary.evaluate(el => el.parentElement.open)).toBe(false);
      expect(await summary.evaluate(el => el === document.activeElement)).toBe(true);
      const compose = page.locator('.topbarActions [aria-label="Tambah Transaksi"]');
      await compose.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog.getByRole('button').last().focus();
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      expect(await compose.evaluate(el => el === document.activeElement)).toBe(true);
      await navigate(page, 'report');
      const point = page.locator('.trendChart .point').first();
      await point.focus();
      expect(await page.getByRole('status').innerText()).toMatch(/Masuk.*Keluar/);
      await page.keyboard.press('Escape');
      expect(await page.locator('.chartTooltip').count()).toBe(0);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Ekspor periode' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/^budgetx-transaksi-\d{4}-\d{2}\.csv$/);
    } finally { await context.close(); }
  }, 60_000);
});
