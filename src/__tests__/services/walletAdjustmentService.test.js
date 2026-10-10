import { beforeEach, describe, expect, it, vi } from 'vitest';

const cloud = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'alice' } }, records: new Map(),
  get: vi.fn(), update: vi.fn(), set: vi.fn(), remove: vi.fn(), commit: vi.fn(),
}));
vi.mock('../../config/firebase', () => ({ db: {}, auth: cloud.auth }));
vi.mock('firebase/firestore', () => {
  const apply = ops => {
    for (const [method, ref, data] of ops) {
      if (method === 'delete') { cloud.records.delete(ref.path); continue; }
      const next = method === 'update' ? { ...cloud.records.get(ref.path) } : {};
      for (const [key, value] of Object.entries(data)) {
        next[key] = value?._increment !== undefined ? (next[key] || 0) + value._increment : value;
      }
      cloud.records.set(ref.path, next);
    }
  };
  const writer = ops => ({
    update: (ref, data) => { cloud.update(ref, data); ops.push(['update', ref, data]); },
    set: (ref, data) => { cloud.set(ref, data); ops.push(['set', ref, data]); },
    delete: ref => { cloud.remove(ref); ops.push(['delete', ref]); },
  });
  const snapshot = ref => ({ exists: () => cloud.records.has(ref.path), data: () => cloud.records.get(ref.path) });
  return {
    collection: (_db, ...parts) => ({ path: parts.join('/') }),
    doc: (dbOrCol, ...parts) => {
      const path = parts.length ? parts.join('/') : `${dbOrCol.path}/auto-id`;
      return { path, id: path.split('/').at(-1) };
    },
    increment: value => ({ _increment: value }),
    runTransaction: vi.fn(async (_db, callback) => {
      const ops = [];
      const result = await callback({ ...writer(ops), get: async ref => { await cloud.get(ref); return snapshot(ref); } });
      await cloud.commit(); apply(ops); return result;
    }),
    getDoc: vi.fn(async ref => { await cloud.get(ref); return snapshot(ref); }),
    updateDoc: vi.fn(async (ref, data) => apply([['update', ref, data]])),
    writeBatch: vi.fn(() => { const ops = []; return { ...writer(ops), commit: async () => { await cloud.commit(); apply(ops); } }; }),
    getDocs: vi.fn(), onSnapshot: vi.fn(), addDoc: vi.fn(), deleteDoc: vi.fn(), setDoc: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(),
  };
});
import * as api from '../../services/firestoreService.js';
import { runTransaction, updateDoc, writeBatch } from 'firebase/firestore';

const walletPath = 'users/alice/wallets/w1';
const txPath = 'users/alice/transactions/auto-id';
const wallet = { name: 'BRI', type: 'credit', balance: -400, color: '#112233', note: 'lama', creditLimit: 1000, heldAmount: 100, meshExtra: 'keep' };
const correction = { date: '2026-10-10', walletId: 'w1', type: 'adjustment', amount: -100, categoryId: null, toWalletId: null, tags: [], note: 'Koreksi', balanceBefore: -400, balanceAfter: -500 };
const ordinary = { date: '2026-10-10', walletId: 'w1', type: 'expense', amount: 100, categoryId: 'c1', tags: [], note: 'Makan' };

beforeEach(() => {
  vi.clearAllMocks(); cloud.get.mockReset(); cloud.commit.mockReset();
  cloud.auth.currentUser = { uid: 'alice' };
  cloud.records.clear(); cloud.records.set(walletPath, { ...wallet });
});

describe('atomic wallet adjustment', () => {
  it('imports CSV records and categories with aggregated atomic wallet increments including signed audit entries', async () => {
    cloud.records.set('users/alice/wallets/w2', { name: 'Tunai', balance: 0 });
    const transactions = [
      { ...ordinary, id: 'expense' },
      { ...ordinary, id: 'income', type: 'income', amount: 200 },
      { ...ordinary, id: 'transfer', type: 'transfer', amount: 50, toWalletId: 'w2' },
      { ...correction, id: 'correction' },
    ];
    const newCategories = [{ id: 'c2', name: 'Baru', section: 'needs', color: '#112233' }];
    await api.importCSVData({ transactions, newCategories });
    expect(writeBatch).toHaveBeenCalledOnce();
    expect(cloud.commit).toHaveBeenCalledOnce();
    expect(cloud.records.get(walletPath)).toEqual({ ...wallet, balance: -450 });
    expect(cloud.records.get('users/alice/wallets/w2').balance).toBe(50);
    expect(cloud.records.get('users/alice/transactions/correction')).toEqual(correction);
    expect(cloud.records.get('users/alice/categories/c2')).toEqual({ name: 'Baru', section: 'needs', color: '#112233' });
    expect(cloud.update).toHaveBeenCalledTimes(2);
    expect(updateDoc).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
  });
  it('rejects oversized CSV imports before any writes are staged', async () => {
    const transactions = Array.from({ length: 500 }, (_, index) => ({ ...ordinary, id: `csv-${index}` }));
    await expect(api.importCSVData({ transactions })).rejects.toThrow('terlalu besar');
    expect(writeBatch).not.toHaveBeenCalled();
    expect(cloud.set).not.toHaveBeenCalled();
    expect(cloud.update).not.toHaveBeenCalled();
  });
  it('rejects invalid CSV audit records and categories before any writes', async () => {
    await expect(api.importCSVData({ transactions: [{ ...correction, id: 'bad', balanceAfter: -450 }] })).rejects.toThrow();
    await expect(api.importCSVData({ newCategories: [{ id: 'bad', name: '', section: 'needs', color: '#112233' }] })).rejects.toThrow();
    expect(writeBatch).not.toHaveBeenCalled();
  });
  it('supports negative corrections and credit overpayments without touching limit or holds', async () => {
    await api.updateWallet('w1', { balance: -500 }, { expectedBalance: -400, reason: 'Koreksi' });
    expect(cloud.records.get(walletPath)).toEqual({ ...wallet, balance: -500 });
    expect(cloud.records.get(txPath)).toMatchObject({ amount: -100, balanceBefore: -400, balanceAfter: -500 });
    await api.updateWallet('w1', { balance: 100 }, { expectedBalance: -500, reason: 'Lebih bayar' });
    expect(cloud.records.get(walletPath)).toEqual({ ...wallet, balance: 100 });
  });
  it('edits metadata with no audit or balance write when the balance is unchanged or omitted', async () => {
    expect(await api.updateWallet('w1', { balance: -400, name: 'Baru' })).toMatchObject({ balance: -400, name: 'Baru' });
    await api.updateWallet('w1', { note: 'Catatan' }, { expectedBalance: -400 });
    expect(cloud.set).not.toHaveBeenCalled();
    cloud.update.mock.calls.forEach(([, data]) => expect(data).not.toHaveProperty('balance'));
    expect(cloud.records.get(walletPath)).toEqual({ ...wallet, name: 'Baru', note: 'Catatan' });
  });
  it('rejects stale balances from unrelated incoming transactions with no mutation', async () => {
    cloud.get.mockImplementationOnce(async () => cloud.records.set(walletPath, { ...wallet, balance: -300 }));
    await expect(api.updateWallet('w1', { balance: -250 }, { expectedBalance: -400, reason: 'Koreksi' })).rejects.toThrow('Saldo dompet berubah');
    await expect(api.updateWallet('w1', { balance: -400, name: 'Baru' })).rejects.toThrow('Saldo awal');
    await expect(api.updateWallet('w1', { balance: -300, name: 'Baru' }, { expectedBalance: -400 })).rejects.toThrow('Saldo dompet berubah');
    expect(cloud.update).not.toHaveBeenCalled();
    expect(cloud.set).not.toHaveBeenCalled();
    expect(cloud.records.get(walletPath)).toEqual({ ...wallet, balance: -300 });
  });
  it('rejects missing reason, invalid balances or metadata before staging writes', async () => {
    for (const [data, options] of [[{ balance: -500 }, { expectedBalance: -400 }], [{ balance: -500 }, { expectedBalance: -400, reason: 'x'.repeat(1001) }], [{ balance: Infinity }, { expectedBalance: -400, reason: 'Koreksi' }], [{ heldAmount: -1 }, {}], [{ creditLimit: Infinity }, {}]]) {
      await expect(api.updateWallet('w1', data, options)).rejects.toThrow();
    }
    expect(cloud.update).not.toHaveBeenCalled();
    expect(cloud.set).not.toHaveBeenCalled();
  });
  it('leaves both wallet and audit history untouched when the atomic commit fails', async () => {
    cloud.commit.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(api.updateWallet('w1', { balance: -500 }, { expectedBalance: -400, reason: 'Koreksi' })).rejects.toThrow('permission-denied');
    expect(cloud.records.get(walletPath)).toEqual(wallet);
    expect(cloud.records.has(txPath)).toBe(false);
  });
  it('leaves state untouched if the wallet cannot be read or no longer exists', async () => {
    cloud.get.mockRejectedValueOnce(new Error('offline'));
    await expect(api.updateWallet('w1', { name: 'Baru' })).rejects.toThrow('offline');
    cloud.records.clear();
    await expect(api.updateWallet('w1', { name: 'Baru' })).rejects.toThrow('Dompet tidak ditemukan');
    expect(cloud.update).not.toHaveBeenCalled();
    expect(cloud.set).not.toHaveBeenCalled();
  });
  it('revalidates the reviewed baseline on Firestore retry rather than overwriting a concurrent transaction', async () => {
    runTransaction.mockImplementationOnce(async (_db, callback) => {
      const transaction = { get: async () => ({ exists: () => true, data: () => cloud.records.get(walletPath) }), set: vi.fn(), update: vi.fn() };
      await callback(transaction);
      cloud.records.set(walletPath, { ...wallet, balance: -300 });
      return callback(transaction);
    });
    await expect(api.updateWallet('w1', { balance: -250 }, { expectedBalance: -400, reason: 'Koreksi' })).rejects.toThrow('Saldo dompet berubah');
    expect(cloud.records.get(walletPath)).toEqual({ ...wallet, balance: -300 });
    expect(cloud.records.has(txPath)).toBe(false);
  });
  it('preserves ordinary category overrides and mesh extras without any wallet reads or writes', async () => {
    cloud.records.set(txPath, { ...ordinary, mesh: { event: 'keep' } });
    await api.updateTransactionCategory('auto-id', ' c2 ');
    expect(cloud.records.get(txPath)).toMatchObject({ mesh: { event: 'keep' }, categoryId: 'c2', category_source: 'manual', category_status: 'classified' });
    await api.updateTransactionCategory('auto-id', null);
    expect(cloud.records.get(txPath)).toMatchObject({ categoryId: null, category_status: 'unclassified' });
    expect(cloud.records.get(walletPath)).toEqual(wallet);
    cloud.get.mock.calls.forEach(([ref]) => expect(ref.path).toBe(txPath));
  });
  it('protects adjustment category audit fields without touching any wallet', async () => {
    cloud.records.set(txPath, correction);
    await expect(api.updateTransactionCategory('auto-id', 'c2')).rejects.toThrow('Penyesuaian saldo');
    expect(cloud.records.get(txPath)).toEqual(correction);
    expect(cloud.update).not.toHaveBeenCalled();
  });

  it('protects existing adjustment audit entries against ordinary financial edits', async () => {
    cloud.records.set(txPath, correction);
    await expect(api.updateTransaction('auto-id', ordinary)).rejects.toThrow('Penyesuaian saldo');
    expect(cloud.update).not.toHaveBeenCalled();
    expect(cloud.records.get(txPath)).toEqual(correction);
  });

  it('blocks ordinary creation and replacement with an adjustment even if its audit fields validate', async () => {
    await expect(api.createTransaction(correction)).rejects.toThrow('Penyesuaian saldo');
    cloud.records.set(txPath, ordinary);
    await expect(api.updateTransaction('auto-id', correction)).rejects.toThrow('Penyesuaian saldo');
    expect(cloud.set).not.toHaveBeenCalled();
    expect(cloud.update).not.toHaveBeenCalled();
  });

  it.each(['createTransaction', 'updateTransaction'])('rejects whitespace-padded adjustment type through %s without any writes', async method => {
    cloud.records.set(txPath, ordinary);
    const recordsBefore = new Map(cloud.records);
    const payload = { ...correction, type: ' adjustment ' };
    const request = method === 'createTransaction'
      ? api.createTransaction(payload)
      : api.updateTransaction('auto-id', payload);

    await expect(request).rejects.toThrow('Penyesuaian saldo');
    expect(writeBatch).not.toHaveBeenCalled();
    expect(cloud.set).not.toHaveBeenCalled();
    expect(cloud.update).not.toHaveBeenCalled();
    expect(cloud.commit).not.toHaveBeenCalled();
    expect(cloud.records).toEqual(recordsBefore);
  });

  it('does not reverse an adjustment twice if another client deletes it before the atomic read', async () => {
    cloud.records.set(txPath, correction);
    cloud.get.mockImplementationOnce(async () => {});
    cloud.get.mockImplementationOnce(async () => {
      cloud.records.delete(txPath);
      cloud.records.set(walletPath, { ...wallet, balance: wallet.balance - correction.amount });
    });
    await api.deleteTransaction('auto-id');
    expect(runTransaction).toHaveBeenCalledOnce();
    expect(cloud.update).not.toHaveBeenCalled();
    expect(cloud.records.get(walletPath).balance).toBe(wallet.balance - correction.amount);
  });
  it.each([100, -100])('deletion reverses a signed correction of %s using one wallet increment', async amount => {
    cloud.records.set(txPath, { ...correction, amount });
    await api.deleteTransaction('auto-id');
    expect(cloud.update).toHaveBeenCalledWith(expect.objectContaining({ path: walletPath }), { balance: { _increment: -amount } });
    expect(cloud.records.get(walletPath).balance).toBe(wallet.balance - amount);
    expect(cloud.records.has(txPath)).toBe(false);
  });

  it('aborts without writes if auth changes or signs out while the wallet is being read', async () => {
    for (const currentUser of [{ uid: 'bob' }, null]) {
      cloud.auth.currentUser = { uid: 'alice' };
      cloud.get.mockImplementationOnce(async () => { cloud.auth.currentUser = currentUser; });
      await expect(api.updateWallet('w1', { balance: -250 }, { expectedBalance: -400, reason: 'Koreksi' })).rejects.toThrow('Sesi');
      expect(cloud.update).not.toHaveBeenCalled();
      expect(cloud.set).not.toHaveBeenCalled();
      expect(cloud.records.get(walletPath)).toEqual(wallet);
    }
  });

  it('increments the signed credit balance and creates one audit entry atomically while preserving live fields', async () => {
    const result = await api.updateWallet('w1', { ...wallet, balance: -250, name: ' BRI baru ' }, { expectedBalance: -400, reason: ' Koreksi saldo ' });
    expect(runTransaction).toHaveBeenCalledOnce();
    expect(updateDoc).not.toHaveBeenCalled();
    expect(writeBatch).not.toHaveBeenCalled();
    expect(cloud.update).toHaveBeenCalledWith(expect.objectContaining({ path: walletPath }), expect.objectContaining({ balance: { _increment: 150 } }));
    expect(cloud.records.get(walletPath)).toEqual({ ...wallet, balance: -250, name: 'BRI baru' });
    expect(result).toEqual({ ...wallet, id: 'w1', balance: -250, name: 'BRI baru' });
    expect(cloud.records.get(txPath)).toMatchObject({ type: 'adjustment', walletId: 'w1', amount: 150, note: 'Koreksi saldo', balanceBefore: -400, balanceAfter: -250, tags: [], categoryId: null, toWalletId: null });
    expect(cloud.commit).toHaveBeenCalledOnce();
  });
});
