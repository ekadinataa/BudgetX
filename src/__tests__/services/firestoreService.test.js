import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase/firestore SDK ──────────────────────────────────────────────

const mockBatch = {
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
};

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args) => ({ _path: args.slice(1).join('/'), _type: 'collection' })),
  doc: vi.fn((...args) => {
    // doc(db, ...pathSegments) or doc(collectionRef) for auto-id
    if (args[0]?._type === 'collection') {
      // doc(collectionRef) — auto-ID
      return { _path: args[0]._path + '/auto-id', id: 'auto-id', _type: 'doc' };
    }
    return { _path: args.slice(1).join('/'), id: args[args.length - 1], _type: 'doc' };
  }),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(() => mockBatch),
  increment: vi.fn((val) => ({ _type: 'increment', value: val })),
  query: vi.fn((...args) => args[0]),
  where: vi.fn((field, op, val) => ({ _type: 'where', field, op, val })),
  limit: vi.fn((n) => ({ _type: 'limit', n })),
}));

// ── Mock firebase config ─────────────────────────────────────────────────────

vi.mock('../../config/firebase', () => ({
  db: { _type: 'firestore' },
  auth: {
    currentUser: { uid: 'test-user-123' },
  },
}));

// ── Mock defaults ────────────────────────────────────────────────────────────

vi.mock('../../data/defaults', () => ({
  CATEGORIES: Array.from({ length: 18 }, (_, i) => ({
    id: `c${i + 1}`,
    name: `Category ${i + 1}`,
    section: i < 6 ? 'needs' : i < 11 ? 'wants' : i < 14 ? 'savings' : 'income',
    color: '#FF0000',
  })),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import {
  getWallets,
  createWallet,
  updateWallet,
  deleteWallet,
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getBudgets,
  updateBudget,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getPreferences,
  updatePreferences,
  migrateData,
  initUser,
  resetUserData,
} from '../../services/firestoreService.js';

import {
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc as fsDeleteDoc,
  setDoc,
  writeBatch,
  doc,
  collection,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { BACKUP_ARRAY_KEYS, BACKUP_EXTRA_KEYS, normalizeBackupData } from '../../utils/backupHelpers';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDocsSnapshot(docs) {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      data: () => {
        const { id, ...rest } = d;
        return rest;
      },
    })),
    empty: docs.length === 0,
  };
}

function makeDocSnapshot(data, exists = true) {
  return {
    exists: () => exists,
    data: () => data,
  };
}

// ── Reset mocks before each test ─────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockBatch.set.mockClear();
  mockBatch.update.mockClear();
  mockBatch.delete.mockClear();
  mockBatch.commit.mockResolvedValue(undefined);
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. API Compatibility — all 18 function names exported
// Validates: Requirements 12.1
// ══════════════════════════════════════════════════════════════════════════════

describe('API compatibility', () => {
  it('exports all 18 expected function names', async () => {
    const mod = await import('../../services/firestoreService.js');
    const expected = [
      'getWallets', 'createWallet', 'updateWallet', 'deleteWallet',
      'getTransactions', 'createTransaction', 'updateTransaction', 'deleteTransaction',
      'getBudgets', 'updateBudget',
      'getCategories', 'createCategory', 'updateCategory', 'deleteCategory',
      'getPreferences', 'updatePreferences',
      'migrateData', 'initUser',
    ];
    for (const name of expected) {
      expect(typeof mod[name]).toBe('function');
    }
  });

  it('does not export setTokenGetter', async () => {
    const mod = await import('../../services/firestoreService.js');
    expect(mod.setTokenGetter).toBeUndefined();
  });

  it('does not export ApiError', async () => {
    const mod = await import('../../services/firestoreService.js');
    expect(mod.ApiError).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. No backend dependency
// Validates: Requirements 10.1, 10.2
// ══════════════════════════════════════════════════════════════════════════════

describe('No backend dependency', () => {
  it('source code does not reference VITE_API_URL', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync('src/services/firestoreService.js', 'utf-8');
    expect(source).not.toContain('VITE_API_URL');
  });

  it('source code does not use fetch()', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync('src/services/firestoreService.js', 'utf-8');
    // Check for fetch calls but not the word "fetch" in comments
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  it('source code does not export setTokenGetter', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync('src/services/firestoreService.js', 'utf-8');
    expect(source).not.toContain('setTokenGetter');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Wallet CRUD
// Validates: Requirements 2.1–2.5
// ══════════════════════════════════════════════════════════════════════════════

describe('Wallet CRUD', () => {
  it('getWallets returns array with ids from Firestore docs', async () => {
    getDocs.mockResolvedValueOnce(
      makeDocsSnapshot([
        { id: 'w1', name: 'BCA', type: 'bank', balance: 1000, color: '#FF0000', note: '' },
        { id: 'w2', name: 'GoPay', type: 'ewallet', balance: 500, color: '#00FF00', note: '' },
      ])
    );

    const result = await getWallets();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'w1', name: 'BCA', type: 'bank', balance: 1000, color: '#FF0000', note: '' });
    expect(result[1].id).toBe('w2');
    expect(collection).toHaveBeenCalled();
  });

  it('createWallet validates then calls addDoc with correct data', async () => {
    addDoc.mockResolvedValueOnce({ id: 'new-w' });

    const data = { name: 'Test', type: 'cash', balance: 0, color: '#AABBCC', note: 'hi' };
    const result = await createWallet(data);

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('new-w');
    expect(result.name).toBe('Test');
    expect(result.type).toBe('cash');
    expect(result.balance).toBe(0);
  });

  it('createWallet rejects invalid data without calling addDoc', async () => {
    await expect(createWallet({ name: '', type: 'bank', balance: 0, color: '#FF0000' }))
      .rejects.toThrow();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('updateWallet validates then calls updateDoc', async () => {
    updateDoc.mockResolvedValueOnce(undefined);

    const data = { name: 'Updated', type: 'bank', balance: 500, color: '#112233' };
    const result = await updateWallet('w1', data);

    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('w1');
    expect(result.name).toBe('Updated');
  });

  it('deleteWallet calls deleteDoc and returns success', async () => {
    fsDeleteDoc.mockResolvedValueOnce(undefined);

    const result = await deleteWallet('w1');

    expect(fsDeleteDoc).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Transaction CRUD with atomic balance adjustment
// Validates: Requirements 3.1–3.8
// ══════════════════════════════════════════════════════════════════════════════

describe('Transaction CRUD', () => {
  const validExpenseTx = {
    date: '2025-04-19',
    walletId: 'w1',
    type: 'expense',
    categoryId: 'c1',
    amount: 50000,
    note: 'Lunch',
    tags: ['food'],
  };

  const validIncomeTx = {
    date: '2025-04-01',
    walletId: 'w1',
    type: 'income',
    categoryId: 'c15',
    amount: 12000000,
    note: 'Salary',
    tags: ['rutin'],
  };

  const validTransferTx = {
    date: '2025-04-10',
    walletId: 'w1',
    type: 'transfer',
    categoryId: null,
    amount: 200000,
    note: 'Top up',
    tags: [],
    toWalletId: 'w2',
  };

  describe('getTransactions', () => {
    it('returns transactions from Firestore', async () => {
      getDocs.mockResolvedValueOnce(
        makeDocsSnapshot([
          { id: 't1', date: '2025-04-01', walletId: 'w1', type: 'income', categoryId: 'c15', amount: 100, note: 'Test', tags: [] },
        ])
      );

      const result = await getTransactions();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('t1');
    });

    it('applies in-memory date range filters', async () => {
      getDocs.mockResolvedValueOnce(
        makeDocsSnapshot([
          { id: 't1', date: '2025-03-01', walletId: 'w1', type: 'income', categoryId: 'c15', amount: 100, note: 'March', tags: [] },
          { id: 't2', date: '2025-04-15', walletId: 'w1', type: 'expense', categoryId: 'c1', amount: 50, note: 'April', tags: [] },
          { id: 't3', date: '2025-05-01', walletId: 'w1', type: 'income', categoryId: 'c15', amount: 200, note: 'May', tags: [] },
        ])
      );

      const result = await getTransactions({ startDate: '2025-04-01', endDate: '2025-04-30' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('t2');
    });

    it('applies in-memory tag filter', async () => {
      getDocs.mockResolvedValueOnce(
        makeDocsSnapshot([
          { id: 't1', date: '2025-04-01', walletId: 'w1', type: 'expense', categoryId: 'c1', amount: 50, note: 'A', tags: ['food'] },
          { id: 't2', date: '2025-04-02', walletId: 'w1', type: 'expense', categoryId: 'c2', amount: 30, note: 'B', tags: ['transport'] },
        ])
      );

      const result = await getTransactions({ tag: 'food' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('t1');
    });

    it('applies in-memory search filter on note', async () => {
      getDocs.mockResolvedValueOnce(
        makeDocsSnapshot([
          { id: 't1', date: '2025-04-01', walletId: 'w1', type: 'expense', categoryId: 'c1', amount: 50, note: 'Lunch at cafe', tags: [] },
          { id: 't2', date: '2025-04-02', walletId: 'w1', type: 'expense', categoryId: 'c2', amount: 30, note: 'Bus ticket', tags: [] },
        ])
      );

      const result = await getTransactions({ search: 'lunch' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('t1');
    });

    it('uses Firestore where() for walletId filter', async () => {
      getDocs.mockResolvedValueOnce(makeDocsSnapshot([]));

      await getTransactions({ walletId: 'w1' });
      expect(where).toHaveBeenCalledWith('walletId', '==', 'w1');
    });
  });

  describe('createTransaction', () => {
    it('creates expense with batch: set tx + decrement wallet balance', async () => {
      const result = await createTransaction(validExpenseTx);

      expect(writeBatch).toHaveBeenCalledTimes(1);
      expect(mockBatch.set).toHaveBeenCalledTimes(1);
      // Source wallet update with negative increment (expense)
      expect(mockBatch.update).toHaveBeenCalledTimes(1);
      const updateCall = mockBatch.update.mock.calls[0];
      expect(updateCall[1].balance).toEqual({ _type: 'increment', value: -50000 });
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
      expect(result.id).toBeDefined();
      expect(result.type).toBe('expense');
    });

    it('creates income with batch: set tx + increment wallet balance', async () => {
      await createTransaction(validIncomeTx);

      expect(mockBatch.set).toHaveBeenCalledTimes(1);
      expect(mockBatch.update).toHaveBeenCalledTimes(1);
      const updateCall = mockBatch.update.mock.calls[0];
      expect(updateCall[1].balance).toEqual({ _type: 'increment', value: 12000000 });
    });

    it('creates transfer with batch: set tx + decrement source + increment destination', async () => {
      await createTransaction(validTransferTx);

      expect(mockBatch.set).toHaveBeenCalledTimes(1);
      // Two updates: source wallet and destination wallet
      expect(mockBatch.update).toHaveBeenCalledTimes(2);

      const sourceUpdate = mockBatch.update.mock.calls[0];
      expect(sourceUpdate[1].balance).toEqual({ _type: 'increment', value: -200000 });

      const destUpdate = mockBatch.update.mock.calls[1];
      expect(destUpdate[1].balance).toEqual({ _type: 'increment', value: 200000 });
    });

    it('rejects invalid transaction without writing', async () => {
      await expect(createTransaction({ ...validExpenseTx, amount: -100 }))
        .rejects.toThrow();
      expect(writeBatch).not.toHaveBeenCalled();
    });
  });

  describe('updateTransaction', () => {
    it('reverses old effects and applies new effects in batch', async () => {
      // Mock reading the old transaction
      getDoc.mockResolvedValueOnce(
        makeDocSnapshot({
          date: '2025-04-19',
          walletId: 'w1',
          type: 'expense',
          categoryId: 'c1',
          amount: 50000,
          note: 'Old',
          tags: [],
          toWalletId: null,
        })
      );

      const newData = {
        date: '2025-04-20',
        walletId: 'w1',
        type: 'expense',
        categoryId: 'c1',
        amount: 75000,
        note: 'Updated',
        tags: ['food'],
      };

      const result = await updateTransaction('t1', newData);

      expect(getDoc).toHaveBeenCalledTimes(1);
      expect(mockBatch.update).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('t1');
      expect(result.amount).toBe(75000);
    });

    it('handles transfer-to-expense update reversing destination wallet', async () => {
      // Old transaction was a transfer
      getDoc.mockResolvedValueOnce(
        makeDocSnapshot({
          date: '2025-04-10',
          walletId: 'w1',
          type: 'transfer',
          categoryId: null,
          amount: 200000,
          note: 'Transfer',
          tags: [],
          toWalletId: 'w2',
        })
      );

      const newData = {
        date: '2025-04-10',
        walletId: 'w1',
        type: 'expense',
        categoryId: 'c1',
        amount: 100000,
        note: 'Changed to expense',
        tags: [],
      };

      await updateTransaction('t1', newData);

      // Should have: update tx doc, reverse old source, reverse old dest, apply new source
      // That's 1 update for tx + 1 reverse old source + 1 reverse old dest + 1 apply new source = 4 updates
      expect(mockBatch.update).toHaveBeenCalledTimes(4);
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteTransaction', () => {
    it('reads tx, deletes it, and reverses balance effect in batch', async () => {
      getDoc.mockResolvedValueOnce(
        makeDocSnapshot({
          date: '2025-04-19',
          walletId: 'w1',
          type: 'expense',
          categoryId: 'c1',
          amount: 50000,
          note: 'Lunch',
          tags: [],
          toWalletId: null,
        })
      );

      const result = await deleteTransaction('t1');

      expect(getDoc).toHaveBeenCalledTimes(1);
      expect(mockBatch.delete).toHaveBeenCalledTimes(1);
      // Reverse expense: increment by +50000 (negate the -50000 effect)
      expect(mockBatch.update).toHaveBeenCalledTimes(1);
      const updateCall = mockBatch.update.mock.calls[0];
      expect(updateCall[1].balance).toEqual({ _type: 'increment', value: 50000 });
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true });
    });

    it('reverses transfer effects on both wallets when deleting', async () => {
      getDoc.mockResolvedValueOnce(
        makeDocSnapshot({
          date: '2025-04-10',
          walletId: 'w1',
          type: 'transfer',
          categoryId: null,
          amount: 200000,
          note: 'Transfer',
          tags: [],
          toWalletId: 'w2',
        })
      );

      await deleteTransaction('t1');

      expect(mockBatch.delete).toHaveBeenCalledTimes(1);
      // Two updates: reverse source and reverse destination
      expect(mockBatch.update).toHaveBeenCalledTimes(2);

      // Reverse source: negate(-(-200000)) = -200000... wait, let me think:
      // Original transfer effect on source: -200000
      // Reverse: -(-200000) = +200000
      const sourceUpdate = mockBatch.update.mock.calls[0];
      expect(sourceUpdate[1].balance).toEqual({ _type: 'increment', value: 200000 });

      // Reverse destination: -(+200000) = -200000
      const destUpdate = mockBatch.update.mock.calls[1];
      expect(destUpdate[1].balance).toEqual({ _type: 'increment', value: -200000 });
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Budget operations
// Validates: Requirements 4.1–4.4
// ══════════════════════════════════════════════════════════════════════════════

describe('Budget operations', () => {
  it('getBudgets returns object keyed by month key', async () => {
    getDocs.mockResolvedValueOnce(
      makeDocsSnapshot([
        {
          id: '2025-04',
          totalIncome: 12000000,
          sections: {
            needs: { total: 6000000, cats: [] },
            wants: { total: 3600000, cats: [] },
            savings: { total: 2400000, cats: [] },
          },
        },
        {
          id: '2025-03',
          totalIncome: 10000000,
          sections: {
            needs: { total: 5000000, cats: [] },
            wants: { total: 3000000, cats: [] },
            savings: { total: 2000000, cats: [] },
          },
        },
      ])
    );

    const result = await getBudgets();

    expect(typeof result).toBe('object');
    expect(Array.isArray(result)).toBe(false);
    expect(result['2025-04']).toBeDefined();
    expect(result['2025-04'].totalIncome).toBe(12000000);
    expect(result['2025-03']).toBeDefined();
    expect(result['2025-03'].totalIncome).toBe(10000000);
  });

  it('updateBudget validates then calls setDoc', async () => {
    setDoc.mockResolvedValueOnce(undefined);

    const data = {
      totalIncome: 5000000,
      sections: {
        needs: { total: 2500000, cats: [{ id: 'c1', amt: 1000000 }] },
        wants: { total: 1500000, cats: [] },
        savings: { total: 1000000, cats: [] },
      },
    };

    const result = await updateBudget('2025-04', data);

    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(result.totalIncome).toBe(5000000);
    expect(result.sections).toBeDefined();
  });

  it('updateBudget rejects invalid data without calling setDoc', async () => {
    await expect(updateBudget('2025-04', { totalIncome: -1, sections: {} }))
      .rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Category CRUD
// Validates: Requirements 5.1–5.5
// ══════════════════════════════════════════════════════════════════════════════

describe('Category CRUD', () => {
  it('getCategories returns array with ids', async () => {
    getDocs.mockResolvedValueOnce(
      makeDocsSnapshot([
        { id: 'c1', name: 'Food', section: 'needs', color: '#FF0000' },
        { id: 'c2', name: 'Transport', section: 'needs', color: '#0000FF' },
      ])
    );

    const result = await getCategories();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'c1', name: 'Food', section: 'needs', color: '#FF0000' });
  });

  it('createCategory validates then calls addDoc', async () => {
    addDoc.mockResolvedValueOnce({ id: 'new-c' });

    const result = await createCategory({ name: 'Hobi', section: 'wants', color: '#AABB00' });

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('new-c');
    expect(result.name).toBe('Hobi');
  });

  it('createCategory rejects invalid data', async () => {
    await expect(createCategory({ name: '', section: 'wants', color: '#AABB00' }))
      .rejects.toThrow();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('updateCategory validates then calls updateDoc', async () => {
    updateDoc.mockResolvedValueOnce(undefined);

    const result = await updateCategory('c1', { name: 'Updated', section: 'needs', color: '#112233' });

    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('c1');
    expect(result.name).toBe('Updated');
  });

  it('deleteCategory calls deleteDoc and returns success', async () => {
    fsDeleteDoc.mockResolvedValueOnce(undefined);

    const result = await deleteCategory('c1');

    expect(fsDeleteDoc).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Preferences
// Validates: Requirements 6.1–6.4
// ══════════════════════════════════════════════════════════════════════════════

describe('Preferences', () => {
  it('getPreferences returns doc data when it exists', async () => {
    getDoc.mockResolvedValueOnce(
      makeDocSnapshot({ darkMode: true, cycleStart: 15, page: 'budget' })
    );

    const result = await getPreferences();

    expect(result).toEqual({ darkMode: true, cycleStart: 15, page: 'budget' });
  });

  it('getPreferences returns defaults when doc does not exist', async () => {
    getDoc.mockResolvedValueOnce(makeDocSnapshot(null, false));

    const result = await getPreferences();

    expect(result).toEqual({ darkMode: false, cycleStart: 1, salaryAdjust: false, page: 'dashboard', periodMode: 'month', customRanges: [] });
  });

  it('updatePreferences validates then calls setDoc', async () => {
    setDoc.mockResolvedValueOnce(undefined);

    const data = { darkMode: true, cycleStart: 5, page: 'transactions', salaryAdjust: true };
    const result = await updatePreferences(data);

    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ...data, periodMode: 'month', customRanges: [] });
  });

  it('updatePreferences defaults salaryAdjust to false when omitted', async () => {
    setDoc.mockResolvedValueOnce(undefined);

    const data = { darkMode: true, cycleStart: 5, page: 'transactions' };
    const result = await updatePreferences(data);

    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(result.salaryAdjust).toBe(false);
  });

  it('updatePreferences rejects invalid data without calling setDoc', async () => {
    await expect(updatePreferences({ darkMode: 'yes', cycleStart: 1, page: 'dashboard' }))
      .rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('persists appearance and dashboard preferences with merge semantics', async () => {
    const data = normalizeBackupData({ preferences: { density: 'compact', radius: 'round', collapsed: true, yearMode: true } }).preferences;
    await updatePreferences(data);
    expect(setDoc).toHaveBeenCalledWith(expect.objectContaining({ _path: 'users/test-user-123/preferences/prefs' }), data, { merge: true });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. initUser
// Validates: Requirements 8.1–8.5
// ══════════════════════════════════════════════════════════════════════════════

describe('initUser', () => {
  it('skips initialization when categories already exist', async () => {
    getDocs.mockResolvedValueOnce(
      makeDocsSnapshot([{ id: 'c1', name: 'Food', section: 'needs', color: '#FF0000' }])
    );

    const result = await initUser();

    expect(result.initialized).toBe(false);
    expect(result.message).toContain('already');
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('creates 18 default categories + preferences when empty', async () => {
    getDocs.mockResolvedValueOnce(makeDocsSnapshot([]));
    getDoc.mockResolvedValueOnce(makeDocSnapshot(null, false));

    const result = await initUser();

    expect(result.initialized).toBe(true);
    expect(writeBatch).toHaveBeenCalledTimes(1);
    // 18 categories + 1 preferences = 19 batch.set calls
    expect(mockBatch.set).toHaveBeenCalledTimes(19);
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);
  });

  it('uses limit(1) query to check for existing categories', async () => {
    getDocs.mockResolvedValueOnce(makeDocsSnapshot([]));
    getDoc.mockResolvedValueOnce(makeDocSnapshot(null, false));

    await initUser();

    expect(limit).toHaveBeenCalledWith(1);
    expect(query).toHaveBeenCalled();
  });

  it('does not re-seed an intentionally empty snapshot after a backup restore', async () => {
    getDocs.mockResolvedValueOnce(makeDocsSnapshot([]));
    getDoc.mockResolvedValueOnce(makeDocSnapshot(normalizeBackupData({}).preferences));
    expect((await initUser()).initialized).toBe(false);
    expect(writeBatch).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. migrateData
// Validates: Requirements 9.2–9.4
// ══════════════════════════════════════════════════════════════════════════════

describe('migrateData', () => {
  it('restores every collection, nested histories, preferences and FIRE at the original paths', async () => {
    const data = normalizeBackupData({
      wallets: [{ id: 'w_demo', balance: 900000 }],
      transactions: [{ id: 't_demo', amount: 100000, type: 'expense', walletId: 'w_demo' }],
      ...Object.fromEntries(BACKUP_EXTRA_KEYS.map(key => [key, [{ id: `${key}_demo`, history: [{ transactionId: 't_demo' }] }]])),
      preferences: { darkMode: true, density: 'compact' },
      fireSettings: { currentAssets: 2000000 },
    });
    const result = await migrateData(data);
    expect(result.imported).toBe(9);
    for (const key of BACKUP_EXTRA_KEYS) {
      expect(mockBatch.set).toHaveBeenCalledWith(
        expect.objectContaining({ _path: `users/test-user-123/${key}/${key}_demo` }),
        { history: [{ transactionId: 't_demo' }] },
      );
    }
    expect(mockBatch.set).toHaveBeenCalledWith(expect.objectContaining({ _path: 'users/test-user-123/preferences/prefs' }), data.preferences);
    expect(mockBatch.set).toHaveBeenCalledWith(expect.objectContaining({ _path: 'users/test-user-123/preferences/fire' }), data.fireSettings);
    expect(mockBatch.set).toHaveBeenCalledWith(expect.objectContaining({ _path: 'users/test-user-123/wallets/w_demo' }), { balance: 900000 });
    expect(mockBatch.update).not.toHaveBeenCalled();
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('chunks additional menu records and settings at the same 500-write boundary', async () => {
    mockBatch.commit.mockImplementationOnce(async () => {
      expect(mockBatch.set).toHaveBeenCalledTimes(500);
    });
    const data = normalizeBackupData({
      recurringItems: Array.from({ length: 300 }, (_, i) => ({ id: `r${i}` })),
      subscriptions: Array.from({ length: 300 }, (_, i) => ({ id: `s${i}` })),
    });
    expect((await migrateData(data)).imported).toBe(602);
    expect(writeBatch).toHaveBeenCalledTimes(2);
    expect(mockBatch.commit).toHaveBeenCalledTimes(2);
    expect(mockBatch.set).toHaveBeenCalledTimes(602);
  });

  it('preserves original IDs as document IDs', async () => {
    // Mock getDoc for preferences check
    getDoc.mockResolvedValueOnce(makeDocSnapshot(null, false));

    const data = {
      wallets: [{ id: 'w1', name: 'BCA', type: 'bank', balance: 1000, color: '#FF0000', note: '' }],
      transactions: [{ id: 't1', date: '2025-04-01', walletId: 'w1', type: 'income', categoryId: 'c15', amount: 100, note: 'Test', tags: [] }],
      budgets: { '2025-04': { totalIncome: 100, sections: { needs: { total: 50, cats: [] }, wants: { total: 30, cats: [] }, savings: { total: 20, cats: [] } } } },
      categories: [{ id: 'c1', name: 'Food', section: 'needs', color: '#FF0000' }],
    };

    const result = await migrateData(data);

    expect(result.success).toBe(true);
    // 1 wallet + 1 transaction + 1 budget + 1 category + 1 preferences = 5
    expect(result.imported).toBe(5);

    // Verify doc() was called with original IDs
    expect(doc).toHaveBeenCalledWith(
      expect.anything(), 'users', 'test-user-123', 'wallets', 'w1'
    );
    expect(doc).toHaveBeenCalledWith(
      expect.anything(), 'users', 'test-user-123', 'transactions', 't1'
    );
    expect(doc).toHaveBeenCalledWith(
      expect.anything(), 'users', 'test-user-123', 'categories', 'c1'
    );
  });

  it('chunks batches at 500 operations', async () => {
    getDoc.mockResolvedValueOnce(makeDocSnapshot(null, false));

    // Create 600 wallets to force 2 batches (600 + 1 prefs = 601 ops → 2 batches)
    const wallets = Array.from({ length: 600 }, (_, i) => ({
      id: `w${i}`,
      name: `Wallet ${i}`,
      type: 'bank',
      balance: 0,
      color: '#FF0000',
      note: '',
    }));

    const result = await migrateData({
      wallets,
      transactions: [],
      budgets: {},
      categories: [],
    });

    expect(result.success).toBe(true);
    // 600 wallets + 1 preferences = 601 operations
    expect(result.imported).toBe(601);
    // 601 / 500 = 2 batches
    expect(writeBatch).toHaveBeenCalledTimes(2);
    expect(mockBatch.commit).toHaveBeenCalledTimes(2);
  });

  it('skips preferences creation when prefs already exist', async () => {
    getDoc.mockResolvedValueOnce(
      makeDocSnapshot({ darkMode: false, cycleStart: 1, page: 'dashboard' }, true)
    );

    const result = await migrateData({
      wallets: [{ id: 'w1', name: 'BCA', type: 'bank', balance: 0, color: '#FF0000', note: '' }],
      transactions: [],
      budgets: {},
      categories: [],
    });

    // Only 1 wallet, no preferences
    expect(result.imported).toBe(1);
  });
});

describe('Backup replacement reset', () => {
  it('deletes all collections without injecting default records before a restore', async () => {
    const keys = [...BACKUP_ARRAY_KEYS, 'preferences', 'budgets'];
    for (let i = 0; i < keys.length; i++) {
      getDocs.mockResolvedValueOnce({ docs: [{ ref: { _path: `users/test-user-123/${keys[i]}/old` } }] });
    }
    await resetUserData({ initializeDefaults: false });
    expect(getDocs).toHaveBeenCalledTimes(10);
    expect(mockBatch.delete).toHaveBeenCalledTimes(10);
    expect(mockBatch.set).not.toHaveBeenCalled();
  });

  it('keeps the normal reset behavior of recreating default categories', async () => {
    for (let i = 0; i < 11; i++) getDocs.mockResolvedValueOnce(makeDocsSnapshot([]));
    getDoc.mockResolvedValueOnce(makeDocSnapshot(null, false));
    await resetUserData();
    expect(mockBatch.set).toHaveBeenCalledTimes(19);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. Error handling
// Validates: Requirements 11.1–11.4
// ══════════════════════════════════════════════════════════════════════════════

describe('Error handling', () => {
  it('wraps read errors with operation type and collection context', async () => {
    getDocs.mockRejectedValueOnce(new Error('permission-denied'));

    await expect(getWallets()).rejects.toThrow('Failed to read wallets');
  });

  it('wraps write errors with operation type context', async () => {
    addDoc.mockRejectedValueOnce(new Error('quota-exceeded'));

    await expect(
      createWallet({ name: 'Test', type: 'cash', balance: 0, color: '#AABBCC' })
    ).rejects.toThrow('Failed to create wallet');
  });

  it('wraps batch errors with batch operation context', async () => {
    mockBatch.commit.mockRejectedValueOnce(new Error('network-error'));

    await expect(
      createTransaction({
        date: '2025-04-19',
        walletId: 'w1',
        type: 'expense',
        categoryId: 'c1',
        amount: 50000,
        note: 'Test',
        tags: [],
      })
    ).rejects.toThrow('Batch operation failed');
  });

  it('wraps delete errors with context', async () => {
    fsDeleteDoc.mockRejectedValueOnce(new Error('not-found'));

    await expect(deleteWallet('w999')).rejects.toThrow('Failed to delete wallet');
  });

  it('wraps category read errors with context', async () => {
    getDocs.mockRejectedValueOnce(new Error('unavailable'));

    await expect(getCategories()).rejects.toThrow('Failed to read categories');
  });

  it('wraps budget read errors with context', async () => {
    getDocs.mockRejectedValueOnce(new Error('unavailable'));

    await expect(getBudgets()).rejects.toThrow('Failed to read budgets');
  });

  it('wraps preferences read errors with context', async () => {
    getDoc.mockRejectedValueOnce(new Error('unavailable'));

    await expect(getPreferences()).rejects.toThrow('Failed to read preferences');
  });

  it('errors are standard Error objects with message property', async () => {
    getDocs.mockRejectedValueOnce(new Error('test-error'));

    try {
      await getWallets();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(typeof err.message).toBe('string');
      expect(err.message).toContain('test-error');
    }
  });
});
