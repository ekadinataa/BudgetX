import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, localOnly } from './browser-support';
import { measureTextContrast } from './contrast-support';
import { compactWalletState } from './compact-wallet-fixture';

const URL = globalThis.process?.env?.UAT_URL || 'http://127.0.0.1:5175';
let browser;
beforeAll(async () => { if (chromium) browser = await chromium.launch({ channel: 'chrome' }); }, 60_000);
afterAll(async () => { await browser?.close(); });

async function setup(width, darkMode, state = compactWalletState()) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await localOnly(page);
  await page.addInitScript(seed => { if (!localStorage.getItem('budgetku_state')) localStorage.setItem('budgetku_state', JSON.stringify(seed)); }, { ...state, darkMode });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Dompet', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}

const gridGeometry = () => [...document.querySelectorAll('.walletAccountGrid .walletCard')].map(el => {
  const box = el.getBoundingClientRect();
  return { top: Math.round(box.top + scrollY), height: Math.round(box.height), width: Math.round(box.width) };
});
const savedMoney = page => page.evaluate(() => {
  const { wallets, transactions, budgets } = JSON.parse(localStorage.getItem('budgetku_state'));
  return { wallets, transactions, budgets };
});

describe.skipIf(!chromium)('compact reference wallet cards in Chrome, local only', () => {
  it.each([false, true])('keeps mixed cards aligned and adaptive across 10 widths, dark=%s', async darkMode => {
    const { page, errors } = await setup(1280, darkMode);
    try {
      for (const width of [360, 390, 560, 640, 768, 820, 1024, 1280, 1440, 2000]) {
        await page.setViewportSize({ width, height: 900 });
        // CDP returns before every resize/media-query layout has painted.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const layout = await page.evaluate(() => {
          const grid = document.querySelector('.walletAccountGrid');
          const cards = [...grid.querySelectorAll('.walletCard')];
          const first = cards[0];
          const icon = first.querySelector('.walletIcon').getBoundingClientRect();
          const identity = first.querySelector('.walletCardIdentity').getBoundingClientRect();
          const balance = first.querySelector('.walletBalance').getBoundingClientRect();
          const footer = first.querySelector('footer').getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            clippedCards: cards.filter(card => card.scrollWidth > card.clientWidth + 1).length,
            columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
            heights: cards.map(card => card.getBoundingClientRect().height),
            hierarchy: icon.bottom < identity.top && identity.bottom < balance.top && balance.bottom < footer.top,
            inlineFlows: cards.every(card => [...card.querySelectorAll('footer > span')].every(flow => Math.abs(flow.querySelector('.walletCardFooterLabel').getBoundingClientRect().top - flow.querySelector('strong').getBoundingClientRect().top) < 3)),
          };
        });
        expect(layout.overflow, `${width}px page`).toBe(false);
        expect(layout.clippedCards, `${width}px cards`).toBe(0);
        expect(Math.max(...layout.heights) - Math.min(...layout.heights), `${width}px mixed card heights`).toBeLessThan(1);
        expect(Math.max(...layout.heights), `${width}px compact height`).toBeLessThanOrEqual(260);
        expect(layout.hierarchy, `${width}px reference hierarchy`).toBe(true);
        expect(layout.inlineFlows, `${width}px inline monthly flow`).toBe(true);
        if (width === 390) expect(layout.columns).toBe(1);
        if (width === 1280) expect(layout.columns).toBe(3);
        if (width === 2000) expect(layout.columns).toBeGreaterThan(3);
        if (width === 1280 || width === 390) {
          const contrast = await page.evaluate(measureTextContrast, '.walletAccountGrid');
          expect(contrast.failures).toEqual([]);
        }
      }
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60_000);

  it.each([[1280, false], [1280, true], [390, false], [390, true]])('opens credit details without moving cards or changing money at %ipx dark=%s', async (width, darkMode) => {
    const { page, errors } = await setup(width, darkMode);
    try {
      const before = await savedMoney(page);
      const geometry = await page.evaluate(gridGeometry);
      const trigger = page.getByRole('button', { name: 'Rincian kredit Kredivo', exact: true });
      if (width <= 900) expect(await trigger.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Rincian kredit — Kredivo', exact: true });
      await dialog.waitFor();
      await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
      for (const [label, amount] of [['Plafon', '4.000.000'], ['Outstanding', '750.000'], ['Limit tersedia', '3.000.000'], ['Hold', '250.000']]) {
        expect(await dialog.locator('.walletCreditMetrics > div').filter({ hasText: label }).innerText()).toContain(amount);
      }
      const box = await dialog.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(901);
      expect(await page.evaluate(gridGeometry)).toEqual(geometry);
      const contrast = await page.evaluate(measureTextContrast, '.walletCreditDialog');
      expect(contrast.failures).toEqual([]);
      await dialog.getByRole('button', { name: 'Tutup', exact: true }).focus();
      await page.keyboard.press('Shift+Tab');
      expect(await dialog.getByRole('button', { name: 'Selesai', exact: true }).evaluate(el => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      expect(await trigger.evaluate(el => el === document.activeElement)).toBe(true);
      expect(await savedMoney(page)).toEqual(before);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60_000);

  it.each([1280, 360])('keeps long names, notes and safe-integer balances inside cards at %ipx', async width => {
    const state = compactWalletState();
    state.wallets[0] = { ...state.wallets[0], name: 'NamaDompet'.repeat(100), note: 'Catatan panjang '.repeat(50), balance: -Number.MAX_SAFE_INTEGER };
    const { page, errors } = await setup(width, true, state);
    try {
      const check = await page.locator('.walletCard').first().evaluate(card => ({
        overflow: card.scrollWidth > card.clientWidth + 1,
        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        name: card.querySelector('h2').getAttribute('title'),
        note: card.querySelector('.walletType').getAttribute('title'),
      }));
      expect(check).toEqual({ overflow: false, pageOverflow: false, name: state.wallets[0].name, note: state.wallets[0].note });
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60_000);
});
