// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const mock = vi.hoisted(() => ({ store: new Map(), counter: 0, tx: { get: vi.fn(), set: vi.fn(), delete: vi.fn() }, batch: { set: vi.fn(), delete: vi.fn(), update: vi.fn(), commit: vi.fn() }, auth: { currentUser: { uid: 'wishlist-owner' } } }));
vi.mock('../../config/firebase', () => ({ db: {}, auth: mock.auth }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
  doc: vi.fn((base, ...parts) => parts.length ? { path: parts.join('/'), id: parts.at(-1) } : { path: `${base.path}/auto-${++mock.counter}`, id: `auto-${mock.counter}` }),
  runTransaction: vi.fn(async (_db, fn) => fn(mock.tx)),
  onSnapshot: vi.fn(), getDocs: vi.fn(), getDoc: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), setDoc: vi.fn(),
  writeBatch: vi.fn(() => mock.batch), increment: vi.fn(), query: vi.fn(ref => ref), where: vi.fn(), limit: vi.fn(),
}));
import * as api from '../../services/firestoreService.js';
import * as sdk from 'firebase/firestore';
const stamp = '2026-10-12T00:00:00.000Z';
const item = (extra = {}) => ({ id: 'i1', groupId: 'g1', name: 'Monitor', price: 200, marketplaceName: '', productUrl: '', priority: 'medium', createdAt: stamp, updatedAt: stamp, ...extra });
const group = (extra = {}) => ({ id: 'g1', title: 'Setup', targetBudget: 1000, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp, items: [], ...extra });
const path = 'users/wishlist-owner/wishlistGroups/g1';
beforeEach(() => {
  vi.clearAllMocks(); mock.store.clear(); mock.counter = 0; mock.auth.currentUser = { uid: 'wishlist-owner' };
  mock.tx.get.mockImplementation(async ref => ({ exists: () => mock.store.has(ref.path), data: () => mock.store.get(ref.path) }));
  mock.tx.set.mockImplementation((ref, data) => mock.store.set(ref.path, data));
  mock.tx.delete.mockImplementation(ref => mock.store.delete(ref.path));
  mock.batch.commit.mockResolvedValue();
  sdk.runTransaction.mockImplementation(async (_db, fn) => fn(mock.tx));
});

describe('Wishlist Firebase CRUD (mock only)', () => {
  it('Append reads the target in a transaction and skips existing groups including all embedded items', async () => {
    const current = group({ title: 'Latest', items: [item({ id: 'newer-item', price: 333 })] });
    mock.store.set(path, current);
    const older = group({ items: [item()] });
    const result = await api.migrateData({ wishlistGroups: [older], preferences: {} }, { appendWishlist: true });
    expect(mock.tx.get).toHaveBeenCalledWith({ path, id: 'g1' });
    expect(mock.store.get(path)).toEqual(current);
    expect(mock.tx.set).not.toHaveBeenCalled();
    expect(mock.batch.set.mock.calls.filter(([ref]) => ref.path.includes('/wishlistGroups/'))).toEqual([]);
    expect(result).toMatchObject({ wishlistAdded: 0, wishlistSkipped: 1 });
  });
  it('Append creates missing groups once with their embedded identities preserved and no wallet operations', async () => {
    sdk.getDoc.mockResolvedValueOnce({ exists: () => true });
    const source = group({ items: [item()] });
    const result = await api.migrateData({ wishlistGroups: [source] }, { appendWishlist: true });
    const { id, ...stored } = source;
    expect(mock.store.get(path)).toEqual(stored);
    expect(mock.tx.set).toHaveBeenCalledWith({ path, id }, stored);
    expect(result).toMatchObject({ imported: 1, wishlistAdded: 1, wishlistSkipped: 0 });
    expect(mock.batch.set).not.toHaveBeenCalled();
    expect(mock.batch.update).not.toHaveBeenCalled();
    expect(sdk.increment).not.toHaveBeenCalled();
  });
  it('Append retries safely if a target group appears after its first missing snapshot', async () => {
    sdk.runTransaction.mockImplementationOnce(async (_db, fn) => {
      mock.tx.set.mockImplementationOnce(() => {});
      await fn(mock.tx);
      mock.store.set(path, group({ title: 'Concurrent group', items: [item({ id: 'concurrent-item' })] }));
      return fn(mock.tx);
    });
    const result = await api.migrateData({ wishlistGroups: [group({ items: [item()] })], preferences: {} }, { appendWishlist: true });
    expect(mock.store.get(path)).toMatchObject({ title: 'Concurrent group', items: [item({ id: 'concurrent-item' })] });
    expect(result).toMatchObject({ wishlistAdded: 0, wishlistSkipped: 1 });
  });
  it('Append rejects an Auth switch during its transactional read without group or batch writes', async () => {
    mock.tx.get.mockImplementationOnce(async () => {
      mock.auth.currentUser = { uid: 'other' };
      return { exists: () => false };
    });
    await expect(api.migrateData({ wishlistGroups: [group()], preferences: {} }, { appendWishlist: true })).rejects.toThrow(/Sesi/);
    expect(mock.tx.set).not.toHaveBeenCalled();
    expect(mock.batch.set).not.toHaveBeenCalled();
    expect(mock.batch.commit).not.toHaveBeenCalled();
  });
  it('includes embedded groups in reset without reseeding wishlist or leaving children', async () => {
    sdk.getDocs.mockImplementation(async ref => ({ docs: ref.path.endsWith('/wishlistGroups') ? [{ ref: { path, id: 'g1' } }] : [] }));
    await api.resetUserData({ initializeDefaults: false });
    expect(sdk.getDocs).toHaveBeenCalledWith({ path: 'users/wishlist-owner/wishlistGroups' });
    expect(mock.batch.delete).toHaveBeenCalledWith({ path, id: 'g1' });
    expect(mock.batch.set).not.toHaveBeenCalled();
  });
  it('restores embedded IDs and ISO timestamps without replaying any balances', async () => {
    const source = group({ items: [item()] });
    await api.migrateData({ wishlistGroups: [source], preferences: {} });
    const { id, ...stored } = source;
    expect(mock.batch.set).toHaveBeenCalledWith({ path, id }, stored);
    expect(mock.batch.update).not.toHaveBeenCalled();
    expect(sdk.increment).not.toHaveBeenCalled();
  });
  it('rejects invalid wishlist migration before reading preferences or committing any writes', async () => {
    for (const groups of [[group({ items: [item({ groupId: 'orphan' })] })], [group({ updatedAt: 'bad' })], [group({ items: [item()] }), group({ id: 'g2', items: [item({ groupId: 'g2' })] })], {}]) {
      await expect(api.migrateData({ wishlistGroups: groups, preferences: {}, wallets: [{ id: 'w1', balance: 100 }] })).rejects.toThrow();
    }
    expect(mock.batch.commit).not.toHaveBeenCalled();
    expect(mock.batch.set).not.toHaveBeenCalled();
    expect(sdk.getDoc).not.toHaveBeenCalled();
  });
  it('rejects malformed group paths before touching Firestore', async () => {
    for (const id of ['bad/id', '', '.', '..', 'x'.repeat(1001)]) {
      await expect(api.deleteWishlistGroup(id)).rejects.toThrow(/ID/);
      await expect(api.updateWishlistGroup(id, { title: 'x' })).rejects.toThrow(/ID/);
      await expect(api.createWishlistItem(id, { name: 'x', price: 1 })).rejects.toThrow(/ID/);
    }
    expect(sdk.runTransaction).not.toHaveBeenCalled();
  });
  it('retries item edits against the latest group and retains a concurrently added sibling', async () => {
    const initial = group({ items: [item()] }); mock.store.set(path, initial);
    sdk.runTransaction.mockImplementationOnce(async (_db, fn) => {
      mock.tx.set.mockImplementationOnce(() => {});
      await fn(mock.tx);
      mock.store.set(path, group({ title: 'Concurrent title', items: [item(), item({ id: 'concurrent' })] }));
      return fn(mock.tx);
    });
    const result = await api.updateWishlistItem('g1', 'i1', { price: 300 });
    expect(result.price).toBe(300);
    expect(mock.store.get(path)).toMatchObject({ title: 'Concurrent title', items: [expect.objectContaining({ price: 300 }), item({ id: 'concurrent' })] });
    expect(mock.tx.get).toHaveBeenCalledTimes(2);
  });
  it('rejects account switches during a transaction before writing to either account', async () => {
    mock.tx.get.mockImplementationOnce(async () => {
      mock.auth.currentUser = { uid: 'other' };
      return { exists: () => true, data: () => group() };
    });
    await expect(api.updateWishlistGroup('g1', { title: 'x' })).rejects.toThrow(/Sesi/);
    expect(mock.tx.set).not.toHaveBeenCalled();
  });
  it('propagates transaction failures without reporting success or issuing financial mutations', async () => {
    sdk.runTransaction.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(api.deleteWishlistGroup('g1')).rejects.toThrow('permission-denied');
    expect(mock.tx.delete).not.toHaveBeenCalled();
    expect(sdk.increment).not.toHaveBeenCalled();
  });
  it('does not publish a cached empty snapshot as complete cloud data and waits for server metadata', () => {
    const onData = vi.fn();
    api.subscribeWishlistGroups('wishlist-owner', onData);
    const args = sdk.onSnapshot.mock.calls[0];
    const receive = args.find(arg => typeof arg === 'function');
    receive({ docs: [], metadata: { fromCache: true } });
    expect(onData).not.toHaveBeenCalled();
    receive({ docs: [{ id: 'g1', data: () => group({ items: [item()] }) }], metadata: { fromCache: false } });
    expect(onData).toHaveBeenCalledWith([group({ items: [item()] })]);
    expect(args[1]).toEqual({ includeMetadataChanges: true });
  });
  it('publishes authoritative snapshot IDs and guards stale data and error callbacks', () => {
    expect(api.subscribeWishlistGroups).toBeTypeOf('function');
    const unsubscribe = vi.fn(); sdk.onSnapshot.mockReturnValue(unsubscribe);
    const onData = vi.fn(); const onError = vi.fn();
    const stop = api.subscribeWishlistGroups('wishlist-owner', onData, onError);
    const [ref, , receive, error] = sdk.onSnapshot.mock.calls[0];
    expect(ref.path).toBe('users/wishlist-owner/wishlistGroups');
    receive({ docs: [{ id: 'g1', data: () => group({ id: 'untrusted' }) }] });
    expect(onData).toHaveBeenCalledWith([group()]);
    error(new Error('offline')); expect(onError).toHaveBeenCalledTimes(1);
    mock.auth.currentUser = { uid: 'other' }; receive({ docs: [] }); error(new Error('late'));
    expect(onData).toHaveBeenCalledTimes(1); expect(onError).toHaveBeenCalledTimes(1);
    mock.auth.currentUser = { uid: 'wishlist-owner' }; stop(); receive({ docs: [] }); error(new Error('late'));
    expect(unsubscribe).toHaveBeenCalledTimes(1); expect(onData).toHaveBeenCalledTimes(1);
    expect(() => api.subscribeWishlistGroups('other', onData, onError)).toThrow(/authenticated/);
  });
  it('deletes the whole embedded group as one atomic document without orphans', async () => {
    expect(api.deleteWishlistGroup).toBeTypeOf('function');
    mock.store.set(path, group({ items: [item()] }));
    mock.store.set('users/wishlist-owner/wishlistGroups/g2', group({ id: 'g2' }));
    await api.deleteWishlistGroup('g1');
    expect(mock.store.has(path)).toBe(false);
    expect(mock.store.size).toBe(1);
    expect(mock.tx.delete).toHaveBeenCalledTimes(1);
    expect(mock.tx.delete).toHaveBeenCalledWith({ path, id: 'g1' });
    expect(mock.tx.set).not.toHaveBeenCalled();
  });
  it('deletes an item within its parent only', async () => {
    expect(api.deleteWishlistItem).toBeTypeOf('function');
    mock.store.set(path, group({ items: [item(), item({ id: 'i2' })] }));
    await api.deleteWishlistItem('g1', 'i1');
    expect(mock.store.get(path).items).toEqual([item({ id: 'i2' })]);
    expect(mock.tx.delete).not.toHaveBeenCalled();
    await expect(api.deleteWishlistItem('g1', 'missing')).rejects.toThrow(/ditemukan/);
    expect(sdk.increment).not.toHaveBeenCalled();
  });
  it('updates one item preserving sibling values and immutable identity', async () => {
    expect(api.updateWishlistItem).toBeTypeOf('function');
    mock.store.set(path, group({ items: [item(), item({ id: 'i2' })] }));
    const result = await api.updateWishlistItem('g1', 'i1', { price: 400, name: ' Updated ', walletId: 'w1' });
    expect(result).toMatchObject({ id: 'i1', groupId: 'g1', price: 400, name: 'Updated', createdAt: stamp });
    expect(mock.store.get(path).items[1]).toEqual(item({ id: 'i2' }));
    expect(result).not.toHaveProperty('walletId');
    mock.tx.set.mockClear();
    for (const update of [{ id: 'i2' }, { groupId: 'g2' }, { createdAt: 'bad' }, { productUrl: 'javascript:alert(1)' }, { price: Number.MAX_SAFE_INTEGER }]) {
      await expect(api.updateWishlistItem('g1', 'i1', update)).rejects.toThrow();
    }
    await expect(api.updateWishlistItem('g1', 'missing', { price: 2 })).rejects.toThrow(/ditemukan/);
    expect(mock.tx.set).not.toHaveBeenCalled();
  });
  it('creates an embedded item atomically after reading and validating the entire group', async () => {
    expect(api.createWishlistItem).toBeTypeOf('function');
    mock.store.set(path, group({ items: [item()] }));
    const result = await api.createWishlistItem('g1', { name: 'Chair', price: 1200, walletId: 'w1' });
    expect(result).toMatchObject({ name: 'Chair', price: 1200, groupId: 'g1', priority: 'medium' });
    expect(result.id).not.toBe('i1');
    expect(mock.store.get(path).items).toEqual([item(), result]);
    expect(result).not.toHaveProperty('walletId');
    mock.store.set(path, group({ items: [item({ price: Number.MAX_SAFE_INTEGER })] }));
    mock.tx.set.mockClear();
    await expect(api.createWishlistItem('g1', { name: 'Overflow', price: 1 })).rejects.toThrow(/safe integer/);
    expect(mock.tx.set).not.toHaveBeenCalled();
    await expect(api.createWishlistItem('missing', { name: 'Orphan', price: 1 })).rejects.toThrow(/ditemukan/);
  });
  it('updates group metadata from the latest transaction snapshot without replacing items', async () => {
    expect(api.updateWishlistGroup).toBeTypeOf('function');
    mock.store.set(path, group({ items: [item()] }));
    const result = await api.updateWishlistGroup('g1', { title: ' Edited ', items: [], walletId: 'w1' });
    expect(result).toMatchObject({ title: 'Edited', id: 'g1', createdAt: stamp, items: [item()] });
    expect(mock.tx.get).toHaveBeenCalledWith({ path, id: 'g1' });
    expect(mock.store.get(path)).not.toHaveProperty('walletId');
    await expect(api.updateWishlistGroup('g1', { id: 'g2' })).rejects.toThrow(/diubah/);
    await expect(api.updateWishlistGroup('g1', { targetDate: '2026-02-29' })).rejects.toThrow();
    await expect(api.updateWishlistGroup('missing', { title: 'x' })).rejects.toThrow(/ditemukan/);
  });
  it('creates one UID-scoped empty group using an allowlist without financial writes', async () => {
    expect(api.createWishlistGroup).toBeTypeOf('function');
    const result = await api.createWishlistGroup({ title: ' Setup ', targetBudget: 1000, targetDate: '2026-12-31', walletId: 'w1', items: [item()] });
    expect(result).toMatchObject({ id: 'auto-1', title: 'Setup', items: [] });
    const { id, ...stored } = result;
    expect(mock.tx.set).toHaveBeenCalledWith({ path: `users/wishlist-owner/wishlistGroups/${id}`, id }, stored);
    expect(result).not.toHaveProperty('walletId');
    expect(sdk.increment).not.toHaveBeenCalled();
    expect(sdk.writeBatch).not.toHaveBeenCalled();
  });
});
