/** Build the audit entry shared by local state and the atomic cloud wallet edit. */
export function buildWalletAdjustment(wallet, data, adjustment = {}) {
  const balanceAfter = data.balance === undefined ? wallet.balance : data.balance;
  if (!Number.isFinite(wallet.balance) || !Number.isFinite(balanceAfter) || !Number.isFinite(balanceAfter - wallet.balance)) {
    throw new Error('Saldo harus berupa angka terbatas.');
  }
  if (balanceAfter !== wallet.balance && !Number.isFinite(adjustment.expectedBalance)) {
    throw new Error('Saldo awal yang ditinjau wajib berupa angka terbatas.');
  }
  if (adjustment.expectedBalance !== undefined && adjustment.expectedBalance !== wallet.balance) {
    throw new Error('Saldo dompet berubah. Tinjau saldo terbaru sebelum menyimpan kembali.');
  }
  if (balanceAfter === wallet.balance) return null;
  if (typeof adjustment.reason !== 'string' || !adjustment.reason.trim()) {
    throw new Error('Alasan penyesuaian saldo wajib diisi.');
  }
  if (adjustment.reason.trim().length > 1000) {
    throw new Error('Alasan penyesuaian saldo maksimal 1000 karakter.');
  }
  const date = new Date();
  return {
    type: 'adjustment', amount: data.balance - wallet.balance,
    categoryId: null, toWalletId: null, tags: [], note: adjustment.reason.trim(),
    balanceBefore: wallet.balance, balanceAfter: data.balance, walletId: wallet.id,
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  };
}
