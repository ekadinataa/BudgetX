import { describe, it, expect } from 'vitest';
import { isCategoryOnlyChange } from '../utils/transactionEdits.js';

describe('isCategoryOnlyChange', () => {
  const previous = {
    categoryId: 'cat-1',
    amount: 100,
    walletId: 'wallet-1',
    toWalletId: 'wallet-2',
    type: 'expense',
    date: '2026-01-01',
    note: 'test',
    tags: ['a'],
  };

  it('returns true when only categoryId changes', () => {
    const data = { categoryId: 'cat-2', amount: 100, walletId: 'wallet-1', toWalletId: 'wallet-2', type: 'expense' };
    expect(isCategoryOnlyChange(previous, data)).toBe(true);
  });

  it('returns false when amount differs', () => {
    const data = { categoryId: 'cat-2', amount: 200, walletId: 'wallet-1', toWalletId: 'wallet-2', type: 'expense' };
    expect(isCategoryOnlyChange(previous, data)).toBe(false);
  });

  it('returns false when walletId differs', () => {
    const data = { categoryId: 'cat-2', amount: 100, walletId: 'wallet-999', toWalletId: 'wallet-2', type: 'expense' };
    expect(isCategoryOnlyChange(previous, data)).toBe(false);
  });

  // HIGH ISSUE: partial update bypasses comparison
  it('returns false when financial fields omitted but would differ (amount)', () => {
    const prev = { ...previous, amount: 500 };
    const data = { categoryId: 'cat-2' }; // omits amount - bug allows this to pass
    expect(isCategoryOnlyChange(prev, data)).toBe(false);
  });

  it('returns false when financial fields omitted but would differ (walletId)', () => {
    const prev = { ...previous, walletId: 'different-wallet' };
    const data = { categoryId: 'cat-2' };
    expect(isCategoryOnlyChange(prev, data)).toBe(false);
  });

  it('returns false when financial fields omitted but would differ (type)', () => {
    const prev = { ...previous, type: 'income' };
    const data = { categoryId: 'cat-2' };
    expect(isCategoryOnlyChange(prev, data)).toBe(false);
  });

  it('returns false when no categoryId in data', () => {
    expect(isCategoryOnlyChange(previous, { amount: 100 })).toBe(false);
  });

  it('returns false when previous is null', () => {
    expect(isCategoryOnlyChange(null, { categoryId: 'cat-2' })).toBe(false);
  });
});
