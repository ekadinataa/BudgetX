import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, localOnly } from './browser-support';
import { measureTextContrast } from './contrast-support';
import { financialReviewFixture, financialReviewAppState } from './financial-review-fixture';

const URL = globalThis.process?.env?.UAT_URL || 'http://127.0.0.1:5175';
let browser;
beforeAll(async () => { if (chromium) browser = await chromium.launch({ channel: 'chrome' }); }, 60000);
afterAll(async () => { await browser?.close(); });
async function setup(width, darkMode, review = financialReviewFixture()) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await localOnly(page);
  await page.addInitScript(({ state, review }) => {
    if (!localStorage.getItem('budgetku_state')) localStorage.setItem('budgetku_state', JSON.stringify(state));
    if (!localStorage.getItem('budgetku_financial_reviews')) localStorage.setItem('budgetku_financial_reviews', JSON.stringify({ reviews: [review], decisions: {} }));
  }, { state: financialReviewAppState(darkMode), review });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Perlu Konfirmasi', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}
const money = page => page.evaluate(() => {
  const { wallets, transactions, budgets } = JSON.parse(localStorage.getItem('budgetku_state'));
  return { wallets, transactions, budgets };
});
async function layout(page, selector) {
  const geometry = await page.locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: innerWidth, overflow: el.scrollWidth > el.clientWidth + 1, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.overflow).toBe(false); expect(geometry.pageOverflow).toBe(false);
  const contrast = await page.evaluate(measureTextContrast, selector);
  expect(contrast.failures).toEqual([]);
}

describe.skipIf(!chromium)('transaction confirmations in real Chrome, local-only', () => {
  it.each([[360, false], [360, true], [768, false], [768, true], [1440, false], [1440, true]])('confirms exactly one review decision without changing money at %ipx dark=%s', async (width, darkMode) => {
    const { page, errors } = await setup(width, darkMode);
    try {
      const before = await money(page);
      await layout(page, '.txReview');
      await page.getByRole('button', { name: 'Tinjau', exact: true }).click();
      const dialog = page.getByRole('dialog');
      expect(await dialog.getByRole('combobox').inputValue()).toBe('');
      expect(await dialog.getByRole('button', { name: 'Lanjutkan' }).isDisabled()).toBe(true);
      await dialog.getByRole('combobox').selectOption('0');
      await dialog.getByRole('button', { name: 'Lanjutkan' }).click();
      await page.getByRole('dialog', { name: 'Konfirmasi pencatatan' }).waitFor();
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) {
          if (animation.effect?.getComputedTiming().iterations !== Infinity) { try { animation.finish(); } catch { animation.cancel(); } }
        }
      });
      await layout(page, '.txReview .modal');
      await dialog.getByRole('button', { name: 'Tutup', exact: true }).focus();
      await page.keyboard.press('Shift+Tab');
      expect(await dialog.getByRole('button', { name: 'Konfirmasi & Catat' }).evaluate(el => el === document.activeElement)).toBe(true);
      if (globalThis.process?.env?.BUDGETX_QA_ARTIFACT_DIR) await page.screenshot({ path: `${globalThis.process.env.BUDGETX_QA_ARTIFACT_DIR}/confirmation-${width}-${darkMode ? 'dark' : 'light'}.png`, fullPage: true });
      await dialog.getByRole('button', { name: 'Konfirmasi & Catat' }).click();
      await dialog.waitFor({ state: 'hidden' });
      expect(await page.getByText('Menunggu pencatatan', { exact: true }).count()).toBe(1);
      expect(await page.getByText('Tercatat', { exact: true }).count()).toBe(0);
      expect(await money(page)).toEqual(before);
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByText('Menunggu pencatatan', { exact: true }).waitFor();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('budgetku_financial_reviews')));
      expect(Object.values(saved.decisions)).toEqual([{ reviewId: 'a'.repeat(64), version: 'b'.repeat(16), action: 'expense', source: 'BANK', destination: 'EXTERNAL' }]);
      expect(await money(page)).toEqual(before);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60000);

  it('rejects an unsafe receipt explicitly and persists history without a transaction', async () => {
    const { page, errors } = await setup(390, false, financialReviewFixture({ amount: null, fee: null, choices: [] }));
    try {
      const before = await money(page);
      await page.getByRole('button', { name: 'Tinjau', exact: true }).click();
      expect(await page.getByRole('combobox', { name: 'Pencatatan transaksi' }).count()).toBe(0);
      expect(await page.getByRole('button', { name: 'Konfirmasi & Catat' }).count()).toBe(0);
      await page.getByRole('button', { name: 'Tolak transaksi', exact: true }).click();
      await page.getByRole('button', { name: 'Ya, Tolak', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: /Riwayat/ }).click();
      await page.getByText('Ditolak', { exact: true }).waitFor();
      expect(await money(page)).toEqual(before); expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60000);
});
