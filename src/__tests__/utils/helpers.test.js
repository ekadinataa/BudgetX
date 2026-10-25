import { describe, it, expect } from 'vitest';
import {
  getCatById,
  getWalletById,
  walletTypeLabel,
  sectionLabel,
  sectionColor,
  getPeriodRange,
  filterByRange,
  groupTransactionsByDate,
  getRecentTransactions,
  computeWalletAggregates,
  filterCategoriesByTxType,
} from '../../utils/helpers.js';

// ── Lookup helpers ────────────────────────────────────────────────────────────

describe('getCatById', () => {
  const cats = [
    { id: 'c1', name: 'Food', section: 'needs', color: '#F00' },
    { id: 'c2', name: 'Fun', section: 'wants', color: '#0F0' },
  ];

  it('returns the matching category', () => {
    expect(getCatById('c1', cats)).toEqual(cats[0]);
  });

  it('returns undefined for unknown id', () => {
    expect(getCatById('c99', cats)).toBeUndefined();
  });
});

describe('getWalletById', () => {
  const wallets = [
    { id: 'w1', name: 'BCA', type: 'bank', balance: 1000000 },
    { id: 'w2', name: 'GoPay', type: 'ewallet', balance: 50000 },
  ];

  it('returns the matching wallet', () => {
    expect(getWalletById('w2', wallets)).toEqual(wallets[1]);
  });

  it('returns undefined for unknown id', () => {
    expect(getWalletById('w99', wallets)).toBeUndefined();
  });
});

// ── Label / color mappers ─────────────────────────────────────────────────────

describe('walletTypeLabel', () => {
  it('returns "Bank" for bank', () => {
    expect(walletTypeLabel('bank')).toBe('Bank');
  });

  it('returns "E-Wallet" for ewallet', () => {
    expect(walletTypeLabel('ewallet')).toBe('E-Wallet');
  });

  it('returns "Kartu Kredit" for credit', () => {
    expect(walletTypeLabel('credit')).toBe('Kartu Kredit');
  });

  it('returns "PayLater" for paylater', () => {
    expect(walletTypeLabel('paylater')).toBe('PayLater');
  });

  it('returns "Tunai/Cash" for cash', () => {
    expect(walletTypeLabel('cash')).toBe('Tunai/Cash');
  });

  it('returns the type string itself for unknown types', () => {
    expect(walletTypeLabel('crypto')).toBe('crypto');
  });
});

describe('sectionLabel', () => {
  it('returns "Kebutuhan" for needs', () => {
    expect(sectionLabel('needs')).toBe('Kebutuhan');
  });

  it('returns "Keinginan" for wants', () => {
    expect(sectionLabel('wants')).toBe('Keinginan');
  });

  it('returns "Tabungan" for savings', () => {
    expect(sectionLabel('savings')).toBe('Tabungan');
  });

  it('returns "Pemasukan" for income', () => {
    expect(sectionLabel('income')).toBe('Pemasukan');
  });

  it('returns the key itself for unknown sections', () => {
    expect(sectionLabel('other')).toBe('other');
  });
});

describe('sectionColor', () => {
  it('returns "#4F6EF7" for needs', () => {
    expect(sectionColor('needs')).toBe('var(--blue)');
  });

  it('returns "#F59E0B" for wants', () => {
    expect(sectionColor('wants')).toBe('var(--orange)');
  });

  it('returns "#22C55E" for savings', () => {
    expect(sectionColor('savings')).toBe('var(--green)');
  });

  it('returns fallback "#A855F7" for unknown sections', () => {
    expect(sectionColor('income')).toBe('var(--purple)');
  });
});

// ── getPeriodRange ────────────────────────────────────────────────────────────

describe('getPeriodRange', () => {
  it('returns first-to-last day of month when cycleStart is 1', () => {
    const range = getPeriodRange('2026-04', 1);
    expect(range.start).toBe('2026-04-01');
    expect(range.end).toBe('2026-04-30');
  });

  it('returns first-to-last day for February (non-leap)', () => {
    const range = getPeriodRange('2026-02', 1);
    expect(range.start).toBe('2026-02-01');
    expect(range.end).toBe('2026-02-28');
  });

  it('returns first-to-last day for February (leap year)', () => {
    const range = getPeriodRange('2024-02', 1);
    expect(range.start).toBe('2024-02-01');
    expect(range.end).toBe('2024-02-29');
  });

  it('computes cross-month range when cycleStart > 1', () => {
    // cycleStart=25, April → 25 Mar – 24 Apr
    const range = getPeriodRange('2026-04', 25);
    expect(range.start).toBe('2026-03-25');
    expect(range.end).toBe('2026-04-24');
  });

  it('handles January with cycleStart > 1 (wraps to previous year)', () => {
    const range = getPeriodRange('2026-01', 10);
    expect(range.start).toBe('2025-12-10');
    expect(range.end).toBe('2026-01-09');
  });

  it('clamps start day to last day of previous month if needed', () => {
    // cycleStart=28, March → start should be Feb 28
    const range = getPeriodRange('2026-03', 28);
    expect(range.start).toBe('2026-02-28');
    expect(range.end).toBe('2026-03-27');
  });

  it('has start < end', () => {
    const range = getPeriodRange('2026-06', 15);
    expect(range.start < range.end).toBe(true);
  });

  it('includes a label string', () => {
    const range = getPeriodRange('2026-04', 1);
    expect(typeof range.label).toBe('string');
    expect(range.label.length).toBeGreaterThan(0);
  });
});

// ── filterByRange ─────────────────────────────────────────────────────────────

describe('filterByRange', () => {
  const txs = [
    { id: 't1', date: '2026-03-25', amount: 100 },
    { id: 't2', date: '2026-04-01', amount: 200 },
    { id: 't3', date: '2026-04-15', amount: 300 },
    { id: 't4', date: '2026-04-30', amount: 400 },
    { id: 't5', date: '2026-05-01', amount: 500 },
  ];

  it('includes transactions within the range (inclusive)', () => {
    const result = filterByRange(txs, { start: '2026-04-01', end: '2026-04-30' });
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.id)).toEqual(['t2', 't3', 't4']);
  });

  it('excludes transactions outside the range', () => {
    const result = filterByRange(txs, { start: '2026-04-02', end: '2026-04-29' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t3');
  });

  it('returns empty array when no transactions match', () => {
    const result = filterByRange(txs, { start: '2027-01-01', end: '2027-01-31' });
    expect(result).toHaveLength(0);
  });

  it('returns all when range covers everything', () => {
    const result = filterByRange(txs, { start: '2020-01-01', end: '2030-12-31' });
    expect(result).toHaveLength(5);
  });
});

// ── groupTransactionsByDate ───────────────────────────────────────────────────

describe('groupTransactionsByDate', () => {
  it('groups transactions by date', () => {
    const txs = [
      { id: 't1', date: '2026-04-19' },
      { id: 't2', date: '2026-04-19' },
      { id: 't3', date: '2026-04-18' },
    ];
    const groups = groupTransactionsByDate(txs);
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe('2026-04-19');
    expect(groups[0].transactions).toHaveLength(2);
    expect(groups[1].date).toBe('2026-04-18');
    expect(groups[1].transactions).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(groupTransactionsByDate([])).toEqual([]);
  });
});

// ── getRecentTransactions ─────────────────────────────────────────────────────

describe('getRecentTransactions', () => {
  const txs = [
    { id: 't1', date: '2026-04-01', type: 'income' },
    { id: 't2', date: '2026-04-05', type: 'expense' },
    { id: 't3', date: '2026-04-10', type: 'transfer' },
    { id: 't4', date: '2026-04-12', type: 'expense' },
    { id: 't5', date: '2026-04-15', type: 'income' },
    { id: 't6', date: '2026-04-18', type: 'expense' },
    { id: 't7', date: '2026-04-19', type: 'expense' },
    { id: 't8', date: '2026-04-20', type: 'income' },
  ];

  it('returns at most 6 non-transfer transactions', () => {
    const result = getRecentTransactions(txs);
    expect(result.length).toBeLessThanOrEqual(6);
    expect(result.every((t) => t.type !== 'transfer')).toBe(true);
  });

  it('sorts by date descending', () => {
    const result = getRecentTransactions(txs);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].date >= result[i].date).toBe(true);
    }
  });

  it('respects custom limit', () => {
    const result = getRecentTransactions(txs, 3);
    expect(result).toHaveLength(3);
  });
});

// ── computeWalletAggregates ───────────────────────────────────────────────────

describe('computeWalletAggregates', () => {
  it('computes net balance, total asset, and total debt', () => {
    const wallets = [
      { id: 'w1', balance: 1000000 },
      { id: 'w2', balance: 500000 },
      { id: 'w3', balance: -200000 },
    ];
    const result = computeWalletAggregates(wallets);
    expect(result.netBalance).toBe(1300000);
    expect(result.totalAsset).toBe(1500000);
    expect(result.totalDebt).toBe(-200000);
  });

  it('handles empty wallets', () => {
    const result = computeWalletAggregates([]);
    expect(result.netBalance).toBe(0);
    expect(result.totalAsset).toBe(0);
    expect(result.totalDebt).toBe(0);
  });

  it('handles all negative balances', () => {
    const wallets = [
      { id: 'w1', balance: -100000 },
      { id: 'w2', balance: -300000 },
    ];
    const result = computeWalletAggregates(wallets);
    expect(result.netBalance).toBe(-400000);
    expect(result.totalAsset).toBe(0);
    expect(result.totalDebt).toBe(-400000);
  });
});

// ── filterCategoriesByTxType ──────────────────────────────────────────────────

describe('filterCategoriesByTxType', () => {
  const cats = [
    { id: 'c1', name: 'Food', section: 'needs' },
    { id: 'c2', name: 'Fun', section: 'wants' },
    { id: 'c3', name: 'Save', section: 'savings' },
    { id: 'c4', name: 'Salary', section: 'income' },
  ];

  it('returns only income categories for income type', () => {
    const result = filterCategoriesByTxType(cats, 'income');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c4');
  });

  it('returns only non-income categories for expense type', () => {
    const result = filterCategoriesByTxType(cats, 'expense');
    expect(result).toHaveLength(3);
    expect(result.every((c) => c.section !== 'income')).toBe(true);
  });
});
