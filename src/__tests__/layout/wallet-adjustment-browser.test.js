import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from './browser-support';

const URL = globalThis.process?.env?.UAT_URL || 'http://localhost:5173';
let browser;
beforeAll(async () => { if (chromium) browser = await chromium.launch({ channel: 'chrome' }); }, 60_000);
afterAll(async () => { await browser?.close(); });

describe.skipIf(!chromium)('wallet balance adjustments in a real browser (local only)', () => {
  it.each([[1280, false], [1280, true], [390, false], [390, true]])('confirms signed changes and persists audit at width %i dark=%s', async (width, darkMode) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/https?:\/\/[^/]*(googleapis\.com|firebaseio\.com|firebaseapp\.com)/, route => route.abort());
    await page.route('**/src/config/firebase.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const auth=null; export const db=null;' }));
    await page.addInitScript(({ darkMode }) => { if (!localStorage.getItem('budgetku_state')) localStorage.setItem('budgetku_state', JSON.stringify({
      page: 'wallet', darkMode, wallets: [{ id: 'w1', name: 'BCA Uji', type: 'bank', balance: 100, color: '#2563EB', note: 'Catatan dompet' }], transactions: [], categories: [], budgets: {},
    })); }, { darkMode });
    try {
      await page.goto(URL, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Edit BCA Uji' }).click();
      await page.getByRole('spinbutton', { name: 'Saldo', exact: true }).fill('150');
      await page.getByRole('button', { name: 'Simpan', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Konfirmasi Penyesuaian Saldo' });
      await dialog.waitFor();
      await page.getByRole('button', { name: 'Konfirmasi Penyesuaian', exact: true }).click();
      await page.getByRole('alert').waitFor();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('budgetku_state')).transactions.length)).toBe(0);
      await page.getByRole('textbox', { name: 'Alasan perubahan' }).fill('Cocokkan rekening');
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth > innerWidth + 1,
        modal: document.querySelector('.modal').scrollWidth > document.querySelector('.modal').clientWidth + 1,
      }));
      expect(overflow).toEqual({ page: false, modal: false });
      await page.getByRole('button', { name: 'Konfirmasi Penyesuaian', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Edit BCA Uji' }).click();
      await page.getByRole('spinbutton', { name: 'Saldo', exact: true }).fill('80');
      await page.getByRole('button', { name: 'Simpan', exact: true }).click();
      await page.getByRole('textbox', { name: 'Alasan perubahan' }).fill('Koreksi uang tunai');
      await page.getByRole('button', { name: 'Konfirmasi Penyesuaian', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      const state = await page.evaluate(() => JSON.parse(localStorage.getItem('budgetku_state')));
      expect(state.wallets[0]).toMatchObject({ balance: 80, note: 'Catatan dompet' });
      expect(state.transactions).toHaveLength(2);
      expect(state.transactions.map(tx => tx.amount)).toEqual([-70, 50]);
      expect(state.transactions[0]).toMatchObject({ type: 'adjustment', note: 'Koreksi uang tunai', balanceBefore: 150, balanceAfter: 80 });
      await page.reload({ waitUntil: 'networkidle' });
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('budgetku_state')).transactions.length)).toBe(2);
      await page.locator(width < 768 ? '.tabbar [data-page="tx"]' : '.navItem[data-page="tx"]').first().click();
      await page.getByRole('heading', { name: 'Transaksi', exact: true }).waitFor();
      expect(await page.getByText('Penyesuaian Saldo', { exact: true }).count()).toBeGreaterThanOrEqual(2);
      expect(await page.getByRole('button', { name: 'Edit transaksi' }).count()).toBe(0);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60_000);
});
