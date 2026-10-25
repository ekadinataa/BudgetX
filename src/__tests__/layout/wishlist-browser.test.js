import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, navigate } from './browser-support';
import { measureTextContrast } from './contrast-support';

const URL = globalThis.process?.env?.UAT_URL || 'http://127.0.0.1:5173';
let browser;
beforeAll(async () => { if (chromium) browser = await chromium.launch({ channel: 'chrome' }); }, 60_000);
afterAll(async () => { await browser?.close(); });

const initial = {
  page: 'wishlist', wallets: [{ id: 'w-test', name: 'Tidak Terhubung', type: 'bank', balance: 123456 }],
  transactions: [], categories: [], budgets: {}, wishlistGroups: [],
};
async function setup(width, darkMode, extra = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route(/https?:\/\/[^/]*(googleapis\.com|firebaseio\.com|firebaseapp\.com)/, route => route.abort());
  await page.route('**/src/config/firebase.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const auth=null; export const db=null;' }));
  await page.addInitScript(seed => {
    if (!localStorage.getItem('budgetku_state')) localStorage.setItem('budgetku_state', JSON.stringify(seed));
  }, { ...initial, ...extra, darkMode });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Wishlist', exact: true }).waitFor();
  return { page, errors };
}
const stateOf = page => page.evaluate(() => JSON.parse(localStorage.getItem('budgetku_state')));
async function createGroup(page, title = 'Setup Ruang Kerja') {
  await page.getByRole('button', { name: 'Buat Wishlist', exact: true }).click();
  await page.getByLabel('Judul wishlist', { exact: true }).fill(title);
  await page.getByLabel('Target dana (Rp)', { exact: true }).fill('4000000');
  await page.getByLabel('Tanggal target', { exact: true }).fill('2026-12-31');
  await page.getByRole('button', { name: /^Simpan(?: Item| Wishlist| Perubahan)?$/, exact: true }).click();
  await page.getByRole('button', { name: 'Tambah Item', exact: true }).waitFor();
}
async function createItem(page, name, price, priority = 'medium') {
  await page.getByRole('button', { name: 'Tambah Item', exact: true }).click();
  await page.getByLabel('Nama item', { exact: true }).fill(name);
  await page.getByLabel('Harga (Rp)', { exact: true }).fill(String(price));
  await page.getByLabel('Catatan (opsional)', { exact: true }).fill(`Catatan untuk ${name}\nCek ukuran`);
  await page.getByLabel('Urgensi / prioritas', { exact: true }).selectOption(priority);
  await page.getByRole('button', { name: /^Simpan(?: Item| Wishlist| Perubahan)?$/, exact: true }).click();
  await page.getByRole('button', { name: 'Tambah Item', exact: true }).waitFor();
}
async function assertLayout(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  const sizes = await page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"]');
    const footer = modal.querySelector('.wishlistTotals')?.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = getComputedStyle(modal).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    return {
      sheetAlpha: ctx.getImageData(0, 0, 1, 1).data[3],
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      modalOverflow: modal.scrollWidth > modal.clientWidth + 1,
      outside: modal.getBoundingClientRect().left < 0 || modal.getBoundingClientRect().right > innerWidth + 1,
      totalVisible: !footer || (footer.top >= 0 && footer.bottom <= innerHeight + 1),
    };
  });
  expect(sizes).toEqual({ sheetAlpha: 255, pageOverflow: false, modalOverflow: false, outside: false, totalVisible: true });
  const contrast = await page.evaluate(measureTextContrast, '.wishlistDialog');
  expect(contrast.failures, 'Wishlist popup text contrast').toEqual([]);
}

describe.skipIf(!chromium)('Wishlist PRD in Chrome, local only', () => {
  it.each([[1280, false], [2000, true], [390, false], [360, true]])('matches the compact reference layout and keyboard group navigation at %i dark=%s', async (width, darkMode) => {
    const stamp = '2026-10-01T00:00:00.000Z';
    const group = { id: 'reference-group', title: 'Ruang Kerja', targetBudget: 1000000, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp, items: [{ id: 'reference-item', groupId: 'reference-group', name: 'Monitor', price: 100000, marketplaceName: '', productUrl: '', priority: 'medium', createdAt: stamp, updatedAt: stamp }] };
    // Seed before React mounts; do not race its persistence effect with a reload.
    const { page, errors } = await setup(width, darkMode, { wishlistGroups: [group] });
    try {
      const overview = page.getByRole('region', { name: 'Ringkasan wishlist' });
      expect(await overview.getByText('Rp1.000.000', { exact: true }).count()).toBe(1);
      expect(await overview.getByText('Rp100.000', { exact: true }).count()).toBe(1);
      const columns = await page.evaluate(() => ({ stats: getComputedStyle(document.querySelector('.wishlistStats')).gridTemplateColumns.split(' ').length, groups: getComputedStyle(document.querySelector('.wishlistGrid')).gridTemplateColumns.split(' ').length }));
      expect(columns).toEqual({ stats: width <= 640 ? 1 : 3, groups: width <= 640 ? 1 : 3 });
      expect(await page.getByRole('button', { name: 'Hapus wishlist Ruang Kerja', exact: true }).count()).toBe(0);
      const card = page.getByRole('button', { name: 'Buka Ruang Kerja', exact: true });
      const widths = await page.evaluate(() => ({ card: document.querySelector('.wishlistCard').getBoundingClientRect().width, firstStat: document.querySelector('.wishlistStats .statCard').getBoundingClientRect().width, overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
      expect(Math.abs(widths.card - widths.firstStat)).toBeLessThan(2);
      expect(widths.overflow).toBe(false);
      const header = await page.evaluate(() => {
        const title = document.querySelector('.largeTitleBlock').getBoundingClientRect();
        const action = document.querySelector('.pageActions').getBoundingClientRect();
        const stats = document.querySelector('.wishlistStats').getBoundingClientRect();
        return { inline: action.left >= title.right && action.top < title.bottom, stacked: action.top >= title.bottom, statsBelow: stats.top > Math.max(title.bottom, action.bottom) };
      });
      expect(header.inline).toBe(width > 700);
      expect(header.stacked).toBe(width <= 700);
      expect(header.statsBelow).toBe(true);
      expect(await page.locator('.topbarActions [aria-label="Tambah Transaksi"]').count()).toBe(0);
      await card.focus(); await page.keyboard.press('Enter');
      await page.getByRole('dialog', { name: 'Ruang Kerja' }).waitFor();
      await assertLayout(page);
      expect(await page.getByRole('button', { name: 'Hapus wishlist Ruang Kerja' }).isVisible()).toBe(true);
      await page.getByRole('button', { name: 'Tutup', exact: true }).click();
      expect(await card.evaluate(button => button === document.activeElement)).toBe(true);
      expect((await stateOf(page)).wallets).toEqual(initial.wallets);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60_000);
  it.each([[1280, false], [2000, true], [390, false], [360, true]])('matches all popup references and preserves editable dates and financial isolation at %i dark=%s', async (width, darkMode) => {
    const stamp = '2026-10-01T00:00:00.000Z';
    const group = { id: 'reference-group', title: 'Ruang Kerja', targetBudget: 1000000, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp, items: [{ id: 'reference-item', groupId: 'reference-group', name: 'Komputer', price: 100000, marketplaceName: 'Tokopedia', productUrl: '', priority: 'medium', createdAt: stamp, updatedAt: stamp }] };
    const { page, errors } = await setup(width, darkMode, { wishlistGroups: [group] });
    try {
      await page.getByRole('button', { name: 'Buka Ruang Kerja', exact: true }).click();
      expect(await page.getByRole('meter').getAttribute('aria-valuenow')).toBe('10');
      expect(await page.getByRole('heading', { name: 'Daftar item · 1' }).isVisible()).toBe(true);
      expect(await page.locator('.wishlistItemActions').getByRole('button').count()).toBe(2);
      expect(await page.locator('.wishlistDialog header').getByRole('button').count()).toBe(1);
      await assertLayout(page);
      await page.locator('.wishlistTotals').getByRole('button', { name: 'Edit wishlist Ruang Kerja' }).click();
      expect(await page.getByLabel('Judul wishlist', { exact: true }).evaluate(input => input === document.activeElement)).toBe(true);
      expect(await page.getByLabel('Tanggal target', { exact: true }).isVisible()).toBe(false);
      expect(await page.locator('.wishlistTotals').count()).toBe(0);
      await page.getByRole('button', { name: 'Tutup', exact: true }).focus();
      await page.keyboard.press('Shift+Tab');
      expect(await page.getByRole('button', { name: 'Simpan Perubahan' }).evaluate(button => button === document.activeElement)).toBe(true);
      await page.getByLabel('Judul wishlist', { exact: true }).fill('Ruang Kerja Baru');
      await page.getByLabel('Target dana (Rp)', { exact: true }).fill('1200000');
      await assertLayout(page);
      await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
      await page.getByRole('dialog', { name: 'Ruang Kerja Baru', exact: true }).waitFor();
      expect((await stateOf(page)).wishlistGroups[0].targetDate).toBe('2026-12-31');
      await page.getByRole('button', { name: 'Edit wishlist Ruang Kerja Baru' }).click();
      await page.locator('.wishlistSchedule > summary').click();
      expect(await page.getByLabel('Tanggal target', { exact: true }).inputValue()).toBe('2026-12-31');
      await page.getByLabel('Tanggal target', { exact: true }).fill('2027-01-31');
      await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
      await page.getByRole('dialog', { name: 'Ruang Kerja Baru', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Edit item Komputer' }).click();
      expect(await page.getByText('Wishlist: Ruang Kerja Baru', { exact: true }).isVisible()).toBe(true);
      expect(await page.getByLabel('Nama item', { exact: true }).evaluate(input => input === document.activeElement)).toBe(true);
      const columns = await page.locator('.wishlistFieldPair').evaluate(pair => getComputedStyle(pair).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(width <= 640 ? 1 : 2);
      expect(await page.getByLabel('Marketplace / toko', { exact: true }).count()).toBe(0);
      expect(await page.getByLabel('Tautan produk (opsional)', { exact: true }).count()).toBe(0);
      await page.getByLabel('Catatan (opsional)', { exact: true }).fill('Ukuran 24 inci\nWarna hitam');
      await page.getByLabel('Harga (Rp)', { exact: true }).fill('200000');
      await page.getByLabel('Urgensi / prioritas', { exact: true }).selectOption('low');
      await assertLayout(page);
      await page.getByRole('button', { name: 'Simpan Item' }).click();
      await page.getByRole('dialog', { name: 'Ruang Kerja Baru', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Tutup', exact: true }).click();
      await page.reload({ waitUntil: 'networkidle' });
      const state = await stateOf(page);
      expect(state.wishlistGroups[0]).toMatchObject({ id: group.id, title: 'Ruang Kerja Baru', targetBudget: 1200000, targetDate: '2027-01-31', items: [{ id: group.items[0].id, groupId: group.id, name: 'Komputer', price: 200000, priority: 'low', notes: 'Ukuran 24 inci\nWarna hitam', marketplaceName: 'Tokopedia', productUrl: '' }] });
      expect(state.wallets).toEqual(initial.wallets);
      expect(state.transactions).toEqual(initial.transactions);
      expect(state.budgets).toEqual(initial.budgets);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60_000);
  it.each([[1280, false], [360, true]])('keeps long-list totals visible and traps keyboard/dirty dismissal at %i dark=%s', async (width, darkMode) => {
    const stamp = '2026-10-01T00:00:00.000Z';
    const group = {
      id: 'long-group', title: 'Kelompok dengan judul panjang '.repeat(20), targetBudget: 999999999, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp,
      items: Array.from({ length: 40 }, (_, i) => ({ id: `long-item-${i}`, groupId: 'long-group', name: `Produk ${i} ` + 'Nama panjang '.repeat(30), notes: 'a'.repeat(1000), price: 1234567, marketplaceName: 'Marketplace '.repeat(40), productUrl: 'https://example.com/' + 'x'.repeat(800), priority: 'high', createdAt: stamp, updatedAt: stamp })),
    };
    const { page, errors } = await setup(width, darkMode, { wishlistGroups: [group] });
    try {
      await page.getByRole('button', { name: `Buka ${group.title}`, exact: true }).click();
      await assertLayout(page);
      expect(await page.locator('.wishlistBody').evaluate(body => body.scrollHeight > body.clientHeight)).toBe(true);
      await page.getByRole('button', { name: 'Tambah Item', exact: true }).click();
      await page.getByLabel('Nama item', { exact: true }).fill('Draf belum disimpan');
      await page.getByRole('button', { name: /^Simpan(?: Item| Wishlist| Perubahan)?$/, exact: true }).focus();
      await page.keyboard.press('Tab');
      expect(await page.getByRole('button', { name: 'Tutup', exact: true }).evaluate(button => button === document.activeElement)).toBe(true);
      await page.keyboard.press('Escape');
      expect(await page.getByRole('dialog').count()).toBe(1);
      await page.getByRole('button', { name: 'Lanjutkan Mengedit', exact: true }).click();
      expect(await page.getByLabel('Nama item', { exact: true }).inputValue()).toBe('Draf belum disimpan');
      await page.getByRole('button', { name: 'Tutup', exact: true }).click();
      await page.getByRole('button', { name: 'Buang Perubahan', exact: true }).click();
      expect(await page.getByRole('dialog').count()).toBe(0);
      expect((await stateOf(page)).wishlistGroups[0].items).toHaveLength(40);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60_000);
  it.each([[1280, false], [360, true]])('persists multiline plain-text notes and clears them without financial effects at %i dark=%s', async (width, darkMode) => {
    const { page, errors } = await setup(width, darkMode);
    try {
      await createGroup(page);
      await createItem(page, 'Komputer', 100000);
      const note = 'a'.repeat(900) + '\n<img src=x onerror="throw 1"><a href="https://example.com">Teks</a>';
      await page.getByRole('button', { name: 'Edit item Komputer' }).click();
      expect(await page.getByLabel('Catatan (opsional)').inputValue()).toBe('Catatan untuk Komputer\nCek ukuran');
      await page.getByLabel('Catatan (opsional)').fill(note);
      await page.getByRole('button', { name: 'Simpan Item' }).click();
      await page.getByRole('button', { name: 'Tambah Item', exact: true }).waitFor();
      expect(await page.locator('.wishlistItemNote').textContent()).toBe(note);
      expect(await page.locator('.wishlistItemNote img,.wishlistItemNote a').count()).toBe(0);
      await assertLayout(page);
      await page.getByRole('button', { name: 'Tutup', exact: true }).click();
      await page.reload({ waitUntil: 'networkidle' });
      const saved = await stateOf(page);
      expect(saved.wishlistGroups[0].items[0].notes).toBe(note);
      expect(saved.wishlistGroups[0].items[0]).not.toHaveProperty('marketplaceName');
      expect(saved.wishlistGroups[0].items[0]).not.toHaveProperty('productUrl');
      await page.getByRole('button', { name: 'Buka Setup Ruang Kerja' }).click();
      await page.getByRole('button', { name: 'Edit item Komputer' }).click();
      expect(await page.getByLabel('Catatan (opsional)').inputValue()).toBe(note);
      await page.getByLabel('Catatan (opsional)').fill('');
      await page.getByRole('button', { name: 'Simpan Item' }).click();
      await page.getByRole('button', { name: 'Tambah Item', exact: true }).waitFor();
      expect(await page.locator('.wishlistItemNote').count()).toBe(0);
      const final = await stateOf(page);
      expect(final.wishlistGroups[0].items[0].notes).toBe('');
      expect(final.wallets).toEqual(initial.wallets);
      expect(final.transactions).toEqual(initial.transactions);
      expect(final.budgets).toEqual(initial.budgets);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60_000);
  it.each([[1280, false], [2000, true], [390, false], [360, true]])('creates grouped plans and items without financial effects at %i dark=%s', async (width, darkMode) => {
    const { page, errors } = await setup(width, darkMode);
    try {
      await createGroup(page);
      await createItem(page, 'Monitor', 2_000_000, 'high');
      await createItem(page, 'Kursi kerja', 1_200_000, 'high');
      await createItem(page, 'Lampu meja', 300_000, 'low');
      const dialog = page.getByRole('dialog');
      expect(await dialog.getByText(/3\.500\.000/).count()).toBeGreaterThan(0);
      expect(await dialog.getByText(/500\.000/).count()).toBeGreaterThan(0);
      expect(await dialog.getByRole('link').count()).toBe(0);
      expect(await dialog.getByText('Catatan untuk Monitor', { exact: false }).isVisible()).toBe(true);
      await assertLayout(page);
      const saved = await stateOf(page);
      expect(saved.wishlistGroups).toHaveLength(1);
      expect(saved.wishlistGroups[0].items).toHaveLength(3);
      expect(saved.wallets).toEqual(initial.wallets);
      expect(saved.transactions).toEqual([]);
      expect(saved.budgets).toEqual({});
      await page.getByRole('button', { name: 'Edit item Lampu meja', exact: true }).click();
      await page.getByLabel('Harga (Rp)', { exact: true }).fill('1300000');
      await page.getByRole('button', { name: /^Simpan(?: Item| Wishlist| Perubahan)?$/, exact: true }).click();
      await dialog.getByText('Melebihi Anggaran', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Hapus item Lampu meja', exact: true }).click();
      await page.getByRole('button', { name: 'Hapus', exact: true }).click();
      await page.getByRole('button', { name: 'Tambah Item', exact: true }).waitFor();
      expect(await dialog.getByText(/3\.200\.000/).count()).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Tutup', exact: true }).click();
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByText('Setup Ruang Kerja', { exact: true }).first().click();
      await page.getByRole('dialog').waitFor();
      expect((await stateOf(page)).wishlistGroups[0].items).toHaveLength(2);
      await page.getByRole('button', { name: 'Tutup', exact: true }).click();
      await navigate(page, 'settings');
      await page.getByRole('heading', { name: 'Pengaturan', exact: true }).waitFor();
      await navigate(page, 'wishlist');
      await page.getByRole('heading', { name: 'Wishlist', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Buka Setup Ruang Kerja', exact: true }).click();
      await page.getByRole('button', { name: 'Hapus wishlist Setup Ruang Kerja', exact: true }).click();
      await page.getByRole('button', { name: 'Hapus', exact: true }).click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('budgetku_state')).wishlistGroups.length === 0);
      const finalState = await stateOf(page);
      expect(finalState.wallets).toEqual(initial.wallets);
      expect(finalState.transactions).toEqual([]);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60_000);
});
