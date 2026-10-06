/**
 * Import Service — Pure functions for parsing, validating, and computing
 * import operations for BudgetX data.
 *
 * No React or Firestore dependencies. Accepts data as arguments, returns results.
 */

import {
  validateWallet,
  validateTransaction,
  validateBudget,
  validateCategory,
  validatePreference,
  validateCustomRange,
} from './validator.js';
import { unzipSync } from 'fflate';
import { validateDebt } from './debtValidator.js';
import { validateInvestment, validateInvestmentTransaction } from './investmentValidator.js';
import { validateFixedAsset } from './fixedAssetValidator.js';
import { BACKUP_ARRAY_KEYS, BACKUP_EXTRA_KEYS, BACKUP_COLLECTION_LABELS, normalizeBackupData } from '../utils/backupHelpers.js';

const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isBackupId = id => typeof id === 'string' && id.trim() !== '' && !id.includes('/') && id !== '.' && id !== '..';
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

// Imported nested histories must also respect Firestore's finite numbers and text limits.
function validateBackupValues(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) return 'Angka harus terhingga';
  if (typeof value === 'string' && value.length > 1000) return 'Teks melebihi 1000 karakter';
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const error = validateBackupValues(item);
      if (error) return error;
    }
  }
  return null;
}

/**
 * Parse a JSON string and validate it as BudgetX_Format v1.
 * Returns the parsed data payload or throws with a descriptive error.
 *
 * Validation steps:
 * 1. Valid JSON
 * 2. budgetku === true marker
 * 3. version === "1.0"
 * 4. data object with required keys (wallets, transactions, budgets, categories)
 *
 * @param {string} jsonString - Raw file content
 * @returns {{ data: Object, version: string, exportedAt: string }}
 * @throws {Error} Descriptive validation error
 */
export function parseAndValidate(jsonString) {
  // Step 1: Parse JSON
  let obj;
  try {
    obj = JSON.parse(jsonString);
  } catch {
    throw new Error('File bukan JSON yang valid');
  }

  // Step 2: Check BudgetX marker
  if (!obj || typeof obj !== 'object' || obj.budgetku !== true) {
    throw new Error('Bukan file ekspor BudgetX');
  }

  // Step 3: Check version compatibility
  if (obj.version !== '1.0') {
    throw new Error('Versi file tidak kompatibel dengan aplikasi ini');
  }

  // Step 4: Check data structure
  const data = obj.data;
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !Array.isArray(data.wallets) ||
    !Array.isArray(data.transactions) ||
    !data.budgets ||
    typeof data.budgets !== 'object' ||
    Array.isArray(data.budgets) ||
    !Array.isArray(data.categories)
  ) {
    throw new Error('Struktur data tidak valid');
  }

  return {
    data: obj.data,
    version: obj.version,
    exportedAt: obj.exportedAt,
  };
}

/**
 * Validate all entities in the import data against existing validators.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 *
 * @param {{ wallets: Array, transactions: Array, budgets: Object, categories: Array }} data
 * @returns {{ valid: boolean, errors?: string[] }}
 */
export function validateEntities(data) {
  const errors = [];
  if (!isRecord(data)) return { valid: false, errors: ['Struktur data tidak valid'] };

  for (const key of BACKUP_ARRAY_KEYS) {
    if (data[key] === undefined) continue;
    const label = BACKUP_COLLECTION_LABELS[key];
    if (!Array.isArray(data[key])) {
      errors.push(`${label}: harus berupa daftar`);
      continue;
    }
    const ids = new Set();
    data[key].forEach((record, i) => {
      if (!isRecord(record) || !isBackupId(record.id)) errors.push(`${label} #${i + 1}: ID tidak valid`);
      else if (ids.has(record.id)) errors.push(`${label} #${i + 1}: ID duplikat`);
      ids.add(record?.id);
    });
  }
  if (data.budgets !== undefined) {
    if (!isRecord(data.budgets)) errors.push('Anggaran harus berupa objek');
    else for (const [key, budget] of Object.entries(data.budgets)) {
      if (!isBackupId(key) || !isRecord(budget)) errors.push(`Anggaran ${key}: struktur tidak valid`);
    }
  }
  const valueError = validateBackupValues(data);
  if (valueError) errors.push(valueError);
  // Do not pass malformed records to the form validators below.
  if (errors.length) return { valid: false, errors };

  // Validate wallets
  if (Array.isArray(data.wallets)) {
    data.wallets.forEach((wallet, i) => {
      const err = ('outstanding' in wallet || 'availableLimit' in wallet)
        ? 'Outstanding dan limit tersedia harus dihitung, bukan disimpan'
        : validateWallet(wallet);
      if (err) errors.push(`Dompet #${i + 1}: ${err}`);
    });
  }

  // Validate transactions
  if (Array.isArray(data.transactions)) {
    data.transactions.forEach((tx, i) => {
      const err = validateTransaction(tx);
      if (err) errors.push(`Transaksi #${i + 1}: ${err}`);
    });
  }

  // Validate budgets
  if (data.budgets && typeof data.budgets === 'object') {
    for (const [monthKey, budget] of Object.entries(data.budgets)) {
      const err = validateBudget(budget);
      if (err) errors.push(`Anggaran ${monthKey}: ${err}`);
    }
  }

  // Validate categories
  if (Array.isArray(data.categories)) {
    data.categories.forEach((cat, i) => {
      const err = validateCategory(cat);
      if (err) errors.push(`Kategori #${i + 1}: ${err}`);
    });
  }

  const checkOptionalRecord = (key, record) => {
    if (record.isActive !== undefined && typeof record.isActive !== 'boolean') return 'Status aktif harus boolean';
    if (record.tags !== undefined && (!Array.isArray(record.tags) || record.tags.some(tag => typeof tag !== 'string'))) return 'Tag harus berupa daftar teks';
    if (key === 'debts') {
      const err = validateDebt(record);
      if (err) return err;
      if (!Number.isFinite(record.remainingAmount) || record.remainingAmount < 0 || record.remainingAmount > record.totalAmount) return 'Sisa utang/piutang tidak valid';
      if (record.payments !== undefined && (!Array.isArray(record.payments) || record.payments.some(payment => !isRecord(payment) || !Number.isFinite(payment.amount) || payment.amount <= 0 || !isDate(payment.date)))) return 'Riwayat pembayaran tidak valid';
      return null;
    }
    if (typeof record.name !== 'string' || !record.name.trim()) return 'Nama wajib diisi';
    if (key === 'investments') {
      const err = validateInvestment(record);
      if (err) return err;
      if (record.currentValue !== undefined && (!Number.isFinite(record.currentValue) || record.currentValue < 0)) return 'Nilai investasi tidak valid';
      if (record.transactions !== undefined && (!Array.isArray(record.transactions) || record.transactions.some(tx => !isRecord(tx) || !['buy', 'sell'].includes(tx.type) || !isDate(tx.date) || validateInvestmentTransaction(tx, tx.type) || !Number.isFinite(tx.totalAmount) || tx.totalAmount <= 0))) return 'Riwayat investasi tidak valid';
      return null;
    }
    if (key === 'fixedAssets') {
      if (!Number.isFinite(record.purchasePrice) || !Number.isFinite(record.currentValue)) return 'Nilai aset harus berupa angka';
      return validateFixedAsset(record);
    }
    if (!Number.isFinite(record.amount) || record.amount <= 0) return 'Jumlah harus lebih dari 0';
    if (key === 'recurringItems' && (!Number.isFinite(record.durationDays) || record.durationDays <= 0)) return 'Durasi harus lebih dari 0';
    if (key === 'recurringItems' && record.lastPurchaseDate && !isDate(record.lastPurchaseDate)) return 'Tanggal pembelian tidak valid';
    if (key === 'subscriptions' && (!['bulanan', 'tahunan', 'mingguan'].includes(record.billingCycle) || !isDate(record.nextDueDate))) return 'Siklus atau tanggal tagihan tidak valid';
    return null;
  };
  for (const key of BACKUP_EXTRA_KEYS) {
    if (data[key] === undefined) continue;
    data[key].forEach((record, i) => {
      const err = checkOptionalRecord(key, record);
      if (err) errors.push(`${BACKUP_COLLECTION_LABELS[key]} #${i + 1}: ${err}`);
    });
  }
  if (data.preferences !== undefined) {
    if (!data.preferences || typeof data.preferences !== 'object' || Array.isArray(data.preferences)) errors.push('Preferensi tidak valid');
    else {
      const err = validatePreference(normalizeBackupData(data).preferences);
      if (err) errors.push(`Preferensi: ${err}`);
      else for (const range of data.preferences.customRanges || []) {
        if (!isRecord(range) || !isBackupId(range.id) || validateCustomRange(range)) errors.push('Preferensi: periode khusus tidak valid');
      }
    }
  }
  if (data.fireSettings !== undefined) {
    const settings = data.fireSettings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) errors.push('Setelan FIRE tidak valid');
    else {
      for (const key of ['currentAge', 'retirementAge', 'monthlyIncome', 'monthlyExpenses', 'currentAssets', 'returnRate', 'salaryGrowth', 'inflation', 'postRetirementReturn']) {
        if (settings[key] !== undefined && (!Number.isFinite(settings[key]) || settings[key] < 0)) errors.push(`FIRE: ${key} tidak valid`);
      }
      if (settings.allocation !== undefined && (!settings.allocation || typeof settings.allocation !== 'object' || Array.isArray(settings.allocation) || Object.values(settings.allocation).some(v => !Number.isFinite(v) || v < 0 || v > 100))) errors.push('FIRE: alokasi tidak valid');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

/**
 * Compute the result of an append operation.
 * Compares IDs between import data and existing data, returning only
 * items whose IDs are NOT in the existing data.
 *
 * For budgets: compares month keys instead of IDs.
 *
 * @param {{ wallets: Array, transactions: Array, budgets: Object, categories: Array }} importData
 * @param {{ wallets: Array, transactions: Array, budgets: Object, categories: Array }} existingData
 * @returns {{ toAdd: { wallets: Array, transactions: Array, categories: Array, budgets: Object }, counts: { added: number, skipped: number } }}
 */
export function computeAppend(importData, existingData) {
  const existingWalletIds = new Set((existingData.wallets || []).map((w) => w.id));
  const existingTxIds = new Set((existingData.transactions || []).map((t) => t.id));
  const existingCatIds = new Set((existingData.categories || []).map((c) => c.id));
  const existingBudgetKeys = new Set(Object.keys(existingData.budgets || {}));

  const newWallets = (importData.wallets || []).filter((w) => !existingWalletIds.has(w.id));
  const newTransactions = (importData.transactions || []).filter((t) => !existingTxIds.has(t.id));
  const newCategories = (importData.categories || []).filter((c) => !existingCatIds.has(c.id));

  const newBudgets = {};
  for (const [monthKey, budget] of Object.entries(importData.budgets || {})) {
    if (!existingBudgetKeys.has(monthKey)) {
      newBudgets[monthKey] = budget;
    }
  }

  const totalImport =
    (importData.wallets || []).length +
    (importData.transactions || []).length +
    (importData.categories || []).length +
    Object.keys(importData.budgets || {}).length;

  const added =
    newWallets.length +
    newTransactions.length +
    newCategories.length +
    Object.keys(newBudgets).length;

  const skipped = totalImport - added;

  const extraToAdd = {};
  let extraAdded = 0;
  let extraSkipped = 0;
  for (const key of BACKUP_EXTRA_KEYS) {
    if (importData[key] === undefined) continue;
    const ids = new Set((existingData[key] || []).map(item => item.id));
    extraToAdd[key] = importData[key].filter(item => !ids.has(item.id));
    extraAdded += extraToAdd[key].length;
    extraSkipped += importData[key].length - extraToAdd[key].length;
  }

  return {
    toAdd: {
      wallets: newWallets,
      transactions: newTransactions,
      categories: newCategories,
      budgets: newBudgets,
      ...extraToAdd,
    },
    counts: { added: added + extraAdded, skipped: skipped + extraSkipped },
  };
}

// ── Wallet CSV Import ─────────────────────────────────────────────────

/**
 * Color palette for auto-assigned wallet colors.
 */
const WALLET_COLORS = [
  '#F59E0B', '#3B82F6', '#8B5CF6', '#EF4444', '#06B6D4',
  '#EC4899', '#F97316', '#EAB308', '#A855F7', '#14B8A6',
  '#64748B', '#22C55E', '#10B981', '#059669', '#6366F1',
  '#DC2626', '#16A34A', '#2563EB', '#9333EA', '#0891B2',
];

/**
 * Map wallet Tipe column values to internal type names.
 */
const WALLET_TYPE_MAP = {
  'bank': 'bank',
  'e-wallet': 'ewallet',
  'kartu kredit': 'credit',
  'paylater': 'paylater',
  'tunai': 'cash',
};

/**
 * Parse a wallet CSV file and convert rows into BudgetX wallet objects.
 *
 * Expected CSV columns: Nama, Tipe, Saldo, Catatan
 *
 * - Tipe values: Bank, E-Wallet, Kartu Kredit, PayLater, Tunai → mapped to internal types
 * - Auto-generates ID for each wallet (e.g., `w_csv_${timestamp}_${index}`)
 * - Auto-assigns a color from the palette based on index
 *
 * @param {string} csvString - Raw CSV file content
 * @returns {{ wallets: Array<{ id: string, name: string, type: string, balance: number, color: string, note: string }> }}
 * @throws {Error} If CSV is empty or has missing required columns
 */
export function parseWalletCsv(csvString) {
  const rows = parseCsv(csvString);
  if (rows.length === 0) {
    throw new Error('File CSV kosong atau tidak memiliki data');
  }

  // Validate required columns
  const requiredColumns = ['Nama', 'Tipe', 'Saldo'];
  const firstRow = rows[0];
  const missingColumns = requiredColumns.filter((col) => !(col in firstRow));
  if (missingColumns.length > 0) {
    throw new Error(`Kolom CSV tidak lengkap: ${missingColumns.join(', ')}`);
  }

  const baseTimestamp = Date.now();
  const wallets = rows.map((row, index) => {
    const tipe = (row['Tipe'] || '').trim().toLowerCase();
    return {
      id: `w_csv_${baseTimestamp}_${index}`,
      name: (row['Nama'] || '').trim(),
      type: WALLET_TYPE_MAP[tipe] || 'bank',
      balance: parseFloat(row['Saldo']) || 0,
      color: WALLET_COLORS[index % WALLET_COLORS.length],
      note: (row['Catatan'] || '').trim(),
    };
  });

  return { wallets };
}

// ── Budget CSV Import ─────────────────────────────────────────────────

/**
 * Map Bagian column values to internal section names for budget CSV.
 */
const BUDGET_SECTION_MAP = {
  'kebutuhan': 'needs',
  'keinginan': 'wants',
  'tabungan': 'savings',
};

/**
 * Parse a budget CSV file and convert rows into BudgetX budget objects.
 *
 * Expected CSV columns: Periode, Total Pemasukan, Bagian, Kategori, Alokasi
 *
 * - Bagian values: Kebutuhan→needs, Keinginan→wants, Tabungan→savings
 * - Kategori is matched to existing categories by name (case-insensitive)
 * - If a category name is not found, creates a new category
 * - Groups rows by Periode to build the budget object
 *
 * @param {string} csvString - Raw CSV file content
 * @param {Array<{ id: string, name: string, section: string, color: string }>} existingCategories - Current categories
 * @returns {{ budgets: Object, newCategories: Array }}
 * @throws {Error} If CSV is empty or has missing required columns
 */
export function parseBudgetCsv(csvString, existingCategories) {
  const rows = parseCsv(csvString);
  if (rows.length === 0) {
    throw new Error('File CSV kosong atau tidak memiliki data');
  }

  // Validate required columns
  const requiredColumns = ['Periode', 'Total Pemasukan', 'Bagian', 'Kategori', 'Alokasi'];
  const firstRow = rows[0];
  const missingColumns = requiredColumns.filter((col) => !(col in firstRow));
  if (missingColumns.length > 0) {
    throw new Error(`Kolom CSV tidak lengkap: ${missingColumns.join(', ')}`);
  }

  // Build category name → category lookup (case-insensitive)
  const catByNameLower = {};
  for (const c of existingCategories) {
    catByNameLower[c.name.toLowerCase()] = c;
  }

  // Track new categories to create
  const newCategories = [];
  const newCatMap = {}; // key: "name|section" → category object
  let colorIndex = 0;

  const BUDGET_CAT_COLORS = [
    '#F59E0B', '#3B82F6', '#8B5CF6', '#EF4444', '#06B6D4',
    '#EC4899', '#F97316', '#EAB308', '#A855F7', '#14B8A6',
    '#64748B', '#22C55E', '#10B981', '#059669', '#6366F1',
    '#DC2626', '#16A34A', '#2563EB', '#9333EA', '#0891B2',
  ];

  /**
   * Look up or create a category for the given Kategori name + Bagian.
   */
  function resolveCategoryId(kategoriName, bagian) {
    const nameTrimmed = (kategoriName || '').trim();
    if (!nameTrimmed) return null;

    // Check existing categories (case-insensitive)
    const existing = catByNameLower[nameTrimmed.toLowerCase()];
    if (existing) return existing.id;

    // Check already-created new categories
    const section = BUDGET_SECTION_MAP[bagian.trim().toLowerCase()] || 'needs';
    const key = `${nameTrimmed.toLowerCase()}|${section}`;
    if (newCatMap[key]) return newCatMap[key].id;

    // Create new category
    const newCat = {
      id: `c_csv_${Date.now()}_${newCategories.length}`,
      name: nameTrimmed,
      section,
      color: BUDGET_CAT_COLORS[colorIndex % BUDGET_CAT_COLORS.length],
    };
    colorIndex++;
    newCategories.push(newCat);
    newCatMap[key] = newCat;
    catByNameLower[nameTrimmed.toLowerCase()] = newCat;
    return newCat.id;
  }

  // Group rows by Periode to build budget objects
  const budgets = {};
  for (const row of rows) {
    const periode = (row['Periode'] || '').trim();
    if (!periode) continue;

    const totalIncome = parseFloat(row['Total Pemasukan']) || 0;
    const bagian = (row['Bagian'] || '').trim();
    const kategori = (row['Kategori'] || '').trim();
    const alokasi = parseFloat(row['Alokasi']) || 0;

    if (!budgets[periode]) {
      budgets[periode] = {
        totalIncome,
        sections: {
          needs: { total: 0, cats: [] },
          wants: { total: 0, cats: [] },
          savings: { total: 0, cats: [] },
        },
      };
    }

    const section = BUDGET_SECTION_MAP[bagian.toLowerCase()] || 'needs';
    const catId = resolveCategoryId(kategori, bagian);

    if (catId && budgets[periode].sections[section]) {
      budgets[periode].sections[section].cats.push({ id: catId, amt: alokasi });
    }
  }

  // Compute section totals from category allocations
  for (const budget of Object.values(budgets)) {
    for (const sec of Object.values(budget.sections)) {
      sec.total = sec.cats.reduce((sum, c) => sum + c.amt, 0);
    }
  }

  return { budgets, newCategories };
}

// ── Single-file CSV Transaction Import ────────────────────────────────

/**
 * Color palette for auto-created categories.
 */
const CATEGORY_COLORS = [
  '#F59E0B', '#3B82F6', '#8B5CF6', '#EF4444', '#06B6D4',
  '#EC4899', '#F97316', '#EAB308', '#A855F7', '#14B8A6',
  '#64748B', '#22C55E', '#10B981', '#059669', '#6366F1',
  '#DC2626', '#16A34A', '#2563EB', '#9333EA', '#0891B2',
];

/**
 * Map Kategori column values to internal section names.
 */
const SECTION_MAP = {
  'Kebutuhan': 'needs',
  'Keinginan': 'wants',
  'Tabungan': 'savings',
  'Pemasukan': 'income',
  'Penyesuaian Saldo': 'income',
};

/**
 * Map Tipe column values to internal transaction types.
 */
const TYPE_MAP = {
  'EXPENSE': 'expense',
  'INCOME': 'income',
  'TRANSFER': 'transfer',
};

/**
 * Parse a single-file CSV of transactions (e.g. from Budget Money Tracker export)
 * and convert rows into BudgetX transaction objects.
 *
 * Expected CSV columns: Tanggal, Tipe, Jumlah, Kategori, Sub Kategori, Dompet, Ke Dompet, Catatan
 *
 * - Wallet names are matched by exact name (case-sensitive) against existingWallets.
 *   If any wallet name is not found, throws an Error listing the missing names.
 * - Categories are matched by Sub Kategori name (case-insensitive) against existingCategories.
 *   If a Sub Kategori is not found, a new category entry is created using the Kategori column
 *   to determine the section.
 * - Transfer rows (Tipe === "TRANSFER") get categoryId = null.
 *
 * @param {string} csvString - Raw CSV file content
 * @param {Array<{ id: string, name: string }>} existingWallets - Current wallets in the app
 * @param {Array<{ id: string, name: string, section: string }>} existingCategories - Current categories
 * @returns {{ transactions: Array, newCategories: Array }}
 * @throws {Error} If CSV is empty, has missing columns, or wallet names don't match
 */
export function parseTransactionCsv(csvString, existingWallets, existingCategories) {
  const rows = parseCsv(csvString);
  if (rows.length === 0) {
    throw new Error('File CSV kosong atau tidak memiliki data');
  }

  // Validate required columns exist
  const requiredColumns = ['Tanggal', 'Tipe', 'Jumlah', 'Dompet'];
  const firstRow = rows[0];
  const missingColumns = requiredColumns.filter((col) => !(col in firstRow));
  if (missingColumns.length > 0) {
    throw new Error(`Kolom CSV tidak lengkap: ${missingColumns.join(', ')}`);
  }

  // Build wallet name → id lookup (case-sensitive exact match)
  const walletByName = {};
  for (const w of existingWallets) {
    walletByName[w.name] = w.id;
  }

  // Collect all wallet names referenced in CSV
  const csvWalletNames = new Set();
  for (const row of rows) {
    const dompet = (row['Dompet'] || '').trim();
    const keDompet = (row['Ke Dompet'] || '').trim();
    if (dompet) csvWalletNames.add(dompet);
    if (keDompet) csvWalletNames.add(keDompet);
  }

  // Check for unmatched wallet names
  const unmatchedWallets = [];
  for (const name of csvWalletNames) {
    if (!(name in walletByName)) {
      unmatchedWallets.push(name);
    }
  }
  if (unmatchedWallets.length > 0) {
    throw new Error(
      `Dompet tidak ditemukan: ${unmatchedWallets.join(', ')}. Buat dompet tersebut terlebih dahulu.`
    );
  }

  // Build category name → category lookup (case-insensitive)
  const catByNameLower = {};
  for (const c of existingCategories) {
    catByNameLower[c.name.toLowerCase()] = c;
  }

  // Track new categories to create
  const newCategories = [];
  // Key: "subKategori|section" (lowercase subKategori) → category object
  const newCatMap = {};
  let colorIndex = 0;

  /**
   * Look up or create a category for the given Sub Kategori + Kategori.
   * Returns the category id, or null for transfers.
   */
  function resolveCategoryId(subKategori, kategori, isTransfer) {
    if (isTransfer || !subKategori) return null;

    const subTrimmed = subKategori.trim();
    if (!subTrimmed) return null;

    // Check existing categories (case-insensitive)
    const existing = catByNameLower[subTrimmed.toLowerCase()];
    if (existing) return existing.id;

    // Check already-created new categories
    const section = SECTION_MAP[kategori.trim()] || 'needs';
    const key = `${subTrimmed.toLowerCase()}|${section}`;
    if (newCatMap[key]) return newCatMap[key].id;

    // Create new category
    const newCat = {
      id: `c_csv_${Date.now()}_${newCategories.length}`,
      name: subTrimmed,
      section,
      color: CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length],
    };
    colorIndex++;
    newCategories.push(newCat);
    newCatMap[key] = newCat;
    // Also add to lookup so subsequent rows find it
    catByNameLower[subTrimmed.toLowerCase()] = newCat;
    return newCat.id;
  }

  // Map each row to a transaction
  const baseTimestamp = Date.now();
  const transactions = rows.map((row, index) => {
    const tipe = (row['Tipe'] || '').trim();
    const isTransfer = tipe === 'TRANSFER';
    const type = TYPE_MAP[tipe] || 'expense';
    const dompet = (row['Dompet'] || '').trim();
    const keDompet = (row['Ke Dompet'] || '').trim();
    const subKategori = (row['Sub Kategori'] || '').trim();
    const kategori = (row['Kategori'] || '').trim();

    return {
      id: `tx_${baseTimestamp}_${index}`,
      date: (row['Tanggal'] || '').trim(),
      walletId: walletByName[dompet] || '',
      type,
      categoryId: resolveCategoryId(subKategori, kategori, isTransfer),
      amount: Math.abs(parseFloat(row['Jumlah']) || 0),
      note: (row['Catatan'] || '').trim(),
      tags: [],
      toWalletId: isTransfer && keDompet ? (walletByName[keDompet] || null) : null,
    };
  });

  return { transactions, newCategories };
}

// ── CSV Import ───────────────────────────────────────────────────────

/**
 * Parse a CSV string into an array of objects using the first row as headers.
 * Handles quoted fields (with commas, newlines, and escaped quotes inside).
 *
 * @param {string} csvString - Raw CSV content (may include UTF-8 BOM)
 * @returns {Array<Object>} Array of row objects keyed by header names
 */
export function parseCsv(csvString) {
  // Strip UTF-8 BOM if present
  const content = csvString.startsWith('\uFEFF') ? csvString.slice(1) : csvString;

  const rows = [];
  let current = '';
  let inQuotes = false;
  const lines = [];

  // Split into lines respecting quoted fields
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') i++; // skip \r\n
      if (current.length > 0 || lines.length > 0) {
        lines.push(current);
      }
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0) lines.push(current);

  if (lines.length === 0) return [];

  // Parse header
  const headers = parseRow(lines[0]);

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(obj);
  }

  return rows;
}

/**
 * Parse a single CSV row into an array of field values.
 * @param {string} line
 * @returns {string[]}
 */
function parseRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Parse a CSV ZIP file (Uint8Array) and reconstruct BudgetX data objects.
 * Prefers backup.json when present; legacy ZIPs contain four CSV tables.
 *
 * @param {Uint8Array} zipBytes - The ZIP file content
 * @returns {{ wallets: Array, transactions: Array, budgets: Object, categories: Array }}
 * @throws {Error} If ZIP is invalid or required files are missing
 */
export function parseCsvZip(zipBytes) {
  let files;
  try {
    files = unzipSync(zipBytes);
  } catch {
    throw new Error('File ZIP tidak valid');
  }

  const decoder = new TextDecoder('utf-8');
  // New ZIP exports include the complete snapshot alongside readable CSV tables.
  // Older CSV-only backups continue to use the reconstruction below.
  if (files['backup.json']) return parseAndValidate(decoder.decode(files['backup.json'])).data;
  const requiredFiles = ['wallets.csv', 'transactions.csv', 'budgets.csv', 'categories.csv'];

  for (const f of requiredFiles) {
    if (!files[f]) {
      throw new Error(`File "${f}" tidak ditemukan dalam ZIP`);
    }
  }

  // Parse wallets (headers: ID,Nama,Tipe,Saldo,Warna,Catatan)
  const walletsRaw = parseCsv(decoder.decode(files['wallets.csv']));
  const walletTypeLabelReverse = { 'Bank': 'bank', 'E-Wallet': 'ewallet', 'Kartu Kredit': 'credit', 'PayLater': 'paylater', 'Tunai': 'cash' };
  const wallets = walletsRaw.map((row) => ({
    id: row.ID || row.id,
    name: row.Nama || row.name,
    type: walletTypeLabelReverse[row.Tipe] || row.Tipe || row.type,
    balance: parseFloat(row.Saldo || row.balance) || 0,
    color: row.Warna || row.color,
    note: row.Catatan || row.note || '',
    ...Object.fromEntries([['creditLimit', row.Plafon ?? row.creditLimit], ['heldAmount', row.Hold ?? row.heldAmount]]
      .filter(([, value]) => value !== undefined && value.trim() !== '')
      .map(([field, value]) => [field, Number(value)])),
  }));
  for (const wallet of wallets) {
    const error = validateWallet(wallet);
    if (error) throw new Error(error);
  }

  // Parse transactions (headers: ID,Tanggal,Dompet,Tipe,Kategori,Jumlah,Catatan,Tag,Dompet Tujuan,_walletId,_categoryId,_toWalletId)
  const txRaw = parseCsv(decoder.decode(files['transactions.csv']));
  const typeLabelReverse = { 'Pemasukan': 'income', 'Pengeluaran': 'expense', 'Transfer': 'transfer' };
  const transactions = txRaw.map((row) => ({
    id: row.ID || row.id,
    date: row.Tanggal || row.date,
    walletId: row._walletId || row.walletId,
    type: typeLabelReverse[row.Tipe] || row.Tipe || row.type,
    categoryId: (row._categoryId || row.categoryId) || null,
    amount: parseFloat(row.Jumlah || row.amount) || 0,
    note: row.Catatan || row.note || '',
    tags: (row.Tag || row.tags) ? (row.Tag || row.tags).split('|').filter(Boolean) : [],
    toWalletId: (row['_toWalletId'] || row.toWalletId) || null,
  }));

  // Parse categories (headers: ID,Nama,Bagian,Warna)
  const catsRaw = parseCsv(decoder.decode(files['categories.csv']));
  const sectionLabelReverse = { 'Kebutuhan': 'needs', 'Keinginan': 'wants', 'Tabungan': 'savings', 'Pemasukan': 'income' };
  const categories = catsRaw.map((row) => ({
    id: row.ID || row.id,
    name: row.Nama || row.name,
    section: sectionLabelReverse[row.Bagian] || row.Bagian || row.section,
    color: row.Warna || row.color,
  }));

  // Parse budgets (headers: Periode,Total Pemasukan,Bagian,Kategori,Alokasi,_categoryId)
  const budgetsRaw = parseCsv(decoder.decode(files['budgets.csv']));
  const budgets = {};
  for (const row of budgetsRaw) {
    const mk = row.Periode || row.monthKey;
    if (!mk) continue;
    if (!budgets[mk]) {
      budgets[mk] = {
        totalIncome: parseFloat(row['Total Pemasukan'] || row.totalIncome) || 0,
        sections: {
          needs: { total: 0, cats: [] },
          wants: { total: 0, cats: [] },
          savings: { total: 0, cats: [] },
        },
      };
    }
    const sectionLabel = row.Bagian || row.section;
    const section = sectionLabelReverse[sectionLabel] || sectionLabel;
    const catId = row._categoryId || row.categoryId;
    const amt = parseFloat(row.Alokasi || row.allocatedAmount) || 0;
    if (section && budgets[mk].sections[section] && catId) {
      budgets[mk].sections[section].cats.push({ id: catId, amt });
    }
  }
  // Compute section totals from category allocations
  for (const budget of Object.values(budgets)) {
    for (const sec of Object.values(budget.sections)) {
      sec.total = sec.cats.reduce((sum, c) => sum + c.amt, 0);
    }
  }

  return { wallets, transactions, budgets, categories };
}
