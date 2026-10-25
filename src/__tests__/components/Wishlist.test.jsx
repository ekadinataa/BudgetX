import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Topbar from '../../components/Topbar/Topbar.jsx';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const group = (overrides = {}) => ({ id: 'g1', title: 'Setup Ruang Kerja', targetBudget: 4000000, targetDate: '2026-12-31', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', items: [], ...overrides });
const item = (overrides = {}) => ({ id: 'i1', groupId: 'g1', name: 'Monitor', price: 2000000, marketplaceName: '', productUrl: '', priority: 'high', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', ...overrides });
async function mount(props = {}) {
  const path = '../../pages/Wishlist/WishlistPage.jsx';
  const { default: WishlistPage } = await import(/* @vite-ignore */ path);
  const tree = (p) => <><Topbar page="wishlist" onAddTx={vi.fn()} /><WishlistPage {...p} /></>;
  const result = render(tree(props));
  return { ...result, update: (p) => result.rerender(tree(p)) };
}
const click = (name) => fireEvent.click(screen.getByRole('button', { name, exact: true }));
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const open = () => click('Buka Setup Ruang Kerja');

describe('Wishlist', () => {
  it('offers group editing in the sticky dialog footer and an explicit empty item state', async () => {
    await mount({ wishlistGroups: [group()] }); open();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog.querySelector('footer')).getByRole('button', { name: 'Edit wishlist Setup Ruang Kerja' })).toBeInTheDocument();
    expect(within(dialog).getByText('Belum ada item. Tambahkan rencana pembelian pertamamu.')).toBeInTheDocument();
  });
  it.each([['Judul wishlist', ' '], ['Judul wishlist', 'x'.repeat(1001)], ['Target dana (Rp)', '0'], ['Target dana (Rp)', '1.5'], ['Target dana (Rp)', '9007199254740992'], ['Tanggal target', '']])('rejects invalid group %s before any callback', async (label, value) => {
    const onCreateGroup = vi.fn(); await mount({ onCreateGroup }); click('Buat Wishlist');
    fill('Judul wishlist', 'Valid'); fill('Target dana (Rp)', '1'); fill('Tanggal target', '2026-12-31'); fill(label, value); click(/^Simpan(?: Item| Wishlist| Perubahan)?$/);
    expect(screen.getByRole('alert')).toBeInTheDocument(); expect(onCreateGroup).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Simpan(?: Item| Wishlist| Perubahan)?$/ })).not.toBeDisabled();
  });
  it.each([['Nama item', ' '], ['Nama item', 'x'.repeat(1001)], ['Harga (Rp)', '0'], ['Harga (Rp)', '1.5'], ['Harga (Rp)', '9007199254740992'], ['Catatan (opsional)', 'x'.repeat(1001)]])('rejects invalid item %s before any callback', async (label, value) => {
    const onCreateItem = vi.fn(); await mount({ wishlistGroups: [group()], onCreateItem }); open(); click('Tambah Item');
    fill('Nama item', 'Valid'); fill('Harga (Rp)', '1'); fill(label, value); click(/^Simpan(?: Item| Wishlist| Perubahan)?$/);
    expect(screen.getByRole('alert')).toBeInTheDocument(); expect(onCreateItem).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').querySelector('.wishlistTotals')).not.toBeInTheDocument();
  });
  it('rejects cumulative safe integer overflow without changing persisted totals', async () => {
    const onCreateItem = vi.fn();
    await mount({ wishlistGroups: [group({ targetBudget: Number.MAX_SAFE_INTEGER, items: [item({ price: Number.MAX_SAFE_INTEGER })] })], onCreateItem }); open(); click('Tambah Item');
    fill('Nama item', 'Overflow'); fill('Harga (Rp)', '1'); click(/^Simpan(?: Item| Wishlist| Perubahan)?$/);
    expect(screen.getByRole('alert')).toHaveTextContent(/safe integer/); expect(onCreateItem).not.toHaveBeenCalled();
  });
  it('blocks every close and repeat submit while a save is pending and preserves failed group input', async () => {
    let reject;
    const onCreateGroup = vi.fn(() => new Promise((resolve, r) => { reject = r; })); await mount({ onCreateGroup }); click('Buat Wishlist');
    fill('Judul wishlist', 'Draft'); fill('Target dana (Rp)', '1'); fill('Tanggal target', '2026-12-31'); click(/^Simpan(?: Item| Wishlist| Perubahan)?$/);
    expect(screen.getByLabelText('Judul wishlist')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Memproses wishlist…');
    for (const name of [/^Simpan(?: Item| Wishlist| Perubahan)?$/, 'Batal', 'Tutup']) { expect(screen.getByRole('button', { name, exact: true })).toBeDisabled(); click(name); }
    fireEvent.submit(screen.getByLabelText('Judul wishlist').closest('form'));
    fireEvent.keyDown(document, { key: 'Escape' }); fireEvent.click(document.querySelector('.wishlistOverlay'));
    expect(screen.getByRole('dialog', { name: 'Buat Wishlist' })).toHaveAttribute('aria-busy', 'true'); expect(onCreateGroup).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error('Gagal menyimpan kelompok')));
    expect(screen.getByRole('alert')).toHaveTextContent('Gagal menyimpan kelompok'); expect(screen.getByLabelText('Judul wishlist')).toHaveValue('Draft');
    expect(screen.getByRole('button', { name: /^Simpan(?: Item| Wishlist| Perubahan)?$/ })).not.toBeDisabled();
  });
  it('makes background navigation inert and restores focus to create if the deleted trigger disappeared', async () => {
    let resolve;
    const props = { wishlistGroups: [group()], onDeleteGroup: vi.fn(() => new Promise(r => { resolve = r; })) };
    const view = await mount(props);
    const trigger = screen.getByRole('button', { name: 'Buka Setup Ruang Kerja' }); trigger.focus(); fireEvent.click(trigger); click('Hapus wishlist Setup Ruang Kerja');
    expect(view.container).toHaveAttribute('inert');
    expect(view.container).toHaveAttribute('aria-hidden', 'true');
    click('Hapus'); view.update({ ...props, wishlistGroups: [] }); await act(async () => resolve());
    expect(view.container).not.toHaveAttribute('inert');
    expect(view.container).not.toHaveAttribute('aria-hidden');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Buat Wishlist' }));
  });
  it('stops offering stale group/item editor actions after its authoritative group disappears', async () => {
    const props = { wishlistGroups: [group()], onCreateItem: vi.fn() };
    const view = await mount(props); open(); click('Tambah Item'); fill('Nama item', 'Draf');
    view.update({ ...props, wishlistGroups: [] });
    expect(screen.getByRole('status')).toHaveTextContent('Wishlist tidak tersedia');
    expect(screen.queryByRole('button', { name: /^Simpan(?: Item| Wishlist| Perubahan)?$/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nama item')).not.toBeInTheDocument();
    expect(props.onCreateItem).not.toHaveBeenCalled();
    click('Tutup'); click('Buang Perubahan'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('never collides temporary validation ids with an existing stored item', async () => {
    const onCreateItem = vi.fn().mockResolvedValue(item());
    await mount({ wishlistGroups: [group({ items: [item({ id: 'draft' })] })], onCreateItem }); open(); click('Tambah Item');
    fill('Nama item', 'Baru'); fill('Harga (Rp)', '1'); click(/^Simpan(?: Item| Wishlist| Perubahan)?$/);
    await screen.findByRole('button', { name: 'Tambah Item' });
    expect(onCreateItem).toHaveBeenCalledWith('g1', expect.objectContaining({ name: 'Baru', price: 1 }));
  });
  it('defines scoped responsive styles with a nonshrinking visible total footer and wrapping long text', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf8');
    expect(css).toMatch(/\.wishlistDialog > \.wishlistTotals\s*\{[^}]*flex-shrink:\s*0/);
    expect(css).toMatch(/\.wishlistFields\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.wishlistOpen\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\.wishlistGrid\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  });
  it('updates local target status across midnight and when a suspended tab becomes visible', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 12, 23, 59, 59));
    await mount({ wishlistGroups: [group({ targetDate: '2026-10-12' }), group({ id: 'g2', title: 'Besok', targetDate: '2026-10-13' })] });
    open();
    expect(screen.getByText('Target Hari Ini')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(1001));
    expect(screen.getByText('Lewat Target')).toBeInTheDocument();
    click('Tutup'); click('Buka Besok');
    expect(screen.getByText('Target Hari Ini')).toBeInTheDocument();
    vi.setSystemTime(new Date(2026, 9, 14, 12)); fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByText('Lewat Target')).toBeInTheDocument();
    click('Tutup'); open(); expect(screen.getByText('Lewat Target')).toBeInTheDocument();
  });
  it('shows explicit loading and failure states with retry rather than a false empty state', async () => {
    const onRetry = vi.fn(); const view = await mount({ loading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Memuat wishlist');
    expect(screen.queryByText(/Belum ada wishlist/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buat Wishlist' })).toBeDisabled();
    view.update({ error: 'Tidak dapat memuat wishlist', onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent('Tidak dapat memuat wishlist');
    click('Coba Lagi'); expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Belum ada wishlist/)).not.toBeInTheDocument();
  });
  it('cancels a dirty editor back to detail after confirming discard instead of closing the popup', async () => {
    await mount({ wishlistGroups: [group()] }); open(); click('Tambah Item'); fill('Nama item', 'Draf'); click('Batal');
    click('Buang Perubahan');
    expect(screen.getByRole('dialog', { name: 'Setup Ruang Kerja' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tambah Item' })).toBeInTheDocument();
    click('Tutup'); open(); click('Edit wishlist Setup Ruang Kerja');
    expect(screen.getByLabelText('Judul wishlist')).toHaveValue('Setup Ruang Kerja');
    click('Batal'); expect(screen.getByRole('dialog', { name: 'Setup Ruang Kerja' })).toBeInTheDocument();
  });
  it('confirms item deletion, preserves failed confirmation and waits for persisted deletion', async () => {
    let resolve;
    const onDeleteItem = vi.fn().mockRejectedValueOnce(new Error('Gagal hapus')).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const props = { wishlistGroups: [group({ items: [item()] })], onDeleteItem };
    const view = await mount(props); open(); click('Hapus item Monitor');
    expect(screen.getByRole('dialog', { name: 'Hapus Item?' })).toBeInTheDocument();
    expect(screen.getByText(/Hapus “Monitor”/)).toBeInTheDocument();
    click('Batal'); expect(onDeleteItem).not.toHaveBeenCalled();
    click('Hapus item Monitor'); click('Hapus');
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal hapus');
    expect(screen.getByRole('dialog', { name: 'Hapus Item?' })).toBeInTheDocument();
    click('Hapus');
    expect(screen.getByRole('button', { name: 'Hapus', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tutup' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Batal' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' }); fireEvent.click(document.querySelector('.wishlistOverlay'));
    expect(screen.getByRole('dialog', { name: 'Hapus Item?' })).toBeInTheDocument();
    await act(async () => resolve());
    expect(onDeleteItem).toHaveBeenLastCalledWith('g1', 'i1');
    expect(within(screen.getByRole('dialog')).getByText('Monitor')).toBeInTheDocument();
    view.update({ ...props, wishlistGroups: [group()] });
    expect(within(screen.getByRole('dialog')).queryByText('Monitor')).not.toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getAllByText('Rp0')).toHaveLength(2);
  });
  it('confirms group cascade deletion with title and count while leaving other groups authoritative', async () => {
    const onDeleteGroup = vi.fn().mockRejectedValueOnce(new Error('Gagal hapus kelompok')).mockResolvedValueOnce(undefined);
    const g = group({ items: [item()] }), other = group({ id: 'g2', title: 'Rumah' });
    const props = { wishlistGroups: [g, other], onDeleteGroup }; const view = await mount(props);
    open();
    click('Hapus wishlist Setup Ruang Kerja');
    expect(screen.getByRole('dialog', { name: 'Hapus Wishlist?' })).toBeInTheDocument();
    expect(screen.getByText(/Setup Ruang Kerja.*1 item/)).toBeInTheDocument();
    click('Hapus'); expect(await screen.findByRole('alert')).toHaveTextContent('Gagal hapus kelompok');
    click('Hapus'); await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onDeleteGroup).toHaveBeenLastCalledWith('g1');
    expect(screen.getByRole('button', { name: 'Buka Setup Ruang Kerja' })).toBeInTheDocument();
    view.update({ ...props, wishlistGroups: [other] });
    expect(screen.queryByRole('button', { name: 'Buka Setup Ruang Kerja' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buka Rumah' })).toBeInTheDocument();
  });
  it('edits only group target fields in the same popup without modifying stored items', async () => {
    const g = group({ items: [item()] });
    const onUpdateGroup = vi.fn().mockResolvedValue(g);
    const props = { wishlistGroups: [g], onUpdateGroup };
    const view = await mount(props); open();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit wishlist Setup Ruang Kerja' }));
    expect(screen.getByLabelText('Judul wishlist')).toHaveValue(g.title);
    fill('Target dana (Rp)', '1000000'); click(/^Simpan(?: Item| Wishlist| Perubahan)?$/);
    await screen.findByRole('button', { name: 'Tambah Item' });
    expect(onUpdateGroup).toHaveBeenCalledWith('g1', { title: g.title, targetBudget: 1000000, targetDate: g.targetDate });
    expect(within(screen.getByRole('dialog')).getByText('Sisa dari target')).toBeInTheDocument();
    view.update({ ...props, wishlistGroups: [{ ...g, targetBudget: 1000000 }] });
    expect(within(screen.getByRole('dialog')).getByText('Melebihi Anggaran')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getAllByText('Rp1.000.000')).toHaveLength(2);
    expect(within(screen.getByRole('dialog')).getByText('Monitor')).toBeInTheDocument();
  });
  it('edits item using immutable group and item identifiers without optimistic totals', async () => {
    const g = group({ items: [item()] }); const onUpdateItem = vi.fn().mockResolvedValue(item());
    const props = { wishlistGroups: [g], onUpdateItem }; const view = await mount(props); open(); click('Edit item Monitor');
    expect(screen.getByLabelText('Nama item')).toHaveValue('Monitor');
    fill('Harga (Rp)', '4000000'); fill('Urgensi / prioritas', 'low'); click(/^Simpan(?: Item| Wishlist| Perubahan)?$/);
    await screen.findByRole('button', { name: 'Tambah Item' });
    expect(onUpdateItem).toHaveBeenCalledWith('g1', 'i1', { name: 'Monitor', price: 4000000, notes: '', priority: 'low' });
    expect(within(screen.getByRole('dialog')).getByText('Sisa dari target')).toBeInTheDocument();
    view.update({ ...props, wishlistGroups: [group({ items: [item({ price: 4000000, priority: 'low' })] })] });
    expect(within(screen.getByRole('dialog')).getByText('Sesuai Target Anggaran')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('Rendah')).toBeInTheDocument();
  });
  it('traps and restores keyboard focus, locks scrolling and closes clean detail with Escape', async () => {
    await mount({ wishlistGroups: [group()] });
    const trigger = screen.getByRole('button', { name: 'Buka Setup Ruang Kerja' });
    trigger.focus(); open();
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    const last = within(dialog).getByRole('button', { name: 'Hapus wishlist Setup Ruang Kerja' });
    last.focus(); fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Tutup' }));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).not.toBe('hidden');
  });
  it.each(['Tutup', 'Escape', 'backdrop'])('confirms dirty dismissal via %s inside the same popup', async path => {
    await mount({ wishlistGroups: [group()] }); open(); click('Tambah Item'); fill('Nama item', 'Belum tersimpan');
    if (path === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
    else if (path === 'backdrop') fireEvent.click(document.querySelector('.wishlistOverlay'));
    else click('Tutup');
    expect(screen.getByRole('button', { name: 'Buang Perubahan' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    click('Lanjutkan Mengedit'); expect(screen.getByLabelText('Nama item')).toHaveValue('Belum tersimpan');
    click('Tutup'); click('Buang Perubahan'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('uses an item editor in the same popup, retains failed inputs and updates totals only from props', async () => {
    const onCreateItem = vi.fn().mockRejectedValueOnce(new Error('Koneksi terputus')).mockResolvedValueOnce(item());
    const props = { wishlistGroups: [group()], onCreateItem };
    const view = await mount(props); open(); click('Tambah Item');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByLabelText('Urgensi / prioritas')).toHaveValue('medium');
    fill('Nama item', '  Monitor  '); fill('Harga (Rp)', '2000000'); fill('Catatan (opsional)', '  Ukuran meja\nWarna hitam  '); fill('Urgensi / prioritas', 'high');
    click(/^Simpan(?: Item| Wishlist| Perubahan)?$/);
    expect(await screen.findByRole('alert')).toHaveTextContent('Koneksi terputus');
    expect(screen.getByLabelText('Nama item')).toHaveValue('  Monitor  ');
    expect(screen.getByRole('dialog').querySelector('.wishlistTotals')).not.toBeInTheDocument();
    click(/^Simpan(?: Item| Wishlist| Perubahan)?$/);
    await screen.findByRole('button', { name: 'Tambah Item' });
    expect(onCreateItem).toHaveBeenLastCalledWith('g1', { name: 'Monitor', price: 2000000, notes: 'Ukuran meja\nWarna hitam', priority: 'high' });
    expect(within(screen.getByRole('dialog')).queryByText('Monitor')).not.toBeInTheDocument();
    view.update({ ...props, wishlistGroups: [group({ items: [item()] })] });
    expect(within(screen.getByRole('dialog')).getByText('Monitor')).toBeInTheDocument();
    const detail = screen.getByRole('dialog');
    expect(within(detail.querySelector('.wishlistDetailSummary')).getByText('Rp2.000.000')).toBeInTheDocument();
    expect(within(detail.querySelector('.wishlistTotals')).getByText('Rp2.000.000')).toBeInTheDocument();
  });
  it('creates normalized numeric group data and opens it only when the authoritative snapshot arrives', async () => {
    const onCreateGroup = vi.fn().mockResolvedValue(group());
    const props = { wishlistGroups: [], onCreateGroup };
    const view = await mount(props);
    click('Buat Wishlist');
    expect(screen.getByRole('dialog', { name: 'Buat Wishlist' })).toBeInTheDocument();
    fill('Judul wishlist', '  Setup Ruang Kerja  '); fill('Target dana (Rp)', '4000000'); fill('Tanggal target', '2026-12-31');
    click(/^Simpan(?: Item| Wishlist| Perubahan)?$/);
    await screen.findByText('Menunggu sinkronisasi wishlist…');
    expect(onCreateGroup).toHaveBeenCalledWith({ title: 'Setup Ruang Kerja', targetBudget: 4000000, targetDate: '2026-12-31' });
    expect(screen.queryByText('Rp4.000.000')).not.toBeInTheDocument();
    view.update({ ...props, wishlistGroups: [group()] });
    expect(screen.getByRole('dialog', { name: 'Setup Ruang Kerja' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getAllByText('Rp0')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Tambah Item' })).toBeInTheDocument();
  });
  it('opens the correct group in one accessible popup with stored totals, sorted notes and hidden legacy references', async () => {
    const g = group({ items: [item({ id: 'low', name: 'Lampu', priority: 'low', price: 300000 }), item({ productUrl: 'https://shop.example/monitor', notes: 'https://shop.example/monitor' }), item({ id: 'chair', name: 'Kursi', price: 1200000, marketplaceName: 'Shopee' })] });
    await mount({ wishlistGroups: [g, group({ id: 'g2', title: 'Rumah', createdAt: '2026-10-02T00:00:00.000Z', items: [item({ groupId: 'g2', name: 'Tidak terkait', price: 1 })] })] });
    expect(screen.getAllByRole('button', { name: /^Buka / }).map(b => b.getAttribute('aria-label'))).toEqual(['Buka Rumah', 'Buka Setup Ruang Kerja']);
    open();
    const dialog = screen.getByRole('dialog', { name: 'Setup Ruang Kerja' });
    expect(within(dialog).queryByText('Tidak terkait')).not.toBeInTheDocument();
    expect(within(dialog).getAllByText('Rp3.500.000')).toHaveLength(2);
    expect(within(dialog).getByText('Rp500.000')).toBeInTheDocument();
    expect(within(dialog).getByText('Sisa dari target')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('heading', { level: 4 }).map(h => h.textContent)).toEqual(['Kursi', 'Monitor', 'Lampu']);
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    expect(within(dialog).getByText('https://shop.example/monitor')).toHaveClass('wishlistItemNote');
    expect(within(dialog).queryByText('Shopee')).not.toBeInTheDocument();
    click('Tutup');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('renders the independent empty wishlist with its own create action', async () => {
    await mount();
    expect(screen.getByRole('heading', { name: 'Wishlist' })).toBeInTheDocument();
    expect(screen.getByText('Belum ada wishlist. Buat kelompok untuk merencanakan pembelianmu.')).toBeInTheDocument();
    expect(screen.getByText(/Wishlist tidak mengurangi saldo dompet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buat Wishlist' })).toBeInTheDocument();
  });
});
