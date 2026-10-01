import { DEFAULT_FIRE_SETTINGS } from './fireCalculator.js';

/** Collections whose records keep their IDs in a JSON backup. */
export const BACKUP_ARRAY_KEYS = [
  'wallets', 'transactions', 'categories', 'recurringItems', 'subscriptions',
  'debts', 'investments', 'fixedAssets',
];

export const BACKUP_EXTRA_KEYS = BACKUP_ARRAY_KEYS.slice(3);

export const BACKUP_COLLECTION_LABELS = {
  wallets: 'dompet', transactions: 'transaksi', budgets: 'anggaran',
  categories: 'kategori', recurringItems: 'item berkala', subscriptions: 'langganan',
  debts: 'utang/piutang', investments: 'investasi', fixedAssets: 'aset tetap',
};

export const DEFAULT_BACKUP_PREFERENCES = {
  darkMode: false, cycleStart: 1, salaryAdjust: false, page: 'dashboard',
  periodMode: 'month', customRanges: [], density: 'standard', radius: 'soft',
  collapsed: false, yearMode: false,
};

/** Missing optional fields in older v1 backups restore to their defaults. */
export function normalizeBackupData(data) {
  return {
    ...Object.fromEntries(BACKUP_ARRAY_KEYS.map(key => [key, data[key] || []])),
    budgets: data.budgets || {},
    preferences: { ...DEFAULT_BACKUP_PREFERENCES, ...data.preferences },
    fireSettings: {
      ...DEFAULT_FIRE_SETTINGS,
      ...data.fireSettings,
      allocation: { ...DEFAULT_FIRE_SETTINGS.allocation, ...data.fireSettings?.allocation },
    },
  };
}

export function summarizeBackupData(data) {
  return {
    ...Object.fromEntries(BACKUP_ARRAY_KEYS.map(key => [key, (data[key] || []).length])),
    budgets: Object.keys(data.budgets || {}).length,
    preferences: data.preferences !== undefined,
    fireSettings: data.fireSettings !== undefined,
  };
}
