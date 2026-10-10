import { describe, expect, it } from 'vitest';
import { validateTransaction, validateWallet } from '../../services/validator.js';

const tx = { date: '2026-10-10', walletId: 'w1', type: 'adjustment', amount: -100,
  categoryId: null, toWalletId: null, note: 'Koreksi saldo', tags: [], balanceBefore: -400, balanceAfter: -500 };

describe('adjustment validation', () => {
  it('rejects infinite wallet balances while preserving signed legacy and credit wallets', () => {
    const data = { name: 'BRI', type: 'credit', color: '#112233' };
    expect(validateWallet({ ...data, balance: Infinity })).toEqual(expect.any(String));
    expect(validateWallet({ ...data, balance: -Infinity })).toEqual(expect.any(String));
    expect(validateWallet({ ...data, balance: -400 })).toBeNull();
  });

  it('rejects empty reason, category, destination or tags on audit entries', () => {
    for (const data of [{ note: ' ' }, { categoryId: 'c1' }, { toWalletId: 'w2' }, { tags: ['tag'] }]) {
      expect(validateTransaction({ ...tx, ...data })).toEqual(expect.any(String));
    }
    expect(validateTransaction({ ...tx, note: 'x'.repeat(1001) })).toEqual(expect.any(String));
    expect(validateTransaction({ ...tx, note: 'x'.repeat(1000) })).toBeNull();
  });

  it('rejects nonfinite signed amounts and mismatched or missing audit balances', () => {
    for (const data of [{ amount: Infinity }, { amount: -Infinity }, { balanceBefore: undefined }, { balanceAfter: NaN }, { balanceBefore: '400' }, { balanceAfter: -450 }, { balanceAfter: Infinity }]) {
      expect(validateTransaction({ ...tx, ...data })).toEqual(expect.any(String));
    }
  });

  it('accepts both signed corrections with valid audit values', () => {
    expect(validateTransaction(tx)).toBeNull();
    expect(validateTransaction({ ...tx, amount: 150, balanceAfter: -250 })).toBeNull();
  });
});
