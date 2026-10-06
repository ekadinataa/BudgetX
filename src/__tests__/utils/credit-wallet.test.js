import { describe, it, expect } from 'vitest';
import * as helpers from '../../utils/helpers';
import { validateWallet } from '../../services/validator';

describe('credit position', () => {
  it('validates optional limits and holds as finite nonnegative numbers', () => {
    const wallet = { name: 'BRI', type: 'credit', balance: -400, color: '#112233' };
    expect(validateWallet(wallet)).toBeNull();
    for (const field of ['creditLimit', 'heldAmount']) {
      for (const value of [-1, NaN, Infinity, -Infinity, '100', null]) {
        expect(validateWallet({ ...wallet, [field]: value })).not.toBeNull();
      }
      expect(validateWallet({ ...wallet, [field]: 0 })).toBeNull();
    }
  });

  it('keeps legacy signed balances and never counts plafon as an asset', () => {
    const legacy = { type: 'paylater', balance: 500 };
    expect(helpers.getCreditPosition(legacy)).toEqual({ outstanding: 0, availableLimit: null });
    expect(legacy).toEqual({ type: 'paylater', balance: 500 });
    const wallets = [legacy, { type: 'credit', balance: -200, creditLimit: 10000, heldAmount: 100 }, { type: 'bank', balance: 1000 }];
    expect(helpers.computeWalletAggregates(wallets)).toEqual({ netBalance: 1300, totalAsset: 1500, totalDebt: -200 });
    expect(helpers.getCreditPosition({ type: 'credit', balance: 200, creditLimit: 1000 })).toEqual({ outstanding: 0, availableLimit: 1200 });
  });
  it('derives purchase, repayment, overpayment and hold without mutating balance', () => {
    expect(helpers.getCreditPosition).toBeTypeOf('function');
    const wallet = { type: 'credit', balance: 0, creditLimit: 1000, heldAmount: 100 };
    expect(helpers.getCreditPosition(wallet)).toEqual({ outstanding: 0, availableLimit: 900 });
    wallet.balance -= 400; // expense purchase
    expect(helpers.getCreditPosition(wallet)).toEqual({ outstanding: 400, availableLimit: 500 });
    wallet.balance += 300; // incoming repayment transfer
    expect(helpers.getCreditPosition(wallet)).toEqual({ outstanding: 100, availableLimit: 800 });
    wallet.balance += 200;
    expect(helpers.getCreditPosition(wallet)).toEqual({ outstanding: 0, availableLimit: 1000 });
    wallet.balance = -2000;
    expect(helpers.getCreditPosition(wallet)).toEqual({ outstanding: 2000, availableLimit: 0 });
    expect(wallet.balance).toBe(-2000);
  });
});
