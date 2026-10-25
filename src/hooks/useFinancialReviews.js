import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../config/firebase';
import { subscribeFinancialReviews, submitFinancialReviewDecision } from '../services/financialReviewService';
import { buildReviewDecision, reviewDecisionId } from '../utils/financialReview';

export const LOCAL_REVIEW_KEY = 'budgetku_financial_reviews';
function loadLocal() {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_REVIEW_KEY));
    if (Array.isArray(value?.reviews) && value?.decisions && typeof value.decisions === 'object') return value;
  } catch { /* A malformed local simulation is not financial evidence. */ }
  return { reviews: [], decisions: {} };
}

/** Review state is operational, never a source of wallet/transaction mutations. */
export function useFinancialReviews({ uid, localMode, enabled = true }) {
  const [local, setLocal] = useState(loadLocal);
  const localRef = useRef(local);
  const [remote, setRemote] = useState({ uid: null, reviews: [], loading: true, error: '' });
  const [retry, setRetry] = useState(0);
  const readyRef = useRef(null);
  useEffect(() => {
    if (localMode) return;
    let active = true;
    readyRef.current = null;
    const current = () => active && enabled && uid && auth?.currentUser?.uid === uid;
    // Auth is an external system; invalidate only this independent subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemote({ uid, reviews: [], loading: Boolean(enabled && uid), error: '' });
    if (!enabled || !uid) return () => { active = false; };
    const onData = reviews => {
      if (!current()) return;
      readyRef.current = uid;
      setRemote({ uid, reviews, loading: false, error: '' });
    };
    const onError = () => {
      if (!current()) return;
      readyRef.current = null;
      setRemote({ uid, reviews: [], loading: false, error: 'Gagal memuat antrean konfirmasi. Periksa koneksi Anda.' });
    };
    const onSync = authoritative => {
      if (!current() || authoritative) return;
      readyRef.current = null;
      setRemote(previous => ({ ...previous, uid, loading: true, error: '' }));
    };
    let stop = () => {};
    try { stop = subscribeFinancialReviews(uid, onData, onError, onSync); }
    catch { onError(); }
    return () => { active = false; readyRef.current = null; stop(); };
  }, [uid, localMode, enabled, retry]);

  const onDecision = useCallback(async (review, input) => {
    if (!localMode) {
      if (!enabled || auth?.currentUser?.uid !== uid) throw new Error('Sesi pengguna berubah. Muat ulang antrean.');
      if (readyRef.current !== uid) throw new Error('Tunggu sinkronisasi antrean konfirmasi.');
      // Service re-reads current version/state transactionally. Snapshots own UI state.
      return submitFinancialReviewDecision(review, input);
    }
    const id = reviewDecisionId(review);
    const requested = buildReviewDecision(review, input);
    const previous = localRef.current.decisions[id];
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(requested)) throw new Error('Keputusan berbeda sudah disimpan untuk revisi ini.');
      return previous;
    }
    const current = localRef.current.reviews.find(row => row.id === review.id);
    if (!current || current.version !== review.version) throw new Error('Bukti berubah. Tinjau ulang antrean.');
    const decision = buildReviewDecision(current, input);
    const next = {
      reviews: localRef.current.reviews.map(row => row.id === current.id
        ? { ...row, state: decision.action === 'reject' ? 'rejected' : 'approved' } : row),
      decisions: { ...localRef.current.decisions, [id]: decision },
    };
    // Persist first: a storage failure must not falsely acknowledge a saved decision.
    localStorage.setItem(LOCAL_REVIEW_KEY, JSON.stringify(next));
    localRef.current = next;
    setLocal(next);
    return decision;
  }, [uid, localMode, enabled]);
  const onRetry = useCallback(() => setRetry(value => value + 1), []);
  const current = remote.uid === uid && enabled;
  return {
    reviews: localMode ? local.reviews : current ? remote.reviews : [],
    loading: localMode ? false : current ? remote.loading : Boolean(enabled && uid),
    error: localMode ? '' : current ? remote.error : '',
    onDecision, onRetry, localMode,
  };
}
