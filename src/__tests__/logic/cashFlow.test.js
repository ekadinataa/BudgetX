import { describe, it, expect } from 'vitest';
import { cashFlowTotals, dailyCashFlow, buildCashFlowTrend } from '../../utils/cashFlow';

const txs = [
  { date: '2026-09-25', type: 'income', amount: 1000 },
  { date: '2026-10-05', type: 'expense', amount: 100 },
  { date: '2026-10-05', type: 'transfer', amount: 9999 },
  { date: '2026-10-05', type: 'adjustment', amount: -9999 },
  { date: '2026-10-25', type: 'income', amount: 2000 },
];

describe('cash-flow presentation data', () => {
  it('excludes transfers and signed adjustments from totals', () => {
    expect(cashFlowTotals(txs)).toEqual({ income: 3000, expense: 100 });
    expect(cashFlowTotals([])).toEqual({ income: 0, expense: 0 });
  });
  it('aggregates real active days, in chronological order, without mutating input', () => {
    const copy = structuredClone(txs);
    expect(dailyCashFlow(txs)).toEqual([{ date: '2026-09-25', net: 1000 }, { date: '2026-10-05', net: -100 }, { date: '2026-10-25', net: 2000 }]);
    expect(txs).toEqual(copy);
  });
  it('limits the waterfall to the latest real active days', () => {
    expect(dailyCashFlow(txs, 1)).toEqual([{ date: '2026-10-25', net: 2000 }]);
    expect(dailyCashFlow(txs.filter(t => t.type === 'transfer'))).toEqual([]);
  });
  it('uses calendar-month boundaries and unique sorted periods', () => {
    const trend = buildCashFlowTrend(txs, ['2026-10', '2026-09', '2026-10'], 1);
    expect(trend.map(({ key, income, expense }) => ({ key, income, expense }))).toEqual([
      { key: '2026-09', income: 1000, expense: 0 }, { key: '2026-10', income: 2000, expense: 100 },
    ]);
  });
  it('preserves production salary-cycle boundaries instead of rebucketing by month', () => {
    const [october] = buildCashFlowTrend(txs, ['2026-10'], 25);
    expect(october).toMatchObject({ income: 1000, expense: 100 });
  });
});
