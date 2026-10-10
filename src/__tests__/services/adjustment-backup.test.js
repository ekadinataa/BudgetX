import { describe, expect, it } from 'vitest';
import { buildBudgetXJson, buildCsvStrings, buildCsvZip } from '../../services/exportService';
import { parseAndValidate, parseCsv, parseCsvZip, parseTransactionCsv, validateEntities } from '../../services/importService';

const wallet = { id: 'w1', name: 'BCA', type: 'bank', balance: 75000, color: '#112233', note: '' };
const adjustment = { id: 'a1', date: '2026-10-10', walletId: 'w1', type: 'adjustment', categoryId: null, amount: -25000, balanceBefore: 100000, balanceAfter: 75000, note: 'Koreksi, hasil cek rekening', tags: [], toWalletId: null };
const snapshot = (tx = adjustment) => ({ wallets: [wallet], transactions: [tx], budgets: {}, categories: [] });

describe('wallet adjustment backup', () => {
  it.each([-25000, 25000])('roundtrips signed adjustments in JSON and complete ZIP with entity validation (%s)', (amount) => {
    const tx = { ...adjustment, amount, balanceAfter: 100000 + amount, note: 'Koreksi "rekening", hasil cek\nbaris kedua' };
    const data = snapshot(tx);
    const restoredJson = parseAndValidate(JSON.stringify(buildBudgetXJson(data))).data;
    const restoredZip = parseCsvZip(buildCsvZip(buildCsvStrings(data), data));
    for (const restored of [restoredJson, restoredZip]) {
      expect(restored.transactions).toEqual([tx]);
      expect(validateEntities(restored)).toEqual({ valid: true });
    }
    expect(parseCsvZip(buildCsvZip(buildCsvStrings(data))).transactions).toEqual([tx]);
  });
  it('preserves zero and negative historical balances in CSV-only adjustment backups', () => {
    const tx = { ...adjustment, balanceBefore: 0, balanceAfter: -25000 };
    const restored = parseCsvZip(buildCsvZip(buildCsvStrings(snapshot(tx))));
    expect(restored.transactions).toEqual([tx]);
    expect(validateEntities(restored)).toEqual({ valid: true });
  });
  it('rejects invalid CSV adjustment audit data through entity validation', () => {
    for (const patch of [{ balanceBefore: 'oops' }, { balanceAfter: 999 }, { amount: 0 }, { note: '' }]) {
      const csv = buildCsvStrings(snapshot({ ...adjustment, ...patch }));
      expect(validateEntities(parseCsvZip(buildCsvZip(csv))).valid).toBe(false);
    }
  });
  it.each(['ADJUSTMENT', 'adjustment', 'Penyesuaian Saldo'])('imports signed single-file adjustment CSV without creating categories (%s)', (type) => {
    const csv = 'Tanggal,Tipe,Jumlah,Kategori,Sub Kategori,Dompet,Catatan,Saldo Sebelum,Saldo Sesudah\n2026-10-10,' + type + ',-25000,Penyesuaian Saldo,Jangan buat kategori,BCA,Koreksi saldo,100000,75000';
    const imported = parseTransactionCsv(csv, [wallet], []);
    expect(imported.newCategories).toEqual([]);
    expect(imported.transactions[0]).toMatchObject({ ...adjustment, id: expect.any(String), note: 'Koreksi saldo' });
  });
  it('imports an exported adjustment transaction CSV with its signed audit fields', () => {
    const imported = parseTransactionCsv(buildCsvStrings(snapshot()).transactions, [wallet], []);
    expect(imported.newCategories).toEqual([]);
    expect(imported.transactions[0]).toMatchObject({ ...adjustment, id: expect.any(String) });
  });
  it.each([-25000, 25000])('roundtrips signed adjustment audit fields through CSV-only ZIP (%s)', (amount) => {
    const tx = { ...adjustment, amount, balanceAfter: 100000 + amount };
    const csv = buildCsvStrings(snapshot(tx));
    const exported = parseCsv(csv.transactions)[0];
    expect(exported.Tipe).toBe('Penyesuaian Saldo');
    expect(exported.Jumlah).toBe(String(amount));
    expect(parseCsvZip(buildCsvZip(csv)).transactions).toEqual([tx]);
  });
});
