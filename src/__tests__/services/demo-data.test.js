// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseAndValidate, validateEntities, computeAppend } from '../../services/importService';
import { BACKUP_ARRAY_KEYS } from '../../utils/backupHelpers';
import { computeInvestmentMetrics } from '../../utils/investmentHelpers';
import { advanceDueDate } from '../../utils/subscriptionHelpers';

const text = readFileSync(new URL('../../../public/demo/budgetx-demo-agustus-oktober-2026.json', import.meta.url), 'utf8');
const { data } = parseAndValidate(text);
const { demo } = JSON.parse(text);
const txById = Object.fromEntries(data.transactions.map(tx => [tx.id, tx]));

describe('Downloadable all-menu demo', () => {
  it('passes the actual import validators and contains all supported collections', () => {
    expect(validateEntities(data)).toEqual({ valid: true });
    for (const key of BACKUP_ARRAY_KEYS) expect(data[key].length).toBeGreaterThan(0);
    expect(data.preferences.page).toBe('dashboard');
    expect(data.fireSettings.currentAssets).toBeGreaterThan(0);
  });

  it('covers exactly August–October with valid dates, wallets and categories', () => {
    const wallets = new Set(data.wallets.map(wallet => wallet.id));
    const categories = new Set(data.categories.map(category => category.id));
    expect([...new Set(data.transactions.map(tx => tx.date.slice(0, 7)))]).toEqual(['2026-08', '2026-09', '2026-10']);
    for (const tx of data.transactions) {
      expect(tx.date >= demo.period.start && tx.date <= demo.period.end).toBe(true);
      expect(new Date(`${tx.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(tx.date);
      expect(wallets.has(tx.walletId)).toBe(true);
      if (tx.categoryId) expect(categories.has(tx.categoryId)).toBe(true);
      if (tx.type === 'transfer') expect(wallets.has(tx.toWalletId)).toBe(true);
    }
  });

  it('reconciles every final wallet balance against opening balances and all transaction effects', () => {
    const balances = { ...demo.openingBalances };
    for (const tx of data.transactions) {
      balances[tx.walletId] += tx.type === 'income' ? tx.amount : -tx.amount;
      if (tx.type === 'transfer') balances[tx.toWalletId] += tx.amount;
    }
    for (const wallet of data.wallets) expect(wallet.balance).toBe(balances[wallet.id]);
    expect(data.wallets.reduce((sum, wallet) => sum + wallet.balance, 0)).toBe(26646000);
  });

  it('has complete monthly 50/30/20 budgets with matching category allocations', () => {
    const categoryById = Object.fromEntries(data.categories.map(category => [category.id, category]));
    expect(Object.keys(data.budgets)).toEqual(['2026-08', '2026-09', '2026-10']);
    for (const budget of Object.values(data.budgets)) {
      expect(Object.values(budget.sections).reduce((sum, section) => sum + section.total, 0)).toBe(budget.totalIncome);
      for (const [key, section] of Object.entries(budget.sections)) {
        expect(section.cats.reduce((sum, category) => sum + category.amt, 0)).toBe(section.total);
        for (const category of section.cats) expect(categoryById[category.id].section).toBe(key);
      }
    }
  });

  it('reconciles debt principal and linked creation/payment transactions', () => {
    for (const debt of data.debts) {
      expect(debt.remainingAmount).toBe(debt.totalAmount - debt.payments.reduce((sum, payment) => sum + payment.principalPart, 0));
      expect(txById[debt.transactionId]).toMatchObject({ amount: debt.totalAmount, walletId: debt.walletId, type: debt.type === 'utang' ? 'income' : 'expense' });
      for (const payment of debt.payments) {
        expect(txById[payment.transactionId]).toMatchObject({ date: payment.date, amount: payment.amount, walletId: payment.walletId, type: debt.type === 'utang' ? 'expense' : 'income' });
      }
    }
  });

  it('keeps investment holdings and FIRE assets consistent with wallet history', () => {
    let totalValue = 0;
    for (const investment of data.investments) {
      const metrics = computeInvestmentMetrics(investment);
      expect(metrics.totalUnits).toBeGreaterThan(0);
      expect(Number.isFinite(metrics.returnPercentage)).toBe(true);
      totalValue += metrics.currentValue;
      for (const tx of investment.transactions) {
        expect(tx.totalAmount).toBe(tx.units * tx.pricePerUnit);
        expect(txById[tx.walletTxId]).toMatchObject({ date: tx.date, amount: tx.totalAmount, walletId: tx.walletId, type: tx.type === 'buy' ? 'expense' : 'income' });
      }
    }
    expect(totalValue).toBe(data.fireSettings.currentAssets);
    expect(Object.values(data.fireSettings.allocation).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('links latest recurring purchases and subscription payments to the snapshot', () => {
    for (const item of data.recurringItems) {
      expect(data.transactions.some(tx => tx.date === item.lastPurchaseDate && tx.amount === item.amount && tx.walletId === item.walletId && tx.categoryId === item.categoryId)).toBe(true);
    }
    for (const subscription of data.subscriptions) {
      expect(subscription.nextDueDate).toBe(advanceDueDate(subscription.lastPaidDate, subscription.billingCycle));
      expect(data.transactions.some(tx => tx.date === subscription.lastPaidDate && tx.amount === subscription.amount && tx.walletId === subscription.walletId && tx.note === `Bayar ${subscription.name}`)).toBe(true);
    }
  });

  it('does not duplicate any menu records on repeated append', () => {
    const { toAdd, counts } = computeAppend(data, data);
    expect(counts.added).toBe(0);
    for (const key of BACKUP_ARRAY_KEYS) expect(toAdd[key]).toEqual([]);
    expect(toAdd.budgets).toEqual({});
  });
});
