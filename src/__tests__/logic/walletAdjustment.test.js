import { afterEach, describe, expect, it, vi } from 'vitest';
import * as adjustmentHelpers from '../../utils/walletAdjustment.js';

const wallet = { id: 'w1', type: 'credit', balance: -400, creditLimit: 1000, heldAmount: 100 };
const build = (...args) => adjustmentHelpers.buildWalletAdjustment(...args);
afterEach(() => vi.useRealTimers());

describe('wallet balance adjustment', () => {
  it('requires a trimmed nonempty reason of at most 1000 characters', () => {
    for (const reason of [undefined, null, 2, '', '  ', 'x'.repeat(1001)]) {
      expect(() => build(wallet, { balance: -500 }, { expectedBalance: -400, reason })).toThrow('Alasan');
    }
    expect(build(wallet, { balance: -500 }, { expectedBalance: -400, reason: ' x ' })).toMatchObject({ amount: -100, note: 'x' });
    expect(build(wallet, { balance: 100 }, { expectedBalance: -400, reason: 'x'.repeat(1000) })).toMatchObject({ amount: 500, balanceAfter: 100 });
  });

  it('requires a finite reviewed balance for every actual correction', () => {
    expect(() => build(wallet, { balance: -250 }, { reason: 'Koreksi' })).toThrow('Saldo awal');
    for (const bad of [NaN, Infinity, -Infinity, '100', null]) {
      expect(() => build(wallet, { balance: bad }, { expectedBalance: -400, reason: 'Koreksi' })).toThrow('Saldo');
      expect(() => build({ ...wallet, balance: bad }, { balance: -250 }, { expectedBalance: bad, reason: 'Koreksi' })).toThrow('Saldo');
      expect(() => build(wallet, { balance: -250 }, { expectedBalance: bad, reason: 'Koreksi' })).toThrow('Saldo');
    }
    expect(() => build({ ...wallet, balance: -Number.MAX_VALUE }, { balance: Number.MAX_VALUE }, { expectedBalance: -Number.MAX_VALUE, reason: 'Koreksi' })).toThrow('Saldo');
  });

  it('rejects a stale reviewed baseline even when the incoming edit matches the live balance', () => {
    expect(() => build({ ...wallet, balance: -300 }, { balance: -250 }, { expectedBalance: -400, reason: 'Koreksi' })).toThrow('Saldo dompet berubah');
    expect(() => build({ ...wallet, balance: -300 }, { balance: -300 }, { expectedBalance: -400 })).toThrow('Saldo dompet berubah');
  });

  it('skips unchanged balance and partial metadata edits without requiring a reason', () => {
    expect(build(wallet, { balance: -400 }, { expectedBalance: -400 })).toBeNull();
    expect(build(wallet, { name: 'Baru' })).toBeNull();
  });

  it('builds a signed credit correction with audit fields and trimmed reason, without mutating wallet', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 10, 0, 5));
    expect(build(wallet, { balance: -250 }, { expectedBalance: -400, reason: '  Koreksi saldo  ' })).toEqual({
      type: 'adjustment', amount: 150, categoryId: null, toWalletId: null, tags: [],
      note: 'Koreksi saldo', balanceBefore: -400, balanceAfter: -250, date: '2026-10-10', walletId: 'w1',
    });
    expect(wallet).toEqual({ id: 'w1', type: 'credit', balance: -400, creditLimit: 1000, heldAmount: 100 });
  });
});
