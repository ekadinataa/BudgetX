/** Review mirrors are read-only; only decision intents may be submitted here. */
import { db, auth } from '../config/firebase';
import { collection, doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { buildReviewDecision, reviewDecisionId } from '../utils/financialReview.js';

function getUid() {
  const uid = auth?.currentUser?.uid;
  if (!db || typeof uid !== 'string' || !uid || uid.includes('/') || uid === '.' || uid === '..') {
    throw new Error('Silakan masuk untuk mengonfirmasi transaksi.');
  }
  return uid;
}

function assertUid(uid) {
  if (auth?.currentUser?.uid !== uid) throw new Error('Sesi pengguna berubah. Silakan masuk kembali.');
}

export async function submitFinancialReviewDecision(review, input) {
  const uid = getUid();
  const intent = buildReviewDecision(review, input);
  const mirrorRef = doc(db, 'users', uid, 'financialReviews', intent.reviewId);
  const decisionRef = doc(db, 'users', uid, 'financialReviewDecisions', reviewDecisionId(review));
  const result = await runTransaction(db, async transaction => {
    assertUid(uid);
    const mirror = await transaction.get(mirrorRef);
    assertUid(uid);
    if (!mirror.exists()) throw new Error('Konfirmasi tidak ditemukan. Muat ulang data terbaru.');
    const current = mirror.data();
    if (current.id !== intent.reviewId || current.version !== intent.version
      || current.schemaVersion !== 1 || current.kind !== 'receipt') {
      throw new Error('Versi konfirmasi telah berubah. Muat ulang data terbaru.');
    }
    const existing = await transaction.get(decisionRef);
    assertUid(uid);
    if (existing.exists()) {
      const decision = existing.data();
      if (decision.schemaVersion !== 1 || decision.uid !== uid
        || !Object.entries(intent).every(([key, value]) => decision[key] === value)) {
        throw new Error('Konfirmasi ini sudah memiliki keputusan yang berbeda.');
      }
      // An already recorded identical intent is successful without another write,
      // even if the worker has since processed it. A different version is never reused.
      return decision;
    }
    const fresh = buildReviewDecision(current, intent);
    const decision = { schemaVersion: 1, uid, ...fresh, createdAt: new Date().toISOString() };
    assertUid(uid);
    transaction.set(decisionRef, decision);
    return decision;
  });
  assertUid(uid);
  return result;
}

export function subscribeFinancialReviews(uid, onData, onError, onSync) {
  if (uid !== getUid()) throw new Error('Sesi pengguna tidak sesuai.');
  let active = true;
  let latestReviews = null;
  let latestDecisions = null; // set of decisionId strings that exist in Firestore
  let reviewsReady = false;
  let decisionsReady = false;

  function merge() {
    if (!active || !reviewsReady || !decisionsReady) return;
    onData(latestReviews.map(r => ({
      ...r,
      webDecisionAccepted: r.webDecisionAccepted || latestDecisions.has(`${r.id}--${r.version}`),
    })));
  }

  const stopReviews = onSnapshot(
    collection(db, 'users', uid, 'financialReviews'),
    { includeMetadataChanges: true },
    snapshot => {
      if (!active || auth?.currentUser?.uid !== uid) return;
      const authoritative = snapshot.metadata?.fromCache === false && snapshot.metadata?.hasPendingWrites === false;
      onSync?.(authoritative);
      if (authoritative) {
        latestReviews = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
        reviewsReady = true;
        merge();
      }
    },
    error => { if (active && auth?.currentUser?.uid === uid) onError?.(error); }
  );

  const stopDecisions = onSnapshot(
    collection(db, 'users', uid, 'financialReviewDecisions'),
    snapshot => {
      if (!active || auth?.currentUser?.uid !== uid) return;
      latestDecisions = new Set(snapshot.docs.map(d => d.id));
      decisionsReady = true;
      merge();
    },
    () => {
      // decisions read failure is non-fatal: fall back to mirror only
      if (!active) return;
      if (!decisionsReady) { latestDecisions = new Set(); decisionsReady = true; merge(); }
    }
  );

  return () => { active = false; stopReviews(); stopDecisions(); };
}
