import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { STORAGE_KEY } from '../../utils/constants';
const state = vi.hoisted(() => ({ props: null, settings: null, topbar: null }));
vi.mock('../../config/firebase', () => ({ auth: null, db: null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('../../services/firestoreService', () => ({ createTransaction: vi.fn(), createWishlistGroup: vi.fn(), resetUserData: vi.fn().mockRejectedValue(new Error('Cloud reset must not run in local mode')) }));
vi.mock('../../pages/Wishlist/WishlistPage', () => ({ default: props => { state.props = props; return <pre data-testid="wishlist">{JSON.stringify(props)}</pre>; } }));
vi.mock('../../pages/Settings/SettingsPage', () => ({ default: props => { state.settings = props; return <button onClick={() => props.setPage('wishlist')}>wishlist</button>; } }));
vi.mock('../../components/Topbar/Topbar', () => ({ default: props => { state.topbar = props; return null; } }));
import App from '../../App';
import * as api from '../../services/firestoreService';
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); state.props = null; state.settings = null; });
afterEach(cleanup);
const group = { id: 'g1', title: 'Meja', targetBudget: 100, targetDate: '2026-12-31', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', items: [] };
function seed(extra = {}) { localStorage.setItem(STORAGE_KEY, JSON.stringify({ page: 'wishlist', wallets: [{ id: 'w1', balance: 42 }], transactions: [], wishlistGroups: [group], ...extra })); }
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
it('routes persisted Wishlist into a wide page without the global transaction launcher', () => {
  seed();
  const view = render(<App />);
  expect(screen.getByTestId('wishlist')).toHaveTextContent('Meja');
  expect(state.props.wishlistGroups).toEqual([group]);
  expect(screen.getByTestId('wishlist').closest('.container')).toHaveClass('pageWide');
  expect(state.topbar.onAddTx).toBeUndefined();
  expect(saved().wishlistGroups).toEqual([group]);
  view.unmount(); render(<App />);
  expect(state.props.wishlistGroups).toEqual([group]);
  expect(api.createTransaction).not.toHaveBeenCalled();
});
it('creates an isolated empty group with app-owned UUID and timestamps, trimming allowed fields', async () => {
  seed(); render(<App />);
  let created;
  await act(async () => { created = await state.props.onCreateGroup({ title: '  Kursi  ', targetBudget: 200, targetDate: '2026-12-01', walletId: 'w1', items: [{ price: 1 }], id: 'forged' }); });
  expect(created).toMatchObject({ title: 'Kursi', targetBudget: 200, targetDate: '2026-12-01', items: [] });
  expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(created.createdAt).toBe(new Date(created.createdAt).toISOString());
  expect(created.updatedAt).toBe(created.createdAt);
  expect(created).not.toHaveProperty('walletId');
  expect(saved().wishlistGroups).toEqual([group, created]);
  expect(saved().wallets).toEqual([{ id: 'w1', balance: 42 }]);
  expect(saved().transactions).toEqual([]);
  expect(api.createWishlistGroup).not.toHaveBeenCalled();
});
it('adds an item only to its group without financial references or mutating previous state', async () => {
  seed({ wishlistGroups: [group, { ...group, id: 'g2' }] }); render(<App />);
  const previous = state.props.wishlistGroups;
  let item;
  await act(async () => { item = await state.props.onCreateItem('g1', { name: '  Lampu ', price: 120, marketplaceName: ' Toko ', productUrl: ' https://example.com/item ', priority: 'high', walletId: 'w1', id: 'forged' }); });
  expect(item).toMatchObject({ groupId: 'g1', name: 'Lampu', price: 120, marketplaceName: 'Toko', productUrl: 'https://example.com/item', priority: 'high' });
  expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(item.updatedAt).toBe(item.createdAt);
  expect(item).not.toHaveProperty('walletId');
  expect(previous[0].items).toEqual([]);
  expect(saved().wishlistGroups[0].items).toEqual([item]);
  expect(saved().wishlistGroups[1].items).toEqual([]);
  expect(saved().transactions).toEqual([]);
  expect(saved().wallets[0].balance).toBe(42);
});
it('edits group metadata while preserving immutable IDs, createdAt and items', async () => {
  const item = { id: 'i1', groupId: 'g1', name: 'Lampu', price: 20, marketplaceName: '', productUrl: '', priority: 'medium', createdAt: group.createdAt, updatedAt: group.updatedAt };
  seed({ wishlistGroups: [{ ...group, items: [item] }] }); render(<App />);
  await act(async () => { await state.props.onUpdateGroup('g1', { title: '  Baru ', targetBudget: 10, targetDate: '2020-01-01', items: [] }); });
  expect(saved().wishlistGroups[0]).toMatchObject({ id: 'g1', title: 'Baru', targetBudget: 10, targetDate: '2020-01-01', createdAt: group.createdAt, items: [item] });
});
it('edits an item without changing its parent, ID or createdAt and updates its group timestamp', async () => {
  const item = { id: 'i1', groupId: 'g1', name: 'Lampu', price: 20, marketplaceName: '', productUrl: '', priority: 'medium', createdAt: group.createdAt, updatedAt: group.updatedAt };
  seed({ wishlistGroups: [{ ...group, items: [item] }] }); render(<App />);
  let updated;
  await act(async () => { updated = await state.props.onUpdateItem('g1', 'i1', { name: ' Baru ', price: 200, priority: 'low' }); });
  expect(updated).toMatchObject({ id: 'i1', groupId: 'g1', createdAt: item.createdAt, name: 'Baru', price: 200, priority: 'low' });
  expect(saved().wishlistGroups[0].items).toEqual([updated]);
  expect(saved().wishlistGroups[0].updatedAt).toBe(updated.updatedAt);
});
it('deletes an item only from its group and rejects missing IDs', async () => {
  const item = { id: 'i1', groupId: 'g1', name: 'Lampu', price: 20, marketplaceName: '', productUrl: '', priority: 'medium', createdAt: group.createdAt, updatedAt: group.updatedAt };
  seed({ wishlistGroups: [{ ...group, items: [item] }, { ...group, id: 'g2' }] }); render(<App />);
  await act(async () => { await state.props.onDeleteItem('g1', 'i1'); });
  expect(saved().wishlistGroups[0].items).toEqual([]);
  expect(saved().wishlistGroups[1]).toEqual({ ...group, id: 'g2' });
  await expect(state.props.onDeleteItem('g1', 'i1')).rejects.toThrow(/tidak ditemukan/);
});
it('deletes a group with all embedded children while leaving other groups and money untouched', async () => {
  const item = { id: 'i1', groupId: 'g1', name: 'Lampu', price: 20, marketplaceName: '', productUrl: '', priority: 'medium', createdAt: group.createdAt, updatedAt: group.updatedAt };
  seed({ wishlistGroups: [{ ...group, items: [item] }, { ...group, id: 'g2' }] }); render(<App />);
  await act(async () => { await state.props.onDeleteGroup('g1'); });
  expect(saved().wishlistGroups).toEqual([{ ...group, id: 'g2' }]);
  expect(saved().wallets[0].balance).toBe(42);
  expect(saved().transactions).toEqual([]);
  await expect(state.props.onDeleteGroup('g1')).rejects.toThrow(/tidak ditemukan/);
});
it('passes Wishlist data into Settings for complete backups and navigates its shortcut', () => {
  seed({ page: 'settings' }); render(<App />);
  expect(state.settings.wishlistGroups).toEqual([group]);
  fireEvent.click(screen.getByText('wishlist'));
  expect(state.props.wishlistGroups).toEqual([group]);
});
it('Replace restores Wishlist, resets absent legacy Wishlist, and keeps local CRUD pointed at restored state', async () => {
  seed({ page: 'settings' }); render(<App />);
  const restored = { ...group, id: 'restored', title: 'Pulih' };
  await act(async () => { await state.settings.onImportData({ wishlistGroups: [restored], preferences: { page: 'settings' } }, 'replace'); });
  expect(saved().wishlistGroups).toEqual([restored]);
  fireEvent.click(screen.getByText('wishlist'));
  await act(async () => { await state.props.onUpdateGroup('restored', { title: 'Diedit', targetBudget: 10, targetDate: '2026-12-01' }); });
  expect(saved().wishlistGroups[0].title).toBe('Diedit');
  fireEvent.click(document.querySelector('.navItem[data-page="settings"]'));
  await act(async () => { await state.settings.onImportData({ preferences: { page: 'settings' } }, 'replace'); });
  expect(saved().wishlistGroups).toEqual([]);
});
it('resets local Wishlist including embedded items without calling cloud and clears its CRUD reference', async () => {
  const item = { id: 'i1', groupId: 'g1', name: 'Lampu', price: 20, marketplaceName: '', productUrl: '', priority: 'medium', createdAt: group.createdAt, updatedAt: group.updatedAt };
  seed({ page: 'settings', wishlistGroups: [{ ...group, items: [item] }] }); render(<App />);
  await act(async () => { await state.settings.onResetData(); });
  expect(saved().wishlistGroups).toEqual([]);
  expect(saved().page).toBe('dashboard');
  expect(saved().wallets).toEqual([]);
  expect(saved().transactions).toEqual([]);
  expect(api.resetUserData).not.toHaveBeenCalled();
  fireEvent.click(document.querySelector('.navItem[data-page="wishlist"]'));
  await expect(state.props.onUpdateGroup('g1', { title: 'Old group' })).rejects.toThrow(/tidak ditemukan/);
});
it('Append deduplicates Wishlist by group ID and retains embedded item relationships for subsequent edits', async () => {
  seed({ page: 'settings' }); render(<App />);
  const added = { ...group, id: 'new', title: 'Baru' };
  await act(async () => { await state.settings.onImportData({ wishlistGroups: [{ ...group, title: 'Jangan timpa' }, added] }, 'append'); });
  expect(saved().wishlistGroups).toEqual([group, added]);
  fireEvent.click(screen.getByText('wishlist'));
  await act(async () => { await state.props.onCreateItem('new', { name: 'Lampu', price: 10 }); });
  expect(saved().wishlistGroups[0]).toEqual(group);
  expect(saved().wishlistGroups[1].items[0]).toMatchObject({ groupId: 'new', name: 'Lampu' });
});
it('matches cloud normalization for partial metadata updates and rejects immutable identity changes', async () => {
  seed(); render(<App />);
  await act(async () => { await state.props.onUpdateGroup('g1', { title: 'Judul saja' }); });
  expect(saved().wishlistGroups[0]).toMatchObject({ ...group, title: 'Judul saja', updatedAt: expect.any(String) });
  await expect(state.props.onUpdateGroup('g1', { ...group, id: 'bad' })).rejects.toThrow(/immutable/);
  await expect(state.props.onCreateItem('g1', { name: 'Lampu', price: 2, groupId: 'g2' })).rejects.toThrow(/immutable/);
});
it('validates local input and cumulative safe integers before mutating persisted data, including rapid calls', async () => {
  seed(); render(<App />);
  const raw = localStorage.getItem(STORAGE_KEY);
  for (const input of [
    { title: '  ', targetBudget: 1, targetDate: '2026-12-01' },
    { title: 'Valid', targetBudget: 1.5, targetDate: '2026-12-01' },
    { title: 'Valid', targetBudget: 1, targetDate: '2026-02-30' },
  ]) await expect(state.props.onCreateGroup(input)).rejects.toThrow();
  for (const input of [
    { name: ' ', price: 1 }, { name: 'Valid', price: -1 },
    { name: 'Valid', price: 2, productUrl: 'javascript:alert(1)' },
    { name: 'Valid', price: 2, priority: 'invalid' },
  ]) await expect(state.props.onCreateItem('g1', input)).rejects.toThrow();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  await act(async () => {
    const first = state.props.onCreateItem('g1', { name: 'Maksimum', price: Number.MAX_SAFE_INTEGER });
    const second = state.props.onCreateItem('g1', { name: 'Overflow', price: 1 });
    await first;
    await expect(second).rejects.toThrow(/safe integer/);
  });
  expect(saved().wishlistGroups[0].items).toHaveLength(1);
  expect(saved().wallets[0].balance).toBe(42);
  expect(saved().transactions).toEqual([]);
});
