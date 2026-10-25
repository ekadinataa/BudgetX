/** Synthetic reference-like wallets only; never imported by the production app. */
export function compactWalletState() {
  const month = new Date().toISOString().slice(0, 7);
  return {
    page: 'wallet', categories: [], budgets: {},
    wallets: [
      { id: 'test-bank', name: 'BCA', type: 'bank', balance: 8500000, color: '#2563eb', note: '7890' },
      { id: 'test-ewallet', name: 'GoPay', type: 'ewallet', balance: 350000, color: '#06b6d4' },
      { id: 'test-ewallet-2', name: 'OVO', type: 'ewallet', balance: 125000, color: '#7c3aed' },
      { id: 'test-bank-2', name: 'BNI', type: 'bank', balance: 2200000, color: '#f97316', note: '1234' },
      { id: 'test-cash', name: 'Tunai', type: 'cash', balance: 400000, color: '#22c55e' },
      { id: 'test-credit', name: 'Kredivo', type: 'paylater', balance: -750000, color: '#ef4444', creditLimit: 4000000, heldAmount: 250000 },
      { id: 'test-bank-3', name: 'Bank Cadangan', type: 'bank', balance: -10000, color: '#ffffff' },
      { id: 'test-credit-2', name: 'Kartu Kredit', type: 'credit', balance: -200000, color: '#000000', creditLimit: 10000000, heldAmount: 100000 },
      { id: 'test-credit-3', name: 'Kartu Lama', type: 'credit', balance: 120000, color: '#fef3c7' },
      { id: 'test-credit-4', name: 'PayLater Cadangan', type: 'paylater', balance: 0, color: '#16a34a', creditLimit: 30000000 },
    ],
    transactions: [
      { id: 'test-in', walletId: 'test-bank', date: `${month}-01`, type: 'income', amount: 13500000 },
      { id: 'test-out', walletId: 'test-bank', date: `${month}-02`, type: 'expense', amount: 4700000 },
      { id: 'test-out-2', walletId: 'test-ewallet', date: `${month}-03`, type: 'expense', amount: 535000 },
    ],
  };
}
