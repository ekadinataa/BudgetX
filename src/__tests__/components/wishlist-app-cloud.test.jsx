import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({ user: { uid: 'first' }, auth: { currentUser: { uid: 'first' } }, listeners: [], props: null, settings: null }));
vi.mock('../../config/firebase', () => ({ auth: state.auth, db: null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock('../../services/firestoreService', () => ({
  initUser: vi.fn(async () => {}),
  subscribeUserData: vi.fn((uid, handlers) => { for (const key of ['wallets', 'transactions', 'categories']) handlers[key]([]); return vi.fn(); }),
  subscribeWishlistGroups: vi.fn((uid, onData, onError) => { const stop = vi.fn(); state.listeners.push({ uid, onData, onError, stop }); return stop; }),
  getBudgets: vi.fn(async () => ({})), getPreferences: vi.fn(async () => ({ page: 'wishlist' })),
  getRecurringItems: vi.fn(async () => []), getDebts: vi.fn(async () => []), getInvestments: vi.fn(async () => []),
  getFixedAssets: vi.fn(async () => []), getSubscriptions: vi.fn(async () => []), updatePreferences: vi.fn(),
  createWishlistGroup: vi.fn(), updateWishlistGroup: vi.fn(), deleteWishlistGroup: vi.fn(),
  createWishlistItem: vi.fn(), updateWishlistItem: vi.fn(), deleteWishlistItem: vi.fn(),
  migrateData: vi.fn(async () => ({})), resetUserData: vi.fn(),
  createTransaction: vi.fn(), updateWallet: vi.fn(),
}));
vi.mock('../../pages/Wishlist/WishlistPage', () => ({ default: props => { state.props = props; return <pre data-testid="wishlist">{JSON.stringify(props)}</pre>; } }));
vi.mock('../../pages/Settings/SettingsPage', () => ({ default: props => { state.settings = props; return <pre data-testid="settings">{JSON.stringify(props)}</pre>; } }));
import App from '../../App';
import * as api from '../../services/firestoreService';
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); state.user = { uid: 'first' }; state.auth.currentUser = state.user; state.listeners = []; state.props = null; api.getPreferences.mockResolvedValue({ page: 'wishlist' }); });
afterEach(cleanup);
const group = { id: 'g1', title: 'Meja', targetBudget: 100, targetDate: '2026-12-31', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', items: [] };
it.each(['pending', 'failed'])('rejects Wishlist Append before any writes when its current-UID snapshot is %s', async phase => {
  render(<App />); await screen.findByTestId('wishlist');
  if (phase === 'failed') await act(async () => state.listeners[0].onError(new Error('offline')));
  fireEvent.click(document.querySelector('.navItem[data-page="settings"]'));
  await screen.findByTestId('settings');
  await expect(state.settings.onImportData({ wishlistGroups: [group] }, 'append')).rejects.toThrow(/sinkronisasi wishlist/);
  expect(api.migrateData).not.toHaveBeenCalled();
  expect(api.resetUserData).not.toHaveBeenCalled();
});
it('uses create-only cloud Append and reports actual transaction skips if a group was concurrently created', async () => {
  render(<App />); await screen.findByTestId('wishlist');
  await act(async () => state.listeners[0].onData([]));
  fireEvent.click(document.querySelector('.navItem[data-page="settings"]'));
  await screen.findByTestId('settings');
  api.migrateData.mockResolvedValueOnce({ success: true, wishlistAdded: 0, wishlistSkipped: 1 });
  let counts;
  await act(async () => { counts = await state.settings.onImportData({ wishlistGroups: [group] }, 'append'); });
  expect(counts).toEqual({ added: 0, skipped: 1 });
  expect(api.migrateData).toHaveBeenCalledWith(expect.objectContaining({ wishlistGroups: [group] }), { appendWishlist: true });
});
it('loads Wishlist independently of the three financial snapshot readiness and displays subscription errors locally', async () => {
  render(<App />);
  await screen.findByTestId('wishlist');
  expect(api.subscribeWishlistGroups).toHaveBeenCalledWith('first', expect.any(Function), expect.any(Function));
  expect(state.props.loading).toBe(true);
  expect(state.props.wishlistGroups).toEqual([]);
  await act(async () => { state.listeners[0].onError(new Error('offline')); });
  expect(state.props.loading).toBe(false);
  expect(state.props.error).toMatch(/Gagal/);
  expect(screen.queryByText('Memuat data...')).not.toBeInTheDocument();
  await act(async () => { state.props.onRetry(); });
  expect(state.listeners).toHaveLength(2);
  expect(state.listeners[0].stop).toHaveBeenCalledOnce();
  await act(async () => { state.listeners[1].onData([group]); });
  expect(state.props.wishlistGroups).toEqual([group]);
  expect(state.props.error).toBe('');
  expect(api.subscribeUserData).toHaveBeenCalledTimes(1);
});
it('creates through cloud API without optimistically appending responses over newer snapshots', async () => {
  render(<App />); await screen.findByTestId('wishlist');
  await act(async () => { state.listeners[0].onData([group]); });
  let finish;
  api.createWishlistGroup.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const input = { title: 'Kursi', targetBudget: 50, targetDate: '2026-12-01' };
  let pending;
  await act(async () => { pending = state.props.onCreateGroup(input); });
  expect(api.createWishlistGroup).toHaveBeenCalledWith(input);
  expect(state.props.wishlistGroups).toEqual([group]);
  const newer = { ...group, title: 'Snapshot lebih baru' };
  await act(async () => { state.listeners[0].onData([newer]); finish({ ...group, title: 'Respons lama' }); await pending; });
  expect(state.props.wishlistGroups).toEqual([newer]);
  expect(api.createTransaction).not.toHaveBeenCalled();
  expect(api.updateWallet).not.toHaveBeenCalled();
});
it.each([
  ['onUpdateGroup', 'updateWishlistGroup', ['g1', { title: 'Baru', targetBudget: 2, targetDate: '2026-12-01' }]],
  ['onDeleteGroup', 'deleteWishlistGroup', ['g1']],
  ['onCreateItem', 'createWishlistItem', ['g1', { name: 'Lampu', price: 2, priority: 'high' }]],
  ['onUpdateItem', 'updateWishlistItem', ['g1', 'i1', { price: 3 }]],
  ['onDeleteItem', 'deleteWishlistItem', ['g1', 'i1']],
])('dispatches %s to %s without mutating snapshot state on success or failure', async (handler, method, args) => {
  render(<App />); await screen.findByTestId('wishlist');
  await act(async () => { state.listeners[0].onData([group]); });
  api[method].mockResolvedValueOnce({ id: 'response' });
  await act(async () => { expect(await state.props[handler](...args)).toEqual({ id: 'response' }); });
  expect(api[method]).toHaveBeenCalledWith(...args);
  expect(state.props.wishlistGroups).toEqual([group]);
  api[method].mockRejectedValueOnce(new Error('write failed'));
  await expect(state.props[handler](...args)).rejects.toThrow('write failed');
  expect(state.props.wishlistGroups).toEqual([group]);
  expect(api.createTransaction).not.toHaveBeenCalled();
  expect(api.updateWallet).not.toHaveBeenCalled();
});
it('clears account data, unsubscribes and ignores old callbacks across UID change, logout and same-UID login', async () => {
  const view = render(<App />); await screen.findByTestId('wishlist');
  const first = state.listeners[0];
  await act(async () => { first.onData([group]); });
  state.user = { uid: 'second' }; state.auth.currentUser = state.user; view.rerender(<App />);
  await waitFor(() => expect(state.listeners).toHaveLength(2));
  expect(first.stop).toHaveBeenCalledOnce();
  await screen.findByTestId('wishlist');
  expect(state.props.wishlistGroups).toEqual([]);
  const second = { ...group, id: 'second-group' };
  await act(async () => { state.listeners[1].onData([second]); first.onData([group]); first.onError(new Error('late')); });
  expect(state.props.wishlistGroups).toEqual([second]);
  expect(state.props.error).toBe('');
  state.user = null; state.auth.currentUser = null; view.rerender(<App />);
  expect(state.listeners[1].stop).toHaveBeenCalledOnce();
  state.user = { uid: 'second' }; state.auth.currentUser = state.user; view.rerender(<App />);
  await waitFor(() => expect(state.listeners).toHaveLength(3));
  await screen.findByTestId('wishlist');
  expect(state.props.wishlistGroups).toEqual([]);
  expect(state.props.loading).toBe(true);
  await act(async () => { state.listeners[1].onData([second]); });
  expect(state.props.wishlistGroups).toEqual([]);
  view.unmount(); expect(state.listeners[2].stop).toHaveBeenCalledOnce();
});
