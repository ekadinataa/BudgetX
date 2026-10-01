// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { buildBudgetXJson, buildCsvStrings, buildCsvZip } from '../../services/exportService';
import { parseAndValidate, validateEntities, computeAppend, parseCsvZip } from '../../services/importService';
import { BACKUP_ARRAY_KEYS, BACKUP_EXTRA_KEYS, DEFAULT_BACKUP_PREFERENCES, normalizeBackupData, summarizeBackupData } from '../../utils/backupHelpers';
import { DEFAULT_FIRE_SETTINGS } from '../../utils/fireCalculator';

function makeData() {
  return {
    wallets: [{ id: 'w1', name: 'Bank Demo', type: 'bank', balance: 900000, color: '#007AFF', note: '' }],
    transactions: [{ id: 't1', date: '2026-10-01', walletId: 'w1', type: 'expense', categoryId: 'c1', amount: 100000, note: 'Belanja', tags: ['demo'] }],
    categories: [{ id: 'c1', name: 'Belanja', section: 'needs', color: '#007AFF' }],
    budgets: { '2026-10': { totalIncome: 1000000, sections: { needs: { total: 500000, cats: [{ id: 'c1', amt: 400000 }] }, wants: { total: 300000, cats: [] }, savings: { total: 200000, cats: [] } } } },
    recurringItems: [{ id: 'r1', name: 'Sabun', amount: 30000, durationDays: 30, lastPurchaseDate: '2026-09-10', walletId: 'w1', categoryId: 'c1', isActive: true }],
    subscriptions: [{ id: 's1', name: 'Musik', amount: 60000, billingCycle: 'bulanan', nextDueDate: '2026-10-05', walletId: 'w1', isActive: true }],
    debts: [{ id: 'd1', type: 'utang', personName: 'Orang Demo', totalAmount: 500000, remainingAmount: 400000, walletId: 'w1', status: 'active', payments: [{ amount: 100000, principalPart: 100000, date: '2026-09-01', transactionId: 't1' }] }],
    investments: [{ id: 'i1', name: 'Emas Demo', assetType: 'emas', currentValue: 1100000, transactions: [{ id: 'it1', type: 'buy', date: '2026-08-01', units: 1, pricePerUnit: 1000000, totalAmount: 1000000, walletId: 'w1', walletTxId: 't1' }] }],
    fixedAssets: [{ id: 'a1', name: 'Laptop Demo', category: 'elektronik', purchasePrice: 5000000, currentValue: 4000000 }],
    preferences: { ...DEFAULT_BACKUP_PREFERENCES, darkMode: true, cycleStart: 25, salaryAdjust: true, density: 'compact', radius: 'round', collapsed: true, yearMode: true, periodMode: 'range', customRanges: [{ id: 'range1', start: '2026-08-01', end: '2026-10-31' }] },
    fireSettings: { ...DEFAULT_FIRE_SETTINGS, currentAge: 30, currentAssets: 1100000, allocation: { pokok: 50, hiburan: 15, fire: 30, emas: 5 } },
  };
}

describe('Complete JSON backups', () => {
  it('round-trips every collection, nested history, preferences and FIRE without changing balances', () => {
    const data = makeData();
    const parsed = parseAndValidate(JSON.stringify(buildBudgetXJson(data)));
    expect(validateEntities(parsed.data)).toEqual({ valid: true });
    expect(normalizeBackupData(parsed.data)).toEqual(data);
    expect(parsed.data.wallets[0].balance).toBe(900000);
  });

  it('accepts older v1 snapshots and resets absent optional data to defaults', () => {
    const full = makeData();
    const legacy = Object.fromEntries(['wallets', 'transactions', 'categories', 'budgets'].map(key => [key, full[key]]));
    const { data } = parseAndValidate(JSON.stringify(buildBudgetXJson(legacy)));
    expect(validateEntities(data)).toEqual({ valid: true });
    const normalized = normalizeBackupData(data);
    for (const key of BACKUP_EXTRA_KEYS) expect(normalized[key]).toEqual([]);
    expect(normalized.preferences).toEqual(DEFAULT_BACKUP_PREFERENCES);
    expect(normalized.fireSettings).toEqual(DEFAULT_FIRE_SETTINGS);
  });

  it('merges partial older preferences and FIRE allocations with defaults', () => {
    const data = normalizeBackupData({ preferences: { darkMode: true }, fireSettings: { allocation: { fire: 35 } } });
    expect(data.preferences).toEqual({ ...DEFAULT_BACKUP_PREFERENCES, darkMode: true });
    expect(data.fireSettings.allocation).toEqual({ ...DEFAULT_FIRE_SETTINGS.allocation, fire: 35 });
    expect(DEFAULT_FIRE_SETTINGS.allocation.fire).toBe(25);
  });

  it.each(['null', '[]', '{"budgetku":true,"version":"2.0"}', '{"budgetku":true,"version":"1.0","data":{"wallets":[],"transactions":[],"budgets":[],"categories":[]}}'])('rejects an invalid envelope: %s', text => {
    expect(() => parseAndValidate(text)).toThrow();
  });

  it.each(BACKUP_ARRAY_KEYS)('rejects duplicate IDs in %s before a destructive restore', key => {
    const data = makeData();
    data[key].push({ ...data[key][0] });
    expect(validateEntities(data)).toMatchObject({ valid: false, errors: [expect.stringContaining('ID duplikat')] });
  });

  it.each(BACKUP_EXTRA_KEYS)('rejects non-array optional data in %s', key => {
    const data = makeData();
    data[key] = {};
    expect(validateEntities(data).valid).toBe(false);
  });

  it.each([null, [], { id: 'bad/id' }, { id: '' }])('rejects malformed records without throwing: %j', record => {
    const data = makeData();
    data.wallets = [record];
    expect(validateEntities(data).valid).toBe(false);
  });

  it.each([
    data => { data.subscriptions[0].billingCycle = 'monthly'; },
    data => { data.recurringItems[0].durationDays = 0; },
    data => { data.debts[0].payments = {}; },
    data => { data.debts[0].remainingAmount = -1; },
    data => { data.investments[0].transactions[0].units = -1; },
    data => { data.investments[0].currentValue = '100'; },
    data => { data.fixedAssets[0].name = 1; },
    data => { data.fixedAssets[0].currentValue = null; },
    data => { data.preferences.customRanges = [null]; },
    data => { data.preferences.density = 'unknown'; },
    data => { data.fireSettings.allocation = []; },
    data => { data.fireSettings.currentAge = '30'; },
    data => { data.wallets[0].balance = Infinity; },
    data => { data.debts[0].payments[0].note = 'x'.repeat(1001); },
  ])('rejects invalid menu data and nested histories', mutate => {
    const data = makeData();
    mutate(data);
    expect(validateEntities(data).valid).toBe(false);
  });

  it('summarizes all menu collections and optional settings', () => {
    const summary = summarizeBackupData(makeData());
    for (const key of [...BACKUP_ARRAY_KEYS, 'budgets']) expect(summary[key]).toBe(1);
    expect(summary.preferences).toBe(true);
    expect(summary.fireSettings).toBe(true);
    expect(summarizeBackupData({}).fireSettings).toBe(false);
  });
});

describe('Append backups', () => {
  it('adds all new menu records but keeps existing IDs, budgets and settings intact', () => {
    const incoming = makeData();
    const existing = normalizeBackupData({});
    existing.wallets = [{ ...incoming.wallets[0], balance: 123 }];
    const { toAdd, counts } = computeAppend(incoming, existing);
    expect(toAdd.wallets).toEqual([]);
    expect(counts).toEqual({ added: 8, skipped: 1 });
    for (const key of BACKUP_EXTRA_KEYS) expect(toAdd[key]).toEqual(incoming[key]);
    expect(toAdd).not.toHaveProperty('preferences');
    expect(toAdd).not.toHaveProperty('fireSettings');
    expect(existing.wallets[0].balance).toBe(123);
  });

  it('is idempotent for every menu when importing the same file twice', () => {
    const data = makeData();
    const { toAdd, counts } = computeAppend(data, data);
    expect(counts).toEqual({ added: 0, skipped: 9 });
    for (const key of BACKUP_ARRAY_KEYS) expect(toAdd[key]).toEqual([]);
    expect(toAdd.budgets).toEqual({});
  });

  it('does not invent optional collections or settings for a legacy append', () => {
    const { toAdd, counts } = computeAppend({ wallets: [], transactions: [], categories: [], budgets: {} }, makeData());
    expect(toAdd).toEqual({ wallets: [], transactions: [], categories: [], budgets: {} });
    expect(counts).toEqual({ added: 0, skipped: 0 });
  });
});

describe('CSV ZIP backups', () => {
  it('includes readable tables and a lossless complete snapshot', () => {
    const data = makeData();
    const bytes = buildCsvZip(buildCsvStrings(data), data);
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual(['backup.json', 'budgets.csv', 'categories.csv', 'transactions.csv', 'wallets.csv']);
    expect(parseCsvZip(bytes)).toEqual(data);
  });

  it('still imports legacy CSV-only ZIPs', () => {
    const data = makeData();
    const result = parseCsvZip(buildCsvZip(buildCsvStrings(data)));
    expect(validateEntities(result)).toEqual({ valid: true });
    expect(result.wallets).toEqual(data.wallets);
    expect(result.transactions[0]).toMatchObject(data.transactions[0]);
    expect(result).not.toHaveProperty('subscriptions');
  });

  it('does not silently fall back to incomplete CSV when the embedded snapshot is invalid', () => {
    const files = unzipSync(buildCsvZip(buildCsvStrings(makeData())));
    files['backup.json'] = strToU8('{"budgetku":true,"version":"2.0"}');
    expect(() => parseCsvZip(zipSync(files))).toThrow('Versi file tidak kompatibel');
  });
});
