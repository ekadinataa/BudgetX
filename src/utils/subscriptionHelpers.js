/**
 * Subscription & Bill Management Helpers
 *
 * Utility functions for subscription cost calculations,
 * due date tracking, and payment transaction building.
 */

/**
 * Calculate total monthly cost from all active subscriptions.
 * Converts yearly (÷12) and weekly (×4.33) to monthly.
 *
 * @param {Array} subscriptions - All subscription records
 * @returns {number} Total monthly cost in Rp
 */
export function calcTotalMonthlyCost(subscriptions) {
  return subscriptions
    .filter((s) => s.isActive)
    .reduce((total, s) => {
      const amount = Number(s.amount) || 0;
      switch (s.billingCycle) {
        case 'tahunan':
          return total + amount / 12;
        case 'mingguan':
          return total + amount * 4.33;
        case 'bulanan':
        default:
          return total + amount;
      }
    }, 0);
}

/**
 * Calculate total yearly cost from all active subscriptions.
 * Converts monthly (×12) and weekly (×52) to yearly.
 *
 * @param {Array} subscriptions - All subscription records
 * @returns {number} Total yearly cost in Rp
 */
export function calcTotalYearlyCost(subscriptions) {
  return subscriptions
    .filter((s) => s.isActive)
    .reduce((total, s) => {
      const amount = Number(s.amount) || 0;
      switch (s.billingCycle) {
        case 'bulanan':
          return total + amount * 12;
        case 'mingguan':
          return total + amount * 52;
        case 'tahunan':
        default:
          return total + amount;
      }
    }, 0);
}

/**
 * Get number of days until the next due date.
 * Negative = overdue, 0 = today, positive = days remaining.
 *
 * @param {string} nextDueDate - "YYYY-MM-DD" format
 * @param {Date} [today] - Reference date (defaults to now)
 * @returns {number} Days until due (negative if overdue)
 */
export function getDaysUntilDue(nextDueDate, today = new Date()) {
  if (!nextDueDate) return Infinity;
  const due = new Date(nextDueDate + 'T00:00:00');
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = due.getTime() - now.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Advance the due date by one billing cycle.
 *
 * @param {string} currentDueDate - "YYYY-MM-DD" format
 * @param {string} billingCycle - "bulanan", "tahunan", or "mingguan"
 * @returns {string} New due date in "YYYY-MM-DD" format
 */
export function advanceDueDate(currentDueDate, billingCycle) {
  const date = new Date(currentDueDate + 'T00:00:00');

  switch (billingCycle) {
    case 'bulanan':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'tahunan':
      date.setFullYear(date.getFullYear() + 1);
      break;
    case 'mingguan':
      date.setDate(date.getDate() + 7);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get subscriptions that are due within 7 days (upcoming).
 *
 * @param {Array} subscriptions - All subscription records
 * @param {Date} [today] - Reference date
 * @returns {Array} Subscriptions due within 7 days (sorted by urgency)
 */
export function getUpcomingSubscriptions(subscriptions, today = new Date()) {
  return subscriptions
    .filter((s) => s.isActive)
    .map((s) => ({ ...s, _daysUntilDue: getDaysUntilDue(s.nextDueDate, today) }))
    .filter((s) => s._daysUntilDue <= 7)
    .sort((a, b) => a._daysUntilDue - b._daysUntilDue);
}

/**
 * Get subscriptions that are overdue (past due date).
 *
 * @param {Array} subscriptions - All subscription records
 * @param {Date} [today] - Reference date
 * @returns {Array} Overdue subscriptions
 */
export function getOverdueSubscriptions(subscriptions, today = new Date()) {
  return subscriptions
    .filter((s) => s.isActive)
    .filter((s) => getDaysUntilDue(s.nextDueDate, today) < 0);
}

/**
 * Build a transaction object for a subscription payment.
 *
 * @param {Object} subscription - The subscription being paid
 * @param {string} date - Payment date "YYYY-MM-DD"
 * @param {string} walletId - Wallet to charge
 * @returns {Object} Transaction data ready for createTransaction
 */
export function buildSubscriptionTransaction(subscription, date, walletId) {
  return {
    date,
    walletId,
    type: 'expense',
    categoryId: 'c10', // "Langganan" category
    amount: subscription.amount,
    note: `Bayar ${subscription.name}`,
    tags: ['langganan'],
  };
}

/**
 * Get billing cycle label in Indonesian.
 *
 * @param {string} cycle - "bulanan", "tahunan", or "mingguan"
 * @returns {string} Human-readable label
 */
export function getBillingCycleLabel(cycle) {
  switch (cycle) {
    case 'bulanan': return '/bulan';
    case 'tahunan': return '/tahun';
    case 'mingguan': return '/minggu';
    default: return '/bulan';
  }
}

/**
 * Get category info (emoji + label) for subscription categories.
 *
 * @param {string} category - Category key
 * @returns {{ emoji: string, label: string }}
 */
export function getSubscriptionCategoryInfo(category) {
  const map = {
    streaming: { emoji: '🎬', label: 'Streaming' },
    utilitas: { emoji: '💡', label: 'Utilitas' },
    internet: { emoji: '🌐', label: 'Internet & Telepon' },
    asuransi: { emoji: '🛡️', label: 'Asuransi' },
    fitness: { emoji: '💪', label: 'Fitness & Gym' },
    cloud: { emoji: '☁️', label: 'Cloud & Storage' },
    edukasi: { emoji: '📚', label: 'Edukasi' },
    lainnya: { emoji: '📦', label: 'Lainnya' },
  };
  return map[category] || map.lainnya;
}
