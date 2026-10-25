import { filterByRange, getPeriodRange } from './helpers';

/** Transfers and audited adjustments never count as income or expense. */
export function cashFlowTotals(transactions) {
  return transactions.reduce((totals, t) => {
    if (t.type === 'income' || t.type === 'expense') totals[t.type] += t.amount;
    return totals;
  }, { income: 0, expense: 0 });
}

export function dailyCashFlow(transactions, limit = 14) {
  const days = {};
  transactions.filter(t => t.type === 'income' || t.type === 'expense').forEach(t => {
    days[t.date] = (days[t.date] || 0) + (t.type === 'income' ? t.amount : -t.amount);
  });
  return Object.keys(days).sort().slice(-limit).map(date => ({ date, net: days[date] }));
}

/** Uses production cycle boundaries; no interpolated or fabricated history. */
export function buildCashFlowTrend(transactions, periodKeys, cycleStart) {
  return [...new Set(periodKeys)].sort().map(key => ({
    key,
    label: new Date(key + '-01T12:00:00').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
    ...cashFlowTotals(filterByRange(transactions, getPeriodRange(key, cycleStart))),
  }));
}
