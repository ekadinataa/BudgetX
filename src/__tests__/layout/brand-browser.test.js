import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, localOnly, navigate } from './browser-support';

const URL = globalThis.process?.env?.UAT_URL || 'http://127.0.0.1:5175';
let browser;
beforeAll(async () => { if (chromium) browser = await chromium.launch({ channel: 'chrome' }); }, 60_000);
afterAll(async () => { await browser?.close(); });

async function checkLogo(page, selector, darkMode) {
  const state = await page.locator(selector).evaluate(logo => {
    const images = [...logo.querySelectorAll('img')];
    const visible = images.filter(image => getComputedStyle(image).display !== 'none');
    const rect = logo.getBoundingClientRect();
    return {
      visible: visible.map(image => image.className),
      loaded: visible.every(image => image.complete && image.naturalWidth === 124 && image.naturalHeight === 30),
      ratio: rect.width / rect.height,
      fits: rect.left >= 0 && rect.right <= innerWidth && rect.height >= 29,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  expect(state.visible).toEqual([darkMode ? 'brandLogoDark' : 'brandLogoLight']);
  expect(state.loaded).toBe(true);
  expect(state.ratio).toBeCloseTo(124 / 30, 1);
  expect(state.fits).toBe(true);
  expect(state.overflow).toBe(false);
}

describe.skipIf(!chromium)('supplied brand artwork in Chrome, local only', () => {
  it.each([false, true])('has real asset alpha and no CSS background on the header wordmark, dark=%s', async darkMode => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await localOnly(page);
    try {
      await page.goto(URL, { waitUntil: 'networkidle' });
      await page.evaluate(dark => document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'), darkMode);
      const result = await page.locator('.brandTop').evaluate(async button => {
        const logo = button.querySelector('.brandLogo');
        const image = [...logo.querySelectorAll('img')].find(el => getComputedStyle(el).display !== 'none');
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let transparent = 0;
        let opaque = 0;
        for (let index = 3; index < rgba.length; index += 4) {
          if (rgba[index] === 0) transparent++;
          if (rgba[index] === 255) opaque++;
        }
        const clearPixel = ctx.getImageData(0, canvas.height - 1, 1, 1).data[3];
        const composites = ['#d8b4fe', '#164e63'].map(background => {
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const before = [...ctx.getImageData(0, canvas.height - 1, 1, 1).data];
          ctx.drawImage(image, 0, 0);
          return { before, after: [...ctx.getImageData(0, canvas.height - 1, 1, 1).data] };
        });
        return { transparent, opaque, clearPixel, composites,
          backgrounds: [button, logo, image].map(el => ({ color: getComputedStyle(el).backgroundColor, image: getComputedStyle(el).backgroundImage })) };
      });
      expect(result.transparent).toBeGreaterThan(2000);
      expect(result.opaque).toBeGreaterThan(1000);
      expect(result.clearPixel).toBe(0);
      for (const sample of result.composites) expect(sample.after).toEqual(sample.before);
      for (const background of result.backgrounds) expect(background).toEqual({ color: 'rgba(0, 0, 0, 0)', image: 'none' });
    } finally { await page.close(); }
  }, 60_000);
  it.each([360, 390, 900, 1024, 1440, 2000])('keeps the brand and theme switching intact at %ipx', async width => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await localOnly(page);
    try {
      await page.goto(URL, { waitUntil: 'networkidle' });
      await checkLogo(page, '.brandTop .brandLogo', false);
      // Exercise the real theme control rather than directly changing CSS.
      if (width <= 900) await page.locator('.mobileNavMenu > summary').click();
      await page.getByRole('button', { name: 'Mode gelap', exact: true }).click();
      if (width <= 900) await page.keyboard.press('Escape');
      await checkLogo(page, '.brandTop .brandLogo', true);
      await navigate(page, 'wallet');
      await page.getByRole('button', { name: 'BudgetX — beranda' }).click();
      expect(await page.locator('.topnav [data-page="dashboard"]').getAttribute('aria-current')).toBe('page');
      for (const kind of ['login', 'register', 'forgot']) {
        // String form avoids Vitest rewriting the browser-only import to SSR.
        await page.evaluate(`import('/src/__tests__/layout/modal-fixtures.jsx').then(m => m.mountModalFixture(${JSON.stringify(kind)}))`);
        await page.locator('#visual-modal-fixture .brandLogo').waitFor();
        for (const darkMode of [false, true]) {
          await page.evaluate(dark => document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'), darkMode);
          await checkLogo(page, '#visual-modal-fixture .brandLogo', darkMode);
        }
      }
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60_000);
});
