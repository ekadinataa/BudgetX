import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  await waitFor(() => expect(document.querySelector('.navItem[data-page="settings"]')).toBeTruthy());
  fireEvent.click(document.querySelector('.navItem[data-page="settings"]'));
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
  it('replaces every menu, reloads cloud preferences, and exports the complete state again', async () => {
    render(<App />);
    const data = structuredClone(demoBackup.data);
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

  it('rejects malformed optional data before deleting or writing cloud records', async () => {
    render(<App />);
    await upload({ ...demoBackup.data, subscriptions: {} });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Data tidak valid'));
    expect(api.resetUserData).not.toHaveBeenCalled();
    expect(api.migrateData).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
