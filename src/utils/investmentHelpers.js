/**
 * Investment Helpers — Pure computation functions for investment portfolio.
 *
 * Provides helpers for computing metrics, portfolio summaries, filtering,
 * sorting, deposito calculations, and transaction generation.
 */

/**
 * Compute total units owned for an investment.
 * @param {Array} transactions - Investment transactions array
 * @returns {number}
 */
export function computeTotalUnits(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return 0;
  return transactions.reduce((sum, tx) => {
    if (tx.type === 'buy') return sum + (tx.units || 0);
    if (tx.type === 'sell') return sum - (tx.units || 0);
    return sum;
  }, 0);
}

/**
 * Compute average buy price from transaction history.
 * Uses weighted average of remaining units after sells.
 * @param {Array} transactions - Investment transactions array
 * @returns {number}
 */
export function computeAvgBuyPrice(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return 0;

  let totalUnits = 0;
  let totalCost = 0;

  for (const tx of transactions) {
    if (tx.type === 'buy') {
      totalUnits += tx.units || 0;
      totalCost += (tx.units || 0) * (tx.pricePerUnit || 0);
    } else if (tx.type === 'sell') {
      const sellUnits = tx.units || 0;
      if (totalUnits > 0) {
        // Remove proportional cost
        const avgAtSell = totalCost / totalUnits;
        totalCost -= avgAtSell * sellUnits;
        totalUnits -= sellUnits;
      }
    }
  }

  if (totalUnits <= 0) return 0;
  return totalCost / totalUnits;
}

/** Opening capital is a holding, not a wallet transaction; never persist this derived entry. */
export function getInvestmentTransactions(investment) {
  const txs = investment.transactions || [];
  if (investment.assetType !== 'deposito' || !(investment.principal > 0)) return txs;
  return [{
    id: 'opening-principal', type: 'buy', units: 1,
    pricePerUnit: investment.principal, totalAmount: investment.principal,
    date: investment.depositDate,
  }, ...txs];
}

export function computeInvestmentMetrics(investment, valuationDate = new Date().toISOString().slice(0, 10)) {
  const txs = [...getInvestmentTransactions(investment)].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const totalUnits = computeTotalUnits(txs);
  const avgBuyPrice = computeAvgBuyPrice(txs);
  const costBasis = totalUnits * avgBuyPrice;

  // For deposito, auto-calculate currentValue
  let currentValue = investment.currentValue || 0;
  if (investment.assetType === 'deposito' && txs.length > 0) {
    const today = valuationDate;
    const endDate = investment.maturityDate && investment.maturityDate < today ? investment.maturityDate : today;
    let units = 0;
    currentValue = 0;
    for (const tx of txs) {
      if (tx.type === 'buy') {
        currentValue += calcDepositoCurrentValue(
          (tx.units || 0) * (tx.pricePerUnit || 0), investment.interestRate || 0, tx.date || today, endDate,
        );
        units += tx.units || 0;
      } else if (tx.type === 'sell' && units > 0) {
        currentValue *= Math.max(0, (units - tx.units) / units);
        units = Math.max(0, units - tx.units);
      }
    }
    currentValue = Math.round(currentValue);
  }

  const unrealizedGain = currentValue - costBasis;
  const returnPercentage = costBasis > 0 ? (unrealizedGain / costBasis) * 100 : 0;

  return {
    totalUnits,
    avgBuyPrice,
    costBasis,
    currentValue,
    unrealizedGain,
    returnPercentage,
  };
}

/**
 * Compute portfolio-level summary from all investments.
 * @param {Array} investments - All investment records
 * @returns {{ totalValue: number, totalCostBasis: number, totalUnrealizedGain: number, totalReturnPercentage: number, allocationByType: Object }}
 */
export function computePortfolioSummary(investments) {
  if (!Array.isArray(investments) || investments.length === 0) {
    return {
      totalValue: 0,
      totalCostBasis: 0,
      totalUnrealizedGain: 0,
      totalReturnPercentage: 0,
      allocationByType: {},
    };
  }

  let totalValue = 0;
  let totalCostBasis = 0;
  const allocationByType = {};

  for (const inv of investments) {
    const metrics = computeInvestmentMetrics(inv);
    totalValue += metrics.currentValue;
    totalCostBasis += metrics.costBasis;

    const type = inv.assetType || 'lainnya';
    allocationByType[type] = (allocationByType[type] || 0) + metrics.currentValue;
  }

  const totalUnrealizedGain = totalValue - totalCostBasis;
  const totalReturnPercentage = totalCostBasis > 0 ? (totalUnrealizedGain / totalCostBasis) * 100 : 0;

  return {
    totalValue,
    totalCostBasis,
    totalUnrealizedGain,
    totalReturnPercentage,
    allocationByType,
  };
}

/**
 * Filter investments by asset type.
 * @param {Array} investments
 * @param {string|null} assetType - null means "all"
 * @returns {Array}
 */
export function filterInvestments(investments, assetType) {
  if (!assetType) return investments;
  return investments.filter((inv) => inv.assetType === assetType);
}

/**
 * Sort investment transactions by date descending.
 * @param {Array} transactions
 * @returns {Array}
 */
export function sortTransactionsByDate(transactions) {
  if (!Array.isArray(transactions)) return [];
  return [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * Calculate deposito current value with accrued interest.
 * @param {number} principal
 * @param {number} annualRate - percentage (e.g. 5 for 5%)
 * @param {string} depositDate - "YYYY-MM-DD"
 * @param {string} today - "YYYY-MM-DD"
 * @returns {number}
 */
export function calcDepositoCurrentValue(principal, annualRate, depositDate, today) {
  if (!principal || principal <= 0 || !annualRate || annualRate <= 0) return principal || 0;
  if (!depositDate || !today) return principal;

  const start = new Date(depositDate + 'T00:00:00');
  const end = new Date(today + 'T00:00:00');
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return principal;

  const days = diffMs / (1000 * 60 * 60 * 24);
  const interest = principal * (annualRate / 100) * (days / 365);
  return Math.round(principal + interest);
}

/**
 * Calculate deposito projected return at maturity.
 * @param {number} principal
 * @param {number} annualRate
 * @param {string} depositDate
 * @param {string} maturityDate
 * @returns {number}
 */
export function calcDepositoProjectedReturn(principal, annualRate, depositDate, maturityDate) {
  if (!principal || principal <= 0 || !annualRate || annualRate <= 0) return 0;
  if (!depositDate || !maturityDate) return 0;

  const start = new Date(depositDate + 'T00:00:00');
  const end = new Date(maturityDate + 'T00:00:00');
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;

  const days = diffMs / (1000 * 60 * 60 * 24);
  return Math.round(principal * (annualRate / 100) * (days / 365));
}

/**
 * Get days remaining until maturity.
 * @param {string} maturityDate - "YYYY-MM-DD"
 * @param {string} today - "YYYY-MM-DD"
 * @returns {number} - negative if past maturity
 */
export function getDaysUntilMaturity(maturityDate, today) {
  if (!maturityDate || !today) return 0;
  const mat = new Date(maturityDate + 'T00:00:00');
  const now = new Date(today + 'T00:00:00');
  const diff = mat.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Build wallet transaction data for an investment buy/sell.
 * @param {'buy'|'sell'} operation
 * @param {Object} investment - The investment record
 * @param {number} totalAmount
 * @param {string} walletId
 * @returns {Object} Transaction data for handleCreateTransaction
 */
export function buildInvestmentTransaction(operation, investment, totalAmount, walletId) {
  const today = new Date().toISOString().slice(0, 10);

  if (operation === 'buy') {
    return {
      date: today,
      walletId,
      type: 'expense',
      categoryId: 'c13', // Investasi
      amount: totalAmount,
      note: `Beli ${investment.name}`,
      tags: ['investasi'],
    };
  }

  // sell
  return {
    date: today,
    walletId,
    type: 'income',
    categoryId: 'c17', // Hasil Investasi
    amount: totalAmount,
    note: `Jual ${investment.name}`,
    tags: ['investasi'],
  };
}
