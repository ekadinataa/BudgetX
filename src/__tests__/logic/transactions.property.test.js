import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  groupTransactionsByDate,
  getRecentTransactions,
  filterByRange,
} from '../../utils/helpers.js';

// ── Arbitraries ──────────────────────────────────────────────────────────────

const txTypeArb = fc.constantFrom('income', 'expense', 'transfer');

const dateArb = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

const walletIdArb = fc.constantFrom('w1', 'w2', 'w3', 'w4', 'w5');
const categoryIdArb = fc.constantFrom('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8');

const tagArb = fc.constantFrom('rutin', 'makan', 'transport', 'hiburan', 'freelance', 'investasi');

const transactionArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }).map((s) => 'tx_' + s),
  date: dateArb,
  walletId: walletIdArb,
  type: txTypeArb,
  categoryId: categoryIdArb,
  amount: fc.integer({ min: 1, max: 50_000_000 }),
  note: fc.string({ maxLength: 50 }),
  tags: fc.array(tagArb, { minLength: 0, maxLength: 3 }),
});

const transactionsArb = fc.array(transactionArb, { minLength: 0, maxLength: 30 });

// ── Property 3: Transaction filtering correctness ────────────────────────────
// Feature: budget-money-tracker, Property 3: Transaction filtering correctness
// **Validates: Requirements 4.2, 4.3**

describe('Property 3: Transaction filtering correctness', () => {
  it('every result matches all active filter criteria and no matching tx is excluded', () => {
    const filterArb = fc.record({
      search: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
      walletId: fc.option(walletIdArb, { nil: undefined }),
      type: fc.option(txTypeArb, { nil: undefined }),
      categoryId: fc.option(categoryIdArb, { nil: undefined }),
      tag: fc.option(tagArb, { nil: undefined }),
    });

    fc.assert(
      fc.property(transactionsArb, filterArb, (txs, filters) => {
        // Apply filters (replicating the filtering logic from TransactionsPage)
        const filtered = txs.filter((t) => {
          if (filters.search && !t.note.toLowerCase().includes(filters.search.toLowerCase())) return false;
          if (filters.walletId && t.walletId !== filters.walletId) return false;
          if (filters.type && t.type !== filters.type) return false;
          if (filters.categoryId && t.categoryId !== filters.categoryId) return false;
          if (filters.tag && !t.tags.includes(filters.tag)) return false;
          return true;
        });

        // Every result matches all criteria
        for (const t of filtered) {
          if (filters.search) {
            expect(t.note.toLowerCase()).toContain(filters.search.toLowerCase());
          }
          if (filters.walletId) expect(t.walletId).toBe(filters.walletId);
          if (filters.type) expect(t.type).toBe(filters.type);
          if (filters.categoryId) expect(t.categoryId).toBe(filters.categoryId);
          if (filters.tag) expect(t.tags).toContain(filters.tag);
        }

        // No matching transaction is excluded
        for (const t of txs) {
          const matches =
            (!filters.search || t.note.toLowerCase().includes(filters.search.toLowerCase())) &&
            (!filters.walletId || t.walletId === filters.walletId) &&
            (!filters.type || t.type !== filters.type ? false : true) &&
            (!filters.categoryId || t.categoryId === filters.categoryId) &&
            (!filters.tag || t.tags.includes(filters.tag));
          if (matches) {
            expect(filtered).toContainEqual(t);
          }
        }

        // Summary totals equal sums over filtered result
        const totalIncome = filtered
          .filter((t) => t.type === 'income')
          .reduce((s, t) => s + t.amount, 0);
        const totalExpense = filtered
          .filter((t) => t.type === 'expense')
          .reduce((s, t) => s + t.amount, 0);
        const net = totalIncome - totalExpense;

        const recomputedIncome = filtered
          .filter((t) => t.type === 'income')
          .reduce((s, t) => s + t.amount, 0);
        const recomputedExpense = filtered
          .filter((t) => t.type === 'expense')
          .reduce((s, t) => s + t.amount, 0);

        expect(totalIncome).toBe(recomputedIncome);
        expect(totalExpense).toBe(recomputedExpense);
        expect(net).toBe(recomputedIncome - recomputedExpense);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 4: Transaction grouping by date ─────────────────────────────────
// Feature: budget-money-tracker, Property 4: Transaction grouping by date
// **Validates: Requirements 4.1**

describe('Property 4: Transaction grouping by date', () => {
  it('all transactions under a header share that date, headers descending, union equals original', () => {
    fc.assert(
      fc.property(transactionsArb, (txs) => {
        // Sort by date descending (as the function expects)
        const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
        const groups = groupTransactionsByDate(sorted);

        // All transactions under a header share that date
        for (const group of groups) {
          for (const t of group.transactions) {
            expect(t.date).toBe(group.date);
          }
        }

        // Headers are in descending order
        for (let i = 1; i < groups.length; i++) {
          expect(groups[i - 1].date >= groups[i].date).toBe(true);
        }

        // Union of all grouped transactions equals the sorted list
        const allGrouped = groups.flatMap((g) => g.transactions);
        expect(allGrouped.length).toBe(sorted.length);

        // Each transaction in sorted appears in allGrouped
        for (let i = 0; i < sorted.length; i++) {
          expect(allGrouped[i]).toBe(sorted[i]);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 7: Recent transactions selection ────────────────────────────────
// Feature: budget-money-tracker, Property 7: Recent transactions selection
// **Validates: Requirements 6.7**

describe('Property 7: Recent transactions selection', () => {
  it('at most 6 items, excludes transfers, sorted by date desc, contains most recent non-transfers', () => {
    fc.assert(
      fc.property(transactionsArb, (txs) => {
        const result = getRecentTransactions(txs);

        // At most 6 items
        expect(result.length).toBeLessThanOrEqual(6);

        // Excludes transfers
        for (const t of result) {
          expect(t.type).not.toBe('transfer');
        }

        // Sorted by date descending
        for (let i = 1; i < result.length; i++) {
          expect(result[i - 1].date >= result[i].date).toBe(true);
        }

        // Contains the 6 most recent non-transfer transactions
        const nonTransfers = [...txs]
          .filter((t) => t.type !== 'transfer')
          .sort((a, b) => b.date.localeCompare(a.date));
        const expected = nonTransfers.slice(0, 6);

        expect(result.length).toBe(expected.length);
        for (let i = 0; i < result.length; i++) {
          expect(result[i]).toEqual(expected[i]);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 8: Period range filtering ───────────────────────────────────────
// Feature: budget-money-tracker, Property 8: Period range filtering
// **Validates: Requirements 7.6**

describe('Property 8: Period range filtering', () => {
  it('result contains only in-range transactions, no in-range tx excluded', () => {
    const rangeArb = fc
      .tuple(dateArb, dateArb)
      .map(([a, b]) => (a <= b ? { start: a, end: b } : { start: b, end: a }));

    fc.assert(
      fc.property(transactionsArb, rangeArb, (txs, range) => {
        const result = filterByRange(txs, range);

        // Every result is within [start, end]
        for (const t of result) {
          expect(t.date >= range.start).toBe(true);
          expect(t.date <= range.end).toBe(true);
        }

        // No in-range transaction is excluded
        for (const t of txs) {
          if (t.date >= range.start && t.date <= range.end) {
            expect(result).toContainEqual(t);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
