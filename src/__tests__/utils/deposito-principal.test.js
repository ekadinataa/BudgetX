import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateInvestment } from '../../services/investmentValidator';
import { computeNetWorth } from '../../utils/assetHelpers';
import { computeInvestmentMetrics, computePortfolioSummary } from '../../utils/investmentHelpers';

const deposit = { name: 'Superbank', assetType: 'deposito', principal: 10000000, depositDate: '2026-01-01', interestRate: 7.5, maturityDate: '2027-01-01', transactions: [] };
afterEach(() => vi.useRealTimers());

describe('deposito opening principal', () => {
  it('projects interest on all remaining capital at maturity, not just the opening holding', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const investment = { ...deposit, transactions: [{ type: 'buy', date: '2026-01-01', units: 1, pricePerUnit: 2000000 }] };
    expect(computeInvestmentMetrics(investment, deposit.maturityDate).unrealizedGain).toBe(900000);
    investment.transactions.push({ type: 'sell', date: '2026-02-01', units: 0.5, pricePerUnit: 6000000 });
    expect(computeInvestmentMetrics(investment, deposit.maturityDate).unrealizedGain).toBe(675000);
    investment.transactions.push({ type: 'sell', date: '2026-03-01', units: 1.5, pricePerUnit: 6000000 });
    expect(computeInvestmentMetrics(investment, deposit.maturityDate).unrealizedGain).toBe(0);
  });
  it('uses chronological cost and valuation for a backdated buy after a partial sale', () => {
    const investment = { ...deposit, interestRate: 0, transactions: [
      { type: 'sell', date: '2026-02-01', units: 1, pricePerUnit: 6000000 },
      { type: 'buy', date: '2026-01-15', units: 1, pricePerUnit: 2000000 },
    ] };
    expect(computeInvestmentMetrics(investment)).toMatchObject({ costBasis: 6000000, currentValue: 6000000, unrealizedGain: 0 });
  });
  it('includes the derived holding in net worth without persisting accrued interest', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2027-01-01T12:00:00Z'));
    expect(computeNetWorth([], [], [{ ...deposit, currentValue: 0 }])).toMatchObject({ netWorth: 10750000, breakdown: { investments: 10750000 } });
  });
  it.each([0, -1, Infinity, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1, '1000'])('rejects invalid principal %s', principal => {
    expect(validateInvestment({ ...deposit, principal })).toMatch(/Nominal deposito/);
  });
  it.each(['', '2026-02-30', 'not-a-date'])('rejects invalid placement date %s', depositDate => {
    expect(validateInvestment({ ...deposit, depositDate })).toMatch(/Tanggal penempatan/);
  });
  it('keeps legacy investments without opening fields valid', () => {
    expect(validateInvestment({ name: 'Lama', assetType: 'deposito' })).toBeNull();
  });
  it('does not accrue beyond maturity', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2028-01-01T12:00:00Z'));
    expect(computeInvestmentMetrics(deposit).currentValue).toBe(10750000);
  });
  it('includes later buys and removes all capital after redemption', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const bought = { ...deposit, transactions: [{ type: 'buy', units: 1, pricePerUnit: 2000000, totalAmount: 2000000, date: '2026-01-01' }] };
    expect(computeInvestmentMetrics(bought)).toMatchObject({ totalUnits: 2, costBasis: 12000000, currentValue: 12000000 });
    const sold = { ...bought, transactions: [...bought.transactions, { type: 'sell', units: 2, pricePerUnit: 6000000, date: '2026-01-01' }] };
    expect(computeInvestmentMetrics(sold)).toMatchObject({ totalUnits: 0, costBasis: 0, currentValue: 0 });
  });
  it('counts the entered nominal as capital and accrues interest from placement date', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2027-01-01T12:00:00Z'));
    expect(computeInvestmentMetrics(deposit)).toMatchObject({ totalUnits: 1, costBasis: 10000000, currentValue: 10750000, unrealizedGain: 750000 });
    expect(computePortfolioSummary([deposit])).toMatchObject({ totalCostBasis: 10000000, totalValue: 10750000 });
    expect(deposit.transactions).toEqual([]);
  });
});
