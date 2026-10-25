import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import demoBackup from '../../../public/demo/budgetx-demo-agustus-oktober-2026.json';
import { BACKUP_ARRAY_KEYS, normalizeBackupData } from '../../utils/backupHelpers';

const store = vi.hoisted(() => ({ data: {}, user: { uid: 'backup-test-user', email: 'demo@example.com' } }));

vi.mock('../../config/firebase', () => ({ auth: { currentUser: store.user }, db: {} }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: store.user, loading: false, logout: vi.fn() }),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args) => ({ path: args.slice(1).join('/') })),
  getDoc: vi.fn(async () => ({ exists: () => Boolean(store.data.fireSettings), data: () => store.data.fireSettings })),
  setDoc: vi.fn(async () => {}),
}));
vi.mock('../../services/firestoreService', () => ({
  subscribeWishlistGroups: vi.fn((uid, onData) => {
    store.wishlistHandler = onData;
    onData(store.data.wishlistGroups || []);
    return () => { store.wishlistHandler = null; };
  }),
  subscribeUserData: vi.fn((uid, handlers) => {
    store.handlers = handlers;
    for (const key of ['wallets', 'transactions', 'categories']) handlers[key](store.data[key] || []);
    return () => { store.handlers = null; };
  }),
  initUser: vi.fn(async () => {}),
  getWallets: vi.fn(async () => store.data.wallets || []),
  getTransactions: vi.fn(async () => store.data.transactions || []),
  getBudgets: vi.fn(async () => store.data.budgets || {}),
  getCategories: vi.fn(async () => store.data.categories || []),
  getRecurringItems: vi.fn(async () => store.data.recurringItems || []),
  getSubscriptions: vi.fn(async () => store.data.subscriptions || []),
  getDebts: vi.fn(async () => store.data.debts || []),
  getInvestments: vi.fn(async () => store.data.investments || []),
  getFixedAssets: vi.fn(async () => store.data.fixedAssets || []),
  getPreferences: vi.fn(async () => store.data.preferences),
  updatePreferences: vi.fn(async prefs => { store.data.preferences = prefs; }),
  resetUserData: vi.fn(async () => { store.data = {}; }),
  migrateData: vi.fn(async data => {
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        const records = new Map((store.data[key] || []).map(record => [record.id, record]));
        for (const record of value) records.set(record.id, record);
        store.data[key] = [...records.values()];
      } else if (key === 'budgets') store.data.budgets = { ...store.data.budgets, ...value };
      else store.data[key] = value;
    }
    for (const key of ['wallets', 'transactions', 'categories']) store.handlers?.[key](store.data[key] || []);
    store.wishlistHandler?.(store.data.wishlistGroups || []);
  }),
}));
vi.mock('../../services/exportService', async importOriginal => ({
  ...await importOriginal(),
  downloadJson: vi.fn(),
  downloadCsvZip: vi.fn(),
}));

import App from '../../App';
import * as api from '../../services/firestoreService';
import { downloadJson } from '../../services/exportService';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  store.data = normalizeBackupData({ categories: demoBackup.data.categories });
});

async function openSettings() {
  await waitFor(() => expect(document.querySelector('.railButton[aria-label="Pengaturan"]')).toBeTruthy());
  fireEvent.click(document.querySelector('.railButton[aria-label="Pengaturan"]'));
  await screen.findByRole('heading', { name: 'Pengaturan' });
}

async function upload(data) {
  await openSettings();
  const file = new File([JSON.stringify({ budgetku: true, version: '1.0', data })], 'backup.json', { type: 'application/json' });
  fireEvent.change(document.querySelector('input[accept=".json,.zip"]'), { target: { files: [file] } });
}

async function importBackup(data, mode) {
  await upload(data);
  await screen.findByRole('dialog', { name: 'Impor Data' });
  fireEvent.click(screen.getByRole('button', { name: mode === 'replace' ? /Ganti Semua/ : /Gabungkan/ }));
  await waitFor(() => expect(api.migrateData).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByText('Memuat data...')).not.toBeInTheDocument());
}

describe('Authenticated App backup integration (mocked cloud; no network writes)', () => {
  it('blocks complete export until the current Wishlist snapshot arrives, then includes its embedded items', async () => {
    store.data.wishlistGroups = structuredClone(demoBackup.data.wishlistGroups);
    let receive;
    api.subscribeWishlistGroups.mockImplementationOnce((_uid, onData) => { receive = onData; return vi.fn(); });
    render(<App />);
    await openSettings();
    expect(screen.getByRole('button', { name: 'Ekspor', exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor', exact: true }));
    expect(downloadJson).not.toHaveBeenCalled();
    expect(screen.getByText(/Memuat wishlist untuk cadangan/)).toBeInTheDocument();
    await act(async () => receive(store.data.wishlistGroups));
    expect(screen.getByRole('button', { name: 'Ekspor', exact: true })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor', exact: true }));
    expect(downloadJson.mock.calls[0][0].data.wishlistGroups).toEqual(store.data.wishlistGroups);
  });
  it('blocks complete export on listener failure and retries Wishlist sync without exporting an empty fallback', async () => {
    store.data.wishlistGroups = structuredClone(demoBackup.data.wishlistGroups);
    let fail;
    api.subscribeWishlistGroups.mockImplementationOnce((_uid, _onData, onError) => { fail = onError; return vi.fn(); });
    render(<App />);
    await openSettings();
    await act(async () => fail(new Error('permission-denied')));
    expect(screen.getByRole('button', { name: 'Ekspor', exact: true })).toBeDisabled();
    expect(screen.getByText(/Cadangan lengkap dan Append wishlist belum tersedia/)).toBeInTheDocument();
    expect(downloadJson).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Coba Lagi Sinkronisasi Wishlist' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ekspor', exact: true })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor', exact: true }));
    expect(downloadJson.mock.calls[0][0].data.wishlistGroups).toEqual(store.data.wishlistGroups);
  });
  it('replaces every menu, reloads cloud preferences, and exports the complete state again', async () => {
    render(<App />);
    const data = normalizeBackupData(structuredClone(demoBackup.data));
    Object.assign(data.preferences, { darkMode: true, density: 'compact', radius: 'round', collapsed: true, yearMode: true });
    await importBackup(data, 'replace');
    expect(api.resetUserData).toHaveBeenCalledWith({ initializeDefaults: false });
    expect(api.initUser).toHaveBeenCalledTimes(1);
    expect(api.migrateData).toHaveBeenCalledWith(data);
    expect(document.documentElement.dataset).toMatchObject({ theme: 'dark', density: 'compact', radius: 'round', collapsed: 'true' });
    await openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor', exact: true }));
    const exported = downloadJson.mock.calls[0][0].data;
    for (const key of BACKUP_ARRAY_KEYS) expect(exported[key]).toEqual(data[key]);
    expect(exported.budgets).toEqual(data.budgets);
    expect(exported.fireSettings).toEqual(data.fireSettings);
    expect(exported.preferences).toEqual({ ...data.preferences, page: 'settings' });
  });

  it('clears absent optional collections and resets settings when replacing a legacy v1 backup', async () => {
    store.data = structuredClone(demoBackup.data);
    render(<App />);
    const legacy = Object.fromEntries(['wallets', 'transactions', 'categories', 'budgets'].map(key => [key, demoBackup.data[key]]));
    await importBackup(legacy, 'replace');
    expect(api.migrateData).toHaveBeenCalledWith(normalizeBackupData(legacy));
    for (const key of ['recurringItems', 'subscriptions', 'debts', 'investments', 'fixedAssets']) expect(store.data[key]).toEqual([]);
    await openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor', exact: true }));
    expect(downloadJson.mock.calls[0][0].data.fireSettings).toEqual(normalizeBackupData({}).fireSettings);
  });

  it('appends optional menu records while preserving an existing wallet and settings', async () => {
    store.data.wallets = [{ ...demoBackup.data.wallets[0], balance: 123 }];
    store.data.preferences = { ...store.data.preferences, page: 'settings', darkMode: true, density: 'relaxed' };
    store.data.fireSettings.currentAssets = 42;
    const originalPreferences = structuredClone(store.data.preferences);
    render(<App />);
    await importBackup(demoBackup.data, 'append');
    expect(api.resetUserData).not.toHaveBeenCalled();
    const payload = api.migrateData.mock.calls[0][0];
    expect(payload.wallets).toHaveLength(3);
    expect(payload).not.toHaveProperty('preferences');
    expect(payload).not.toHaveProperty('fireSettings');
    expect(store.data.wallets.find(wallet => wallet.id === 'demo-w-bank').balance).toBe(123);
    expect(store.data.preferences).toEqual(originalPreferences);
    expect(store.data.fireSettings.currentAssets).toBe(42);
    for (const key of ['recurringItems', 'subscriptions', 'debts', 'investments', 'fixedAssets']) expect(store.data[key]).toEqual(demoBackup.data[key]);
  });

  it.each([
    ['oversized UTF-8', '界'.repeat(501)],
    ['reserved', '__reserved__'],
    ['reserved multiline', '__a\nb__'],
  ])('rejects %s Wishlist group document IDs before offering cloud restore', async (_label, invalidId) => {
    const invalidGroup = structuredClone(demoBackup.data.wishlistGroups[0]);
    invalidGroup.id = invalidId;
    for (const item of invalidGroup.items) item.groupId = invalidId;
    render(<App />);
    await upload({ ...demoBackup.data, wishlistGroups: [invalidGroup] });
    // FileReader is asynchronous and may be delayed by parallel Chrome suites.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Data tidak valid'), { timeout: 5000 });
    expect(api.resetUserData).not.toHaveBeenCalled();
    expect(api.migrateData).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Impor Data' })).not.toBeInTheDocument();
  });

  it('rejects malformed optional data before deleting or writing cloud records', async () => {
    render(<App />);
    await upload({ ...demoBackup.data, subscriptions: {} });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Data tidak valid'), { timeout: 5000 });
    expect(api.resetUserData).not.toHaveBeenCalled();
    expect(api.migrateData).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
