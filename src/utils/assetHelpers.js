/**
 * Asset Health Helpers — Pure computation functions for financial health overview.
 *
 * Computes net worth breakdown and financial health ratios from existing
 * app data (wallets, debts, investments, transactions).
 * NO new Firestore collections needed.
 */

/**
 * Compute net worth breakdown from existing app data.
 * @param {Array} wallets
 * @param {Array} debts
 * @param {Array} investments
 * @param {Array} fixedAssets
 * @returns {{ totalAssets, totalLiabilities, netWorth, breakdown }}
 */
export function computeNetWorth(wallets, debts, investments, fixedAssets = []) {
  // Assets:
  //   + positive wallet balances
  //   + investment currentValue totals
  //   + active piutang (receivables) remainingAmount
  //   + fixed assets currentValue
  // Liabilities:
  //   + negative wallet balances (abs value)
  //   + active utang (payables) remainingAmount

  const positiveWallets = wallets.filter(w => w.balance > 0).reduce((s, w) => s + w.balance, 0);
  const negativeWallets = wallets.filter(w => w.balance < 0).reduce((s, w) => s + Math.abs(w.balance), 0);
  const investmentTotal = investments.reduce((s, inv) => s + (inv.currentValue || 0), 0);
  const piutangTotal = debts.filter(d => d.type === 'piutang' && d.status === 'active').reduce((s, d) => s + d.remainingAmount, 0);
  const utangTotal = debts.filter(d => d.type === 'utang' && d.status === 'active').reduce((s, d) => s + d.remainingAmount, 0);
  const fixedAssetsTotal = fixedAssets.reduce((s, a) => s + (a.currentValue || 0), 0);

  const totalAssets = positiveWallets + investmentTotal + piutangTotal + fixedAssetsTotal;
  const totalLiabilities = negativeWallets + utangTotal;
  const netWorth = totalAssets - totalLiabilities;

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    breakdown: {
      walletPositive: positiveWallets,
      walletNegative: negativeWallets,
      investments: investmentTotal,
      piutang: piutangTotal,
      utang: utangTotal,
      fixedAssets: fixedAssetsTotal,
    }
  };
}

/**
 * Compute financial health ratios.
 * @param {Object} netWorthData - from computeNetWorth
 * @param {Array} transactions - all transactions
 * @param {Array} debts - all debts
 * @returns {{ debtToAsset, emergencyFundMonths, debtServiceRatio, savingsRate, investmentRatio, overallScore, grade }}
 */
export function computeHealthRatios(netWorthData, transactions, debts) {
  const { totalAssets, totalLiabilities, breakdown } = netWorthData;

  // Get monthly averages from last 3 months of transactions
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const dateStr = threeMonthsAgo.toISOString().slice(0, 10).slice(0, 7);
  const recentTx = transactions.filter(t => t.date >= dateStr);
  const monthlyIncome = recentTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0) / 3;
  const monthlyExpense = recentTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0) / 3;
  const monthlySavings = monthlyIncome - monthlyExpense;

  // Monthly debt service (sum of monthly installments for active interest debts + estimated payments)
  const monthlyDebtService = debts
    .filter(d => d.type === 'utang' && d.status === 'active')
    .reduce((s, d) => s + (d.monthlyInstallment || d.remainingAmount / 12), 0);

  // Liquid assets (wallets only, no investments)
  const liquidAssets = breakdown.walletPositive;

  // Ratios
  const debtToAsset = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
  const emergencyFundMonths = monthlyExpense > 0 ? liquidAssets / monthlyExpense : 0;
  const debtServiceRatio = monthlyIncome > 0 ? (monthlyDebtService / monthlyIncome) * 100 : 0;
  const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0;
  const investmentRatio = totalAssets > 0 ? (breakdown.investments / totalAssets) * 100 : 0;

  // Overall score (0-100)
  let score = 50; // base
  // Debt-to-asset: <30% = +15, 30-50% = +5, >50% = -15
  if (debtToAsset < 30) score += 15;
  else if (debtToAsset < 50) score += 5;
  else score -= 15;
  // Emergency fund: ≥6 months = +20, 3-6 = +10, <3 = -10
  if (emergencyFundMonths >= 6) score += 20;
  else if (emergencyFundMonths >= 3) score += 10;
  else score -= 10;
  // Debt service: <30% = +10, 30-50% = 0, >50% = -15
  if (debtServiceRatio < 30) score += 10;
  else if (debtServiceRatio > 50) score -= 15;
  // Savings rate: >20% = +15, 10-20% = +5, <10% = -10
  if (savingsRate > 20) score += 15;
  else if (savingsRate > 10) score += 5;
  else if (savingsRate < 0) score -= 15;
  else score -= 10;
  // Investment ratio: >20% = +10, <5% = -5
  if (investmentRatio > 20) score += 10;
  else if (investmentRatio < 5) score -= 5;

  score = Math.max(0, Math.min(100, score));

  // Grade. Colours are CSS vars so they follow the theme, and there are two of
  // them: `ring` is the saturated system fill for the 10px donut stroke, `ink`
  // is the darker text-safe variant for the 16px grade label. The reference
  // used a single hex for both, which reads fine on a mockup but is too light
  // for body text and too dark for a thick arc.
  let grade;
  if (score >= 80) grade = { label: 'Sangat Sehat', ring: 'var(--green)', ink: 'var(--green-ink)', soft: 'var(--green-soft)' };
  else if (score >= 60) grade = { label: 'Sehat', ring: 'var(--green)', ink: 'var(--green-ink)', soft: 'var(--green-soft)' };
  else if (score >= 40) grade = { label: 'Perlu Perhatian', ring: 'var(--orange)', ink: 'var(--orange-ink)', soft: 'var(--orange-soft)' };
  else grade = { label: 'Bahaya', ring: 'var(--red)', ink: 'var(--red-ink)', soft: 'var(--red-soft)' };

  return {
    debtToAsset,
    emergencyFundMonths,
    debtServiceRatio,
    savingsRate,
    investmentRatio,
    monthlyIncome,
    monthlyExpense,
    monthlySavings,
    monthlyDebtService,
    overallScore: score,
    grade,
  };
}
