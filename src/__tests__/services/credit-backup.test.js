import { describe, it, expect } from 'vitest';
import { buildBudgetXJson, buildCsvStrings, buildCsvZip } from '../../services/exportService';
import { parseAndValidate, parseCsvZip, validateEntities } from '../../services/importService';
import { normalizeBackupData } from '../../utils/backupHelpers';

const wallet = { id: 'credit', name: 'BRI', type: 'credit', balance: -400, creditLimit: 1000, heldAmount: 100, color: '#112233', note: '' };
const data = { wallets: [wallet], transactions: [], categories: [], budgets: {} };

describe('credit backup compatibility', () => {
  it('roundtrips credit fields in JSON, complete ZIP and CSV-only ZIP', () => {
    const csv = buildCsvStrings(data);
    expect(parseAndValidate(JSON.stringify(buildBudgetXJson(data))).data.wallets).toEqual([wallet]);
    expect(normalizeBackupData(data).wallets).toEqual([wallet]);
    expect(parseCsvZip(buildCsvZip(csv, data)).wallets).toEqual([wallet]);
    expect(parseCsvZip(buildCsvZip(csv)).wallets).toEqual([wallet]);
  });
  it('keeps old CSV-only balances without manufacturing plafon', () => {
    const csv = buildCsvStrings(data);
    csv.wallets = 'ID,Nama,Tipe,Saldo,Warna,Catatan\nlegacy,Legacy,PayLater,500,#112233,';
    const restored = parseCsvZip(buildCsvZip(csv)).wallets[0];
    expect(restored.balance).toBe(500);
    expect(restored).not.toHaveProperty('creditLimit');
  });
  it('rejects invalid optional numbers and derived stored fields in imports', () => {
    for (const patch of [{ creditLimit: -1 }, { heldAmount: '100' }, { heldAmount: null }, { outstanding: 400 }, { availableLimit: 500 }]) {
      expect(validateEntities({ ...data, wallets: [{ ...wallet, ...patch }] }).valid).toBe(false);
    }
    const csv = buildCsvStrings(data);
    csv.wallets = 'ID,Nama,Tipe,Saldo,Warna,Catatan,Plafon,Hold\ncredit,BRI,Kartu Kredit,-400,#112233,,oops,100';
    expect(() => parseCsvZip(buildCsvZip(csv))).toThrow();
  });
});
