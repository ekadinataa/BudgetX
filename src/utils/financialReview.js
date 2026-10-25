/** Decision intents only: these helpers never create transactions or affect balances. */
function validateIdentity(review) {
  if (!review || typeof review.id !== 'string' || !/^[a-f0-9]{64}$/.test(review.id)
    || typeof review.version !== 'string' || !/^[a-f0-9]{16}$/.test(review.version)) {
    throw new Error('Identitas konfirmasi tidak valid.');
  }
}

export function buildReviewDecision(review, input) {
  validateIdentity(review);
  if (review.schemaVersion !== 1 || review.kind !== 'receipt' || review.webDecisionAccepted === true
    || !['pending', 'blocked'].includes(review.state)
    || (review.state === 'blocked' && review.event_id != null)) {
    throw new Error('Konfirmasi ini tidak dapat diproses lagi. Muat ulang data terbaru.');
  }
  if (!input || typeof input !== 'object') throw new Error('Pilih tindakan konfirmasi.');
  const { action } = input;
  let source = input.source ?? null;
  let destination = input.destination ?? null;
  if (action === 'reject') {
    if (source !== null || destination !== null) throw new Error('Tolak tidak boleh mengubah dompet.');
    source = null;
    destination = null;
  } else if (review.state !== 'pending' || !['income', 'expense', 'transfer'].includes(action)
    || ![source, destination].every(key => typeof key === 'string' && key.length > 0 && key.length <= 1000)
    || !Array.isArray(review.choices) || !review.choices.some(choice => choice
      && choice.action === action && choice.source === source && choice.destination === destination)) {
    throw new Error('Pilihan konfirmasi tidak sesuai dengan usulan terbaru.');
  }
  return { reviewId: review.id, version: review.version, action, source, destination };
}

export function reviewDecisionId(review) {
  validateIdentity(review);
  return `${review.id}--${review.version}`;
}

export function reviewActionLabel(choice, walletOptions = []) {
  if (choice?.action === 'reject') return 'Tolak';
  const labels = { income: 'Pemasukan', expense: 'Pengeluaran', transfer: 'Transfer' };
  if (!Object.hasOwn(labels, choice?.action)) return 'Tindakan tidak dikenal';
  const title = labels[choice.action];
  const name = key => key === 'EXTERNAL' ? 'Eksternal'
    : (Array.isArray(walletOptions) && walletOptions.find(wallet => wallet?.key === key)?.name) || key || 'Dompet tidak dikenal';
  return `${title}: ${name(choice.source)} → ${name(choice.destination)}`;
}

export function reviewReasonLabel(reason) {
  const labels = {
    ambiguous_wallet: 'Dompet belum dapat ditentukan',
    unknown_wallet: 'Dompet belum dikenali',
    ambiguous_direction: 'Arah transaksi belum dapat ditentukan',
    missing_amount: 'Nominal belum ditemukan',
    duplicate_candidate: 'Kemungkinan transaksi duplikat',
    publication_failed: 'Pencatatan belum berhasil',
    insufficient_funds: 'Saldo belum mencukupi',
    manual_review: 'Perlu konfirmasi manual',
  };
  return Object.hasOwn(labels, reason) ? labels[reason] : 'Perlu diperiksa';
}
