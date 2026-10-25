// Synthetic review-only fixtures. Never install these records into production.
export function financialReviewFixture(extra = {}) {
  return {
    schemaVersion: 1, id: 'a'.repeat(64), version: 'b'.repeat(16), kind: 'receipt', state: 'pending',
    amount: 125000, fee: 2500, currency: 'IDR', occurredAt: '2026-10-25T05:30:00.000Z',
    provider: 'BANK UJI', reason: 'unresolved_endpoint', error: null,
    source: 'BANK', destination: 'UNRESOLVED', event_id: null,
    choices: [
      { action: 'expense', source: 'BANK', destination: 'EXTERNAL' },
      { action: 'transfer', source: 'BANK', destination: 'SAVINGS' },
    ],
    walletOptions: [{ key: 'BANK', walletId: 'w1', name: 'Rekening Harian' }, { key: 'SAVINGS', walletId: 'w2', name: 'Tabungan' }],
    updatedAt: '2026-10-25T06:00:00.000Z', ...extra,
  };
}
export function financialReviewAppState(darkMode = false) {
  return {
    page: 'tx', darkMode, density: 'standard', radius: 'soft',
    wallets: [{ id: 'w1', name: 'Rekening Harian', type: 'Bank', balance: 1000000, color: '#007aff' }, { id: 'w2', name: 'Tabungan', type: 'Bank', balance: 2000000, color: '#34c759' }],
    transactions: [], budgets: {}, categories: [], wishlistGroups: [],
  };
}
