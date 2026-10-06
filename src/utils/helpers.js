/**
 * Helper utility functions for BudgetX.
 *
 * Includes lookup helpers, label/color mappers, billing cycle period range
 * computation, transaction filtering/grouping, and wallet aggregate utilities.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 7.6, 7.7
 */

import { adjustCycleStart } from './periodAdjuster.js';

/**
 * Find a category by ID.
 *
 * @param {string} id - Category ID
 * @param {Array} categories - Array of Category objects
 * @returns {object|undefined} The matching Category or undefined
 */
export function getCatById(id, categories) {
  return categories.find((c) => c.id === id);
}

/**
 * Get the emoji icon for a category.
 * Falls back to name-based lookup for categories stored in Firestore without icon field.
 *
 * @param {object} category - Category object (may or may not have `icon` field)
 * @returns {string} Emoji string
 */
export function getCatIcon(category) {
  if (!category) return '📦';
  if (category.icon) return category.icon;
  // Fallback: map by name for existing Firestore data without icon field
  const nameMap = {
    'makanan': '🍔',
    'transport': '🚗',
    'utilitas': '💡',
    'kesehatan': '💊',
    'pendidikan': '📚',
    'belanja': '🛒',
    'hiburan': '🎮',
    'makan di luar': '🍽️',
    'fashion': '👕',
    'langganan': '📱',
    'hobi': '🎨',
    'dana darurat': '🛡️',
    'investasi': '📈',
    'dana pensiun': '🏖️',
    'gaji': '💰',
    'freelance': '💻',
    'hasil investasi': '💵',
    'lainnya': '📦',
  };
  const name = (category.name || '').toLowerCase();
  for (const [key, emoji] of Object.entries(nameMap)) {
    if (name.includes(key)) return emoji;
  }
  // Final fallback: first letter
  return category.name ? category.name.charAt(0) : '📦';
}

/**
 * Find a wallet by ID.
 *
 * @param {string} id - Wallet ID
 * @param {Array} wallets - Array of Wallet objects
 * @returns {object|undefined} The matching Wallet or undefined
 */
export function getWalletById(id, wallets) {
  return wallets.find((w) => w.id === id);
}

/** Credit metrics are derived only; a missing legacy plafon remains unknown. */
export function getCreditPosition(wallet) {
  return {
    outstanding: Math.max(-wallet.balance, 0),
    availableLimit: wallet.creditLimit === undefined
      ? null
      : Math.max(wallet.creditLimit + wallet.balance - (wallet.heldAmount ?? 0), 0),
  };
}

export function walletTypeLabel(type) {
  const map = {
    bank: 'Bank',
    ewallet: 'E-Wallet',
    credit: 'Kartu Kredit',
    paylater: 'PayLater',
    cash: 'Tunai/Cash',
  };
  return map[type] || type;
}

/**
 * Return the Indonesian label for a budget section.
 *
 * @param {string} s - One of 'needs', 'wants', 'savings', 'income'
 * @returns {string} Indonesian label
 */
export function sectionLabel(s) {
  const map = {
    needs: 'Kebutuhan',
    wants: 'Keinginan',
    savings: 'Tabungan',
    income: 'Pemasukan',
  };
  return map[s] || s;
}

/**
 * Return the hex color for a budget section.
 *
 * @param {string} s - One of 'needs', 'wants', 'savings'
 * @returns {string} Hex color string
 */
export function sectionColor(s) {
  const map = {
    needs: '#4F6EF7',
    wants: '#F59E0B',
    savings: '#22C55E',
  };
  return map[s] || '#A855F7';
}

/**
 * Compute the billing cycle date range for a given month key and cycle start day.
 *
 * When cycleStart <= 1, the range is the first to last day of the given month.
 * Otherwise, the range starts on cycleStart of the previous month and ends on
 * cycleStart-1 of the current month.
 *
 * When `salaryAdjust` is true and `cycleStart > 1`, the nominal cycle start day
 * is adjusted to the nearest preceding business day (via `adjustCycleStart`) for
 * both the start and end date computations. This aligns the budget period with
 * the actual salary receipt date when payday falls on a weekend or holiday.
 *
 * @param {string} refMk - Month key in "YYYY-MM" format
 * @param {number} cycleStart - Cycle start day (1–28)
 * @param {boolean} [salaryAdjust=false] - Whether to adjust for weekends/holidays
 * @returns {{ start: string, end: string, label: string }} Date range and label
 */
export function getPeriodRange(refMk, cycleStart, salaryAdjust = false) {
  const [y, m] = refMk.split('-').map(Number);

  if (cycleStart <= 1) {
    const lastDay = new Date(y, m, 0).getDate();
    return {
      start: `${refMk}-01`,
      end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      label: new Date(y, m - 1, 1).toLocaleDateString('id-ID', {
        month: 'long',
        year: 'numeric',
      }),
    };
  }

  // Previous month coordinates
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;

  if (salaryAdjust) {
    // Adjust the cycle start for the previous month (start date)
    const adjustedStart = adjustCycleStart(prevY, prevM, cycleStart);
    // Adjust the cycle start for the current month, then subtract 1 day (end date)
    const adjustedCurrentPayday = adjustCycleStart(y, m, cycleStart);
    const endDate = new Date(adjustedCurrentPayday);
    endDate.setDate(endDate.getDate() - 1);

    const startStr = `${adjustedStart.getFullYear()}-${String(adjustedStart.getMonth() + 1).padStart(2, '0')}-${String(adjustedStart.getDate()).padStart(2, '0')}`;
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    const startFmt = new Date(startStr + 'T00:00:00').toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
    });
    const endFmt = new Date(endStr + 'T00:00:00').toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return { start: startStr, end: endStr, label: `${startFmt} – ${endFmt}` };
  }

  // e.g. cycleStart=25, Apr → 25 Mar – 24 Apr
  const endDay = Math.min(cycleStart - 1, new Date(y, m, 0).getDate());
  const startDay = Math.min(cycleStart, new Date(prevY, prevM, 0).getDate());

  const startStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const endStr = `${y}-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

  const startFmt = new Date(startStr + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  });
  const endFmt = new Date(endStr + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return { start: startStr, end: endStr, label: `${startFmt} – ${endFmt}` };
}

/**
 * Filter transactions whose date falls within [start, end] inclusive.
 *
 * @param {Array} txs - Array of Transaction objects (each with a `date` string)
 * @param {{ start: string, end: string }} range - Date range
 * @returns {Array} Filtered transactions
 */
export function filterByRange(txs, range) {
  return txs.filter((t) => t.date >= range.start && t.date <= range.end);
}

/**
 * Group transactions by date, producing an array of { date, transactions } objects
 * sorted by date descending. Transactions within each group preserve their order.
 *
 * @param {Array} txs - Array of Transaction objects sorted by date descending
 * @returns {Array<{ date: string, transactions: Array }>} Grouped transactions
 */
export function groupTransactionsByDate(txs) {
  const groups = [];
  let lastDate = null;
  let currentGroup = null;

  for (const t of txs) {
    if (t.date !== lastDate) {
      currentGroup = { date: t.date, transactions: [] };
      groups.push(currentGroup);
      lastDate = t.date;
    }
    currentGroup.transactions.push(t);
  }

  return groups;
}

/**
 * Get the most recent non-transfer transactions, up to `limit` items,
 * sorted by date descending.
 *
 * @param {Array} txs - Array of Transaction objects
 * @param {number} [limit=6] - Maximum number of transactions to return
 * @returns {Array} Recent non-transfer transactions
 */
export function getRecentTransactions(txs, limit = 6) {
  return [...txs]
    .filter((t) => t.type !== 'transfer')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/**
 * Compute wallet aggregate values: net balance, total assets, and total debt.
 *
 * @param {Array} wallets - Array of Wallet objects
 * @returns {{ netBalance: number, totalAsset: number, totalDebt: number }}
 */
export function computeWalletAggregates(wallets) {
  let netBalance = 0;
  let totalAsset = 0;
  let totalDebt = 0;

  for (const w of wallets) {
    netBalance += w.balance;
    if (w.balance >= 0) {
      totalAsset += w.balance;
    } else {
      totalDebt += w.balance;
    }
  }

  return { netBalance, totalAsset, totalDebt };
}

/**
 * Filter categories by transaction type.
 * Income-type transactions get only income-section categories.
 * Expense-type transactions get only non-income-section categories.
 *
 * @param {Array} categories - Array of Category objects
 * @param {string} txType - 'income' or 'expense'
 * @returns {Array} Filtered categories
 */
export function filterCategoriesByTxType(categories, txType) {
  if (txType === 'income') {
    return categories.filter((c) => c.section === 'income');
  }
  return categories.filter((c) => c.section !== 'income');
}

/**
 * Generate a deterministic period key from start and end dates.
 *
 * @param {string} start - Start date in "YYYY-MM-DD" format
 * @param {string} end - End date in "YYYY-MM-DD" format
 * @returns {string} Period key, e.g. "range_2026-05-23_2026-06-24"
 */
export function getCustomRangeKey(start, end) {
  return `range_${start}_${end}`;
}

/**
 * Deep-clone a budget object for copying to a new period.
 *
 * Clones totalIncome, section totals, and category allocations.
 * Does NOT copy transaction data.
 *
 * @param {object} budget - Source budget
 *   `{ totalIncome: number, sections: { needs: { total, cats }, wants: { total, cats }, savings: { total, cats } } }`
 * @returns {object} Deep-cloned budget with the same structure
 */
export function deepCloneBudget(budget) {
  return {
    totalIncome: budget.totalIncome,
    sections: {
      needs: {
        total: budget.sections.needs.total,
        cats: budget.sections.needs.cats.map((c) => ({ ...c })),
      },
      wants: {
        total: budget.sections.wants.total,
        cats: budget.sections.wants.cats.map((c) => ({ ...c })),
      },
      savings: {
        total: budget.sections.savings.total,
        cats: budget.sections.savings.cats.map((c) => ({ ...c })),
      },
    },
  };
}

/**
 * Validate that a custom range has end date strictly after start date.
 *
 * Lexicographic comparison works correctly for "YYYY-MM-DD" formatted strings.
 *
 * @param {string} start - Start date in "YYYY-MM-DD" format
 * @param {string} end - End date in "YYYY-MM-DD" format
 * @returns {boolean} true if the range is valid (end > start)
 */
export function isValidCustomRange(start, end) {
  return start < end;
}

/**
 * Find the active custom range period.
 *
 * Returns the range that contains `today` (where start <= today <= end).
 * If no range contains today, returns the most recent range by start date.
 * Returns null if the ranges array is empty.
 *
 * @param {Array<{ id: string, start: string, end: string }>} ranges - Custom range periods
 * @param {string} today - Current date in "YYYY-MM-DD" format
 * @returns {object|null} The active range or null
 */
export function findActiveRange(ranges, today) {
  if (!ranges || ranges.length === 0) return null;

  const containing = ranges.find((r) => r.start <= today && today <= r.end);
  if (containing) return containing;

  const sorted = [...ranges].sort((a, b) => b.start.localeCompare(a.start));
  return sorted[0];
}
