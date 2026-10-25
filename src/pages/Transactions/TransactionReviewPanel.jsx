import { useId, useRef, useState } from 'react';
import Modal from '../../components/Modal/Modal';
import { fmtFull } from '../../utils/formatters';
import { buildReviewDecision, reviewActionLabel, reviewReasonLabel } from '../../utils/financialReview';

const HISTORY_STATES = ['posted', 'rejected', 'resolved'];
const STATUS = {
  pending: 'Perlu ditinjau', blocked: 'Perlu diperiksa', approved: 'Menunggu pencatatan',
  prepared: 'Menunggu pencatatan', posted: 'Tercatat', rejected: 'Ditolak', resolved: 'Selesai',
};
const NOTICE = 'Belum dicatat dan belum memengaruhi saldo sampai diproses oleh sistem.';
const isAmount = value => Number.isSafeInteger(value) && value >= 0;
const feeOrZero = review => review.fee ?? 0;
// Match Engine.plan: a known destination uses the actual received principal.
const principalFor = (review, choice) => choice?.destination !== 'EXTERNAL' && review.totalCredit != null ? review.totalCredit : review.amount;
const amountLabel = (value, currency = 'IDR') => currency === 'IDR' && isAmount(value) ? fmtFull(value) : 'Belum diketahui';
const timeLabel = value => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Waktu belum diketahui';

// Presentation guards are deliberately stricter than the server proposal: never
// preview rounded/unknown money or endpoints that cannot identify real wallets.
function safeChoices(review) {
  if (review.kind !== 'receipt' || review.state !== 'pending' || review.currency !== 'IDR'
    || !isAmount(review.amount) || review.amount === 0 || !Array.isArray(review.choices)) return [];
  const fee = feeOrZero(review);
  if (!isAmount(fee) || !Number.isSafeInteger(review.amount + fee)) return [];
  const wallet = key => review.walletOptions?.find(option => option.key === key && typeof option.walletId === 'string' && option.walletId);
  return review.choices.filter(choice => {
    try { buildReviewDecision(review, choice); } catch { return false; }
    const principal = principalFor(review, choice);
    if (!isAmount(principal) || principal === 0 || !Number.isSafeInteger(principal + fee)) return false;
    if (choice.action === 'income') return choice.source === 'EXTERNAL' && !!wallet(choice.destination) && fee <= review.amount;
    if (choice.action === 'expense') return !!wallet(choice.source) && choice.destination === 'EXTERNAL';
    return choice.action === 'transfer' && !!wallet(choice.source) && !!wallet(choice.destination)
      && wallet(choice.source).walletId !== wallet(choice.destination).walletId;
  });
}

function ReviewDialog({ review, current, disabled, localMode, onClose, onDecision }) {
  const stale = !current || JSON.stringify(current) !== JSON.stringify(review);
  const selectId = useId();
  const [selected, setSelected] = useState('');
  const [step, setStep] = useState('choose');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');
  const lock = useRef(false);
  const close = () => { if (!lock.current) onClose(); };
  const choices = safeChoices(review);
  const choice = selected === '' ? null : choices[Number(selected)];
  const principal = choice ? principalFor(review, choice) : 0;
  const fee = feeOrZero(review);
  const delta = choice?.action === 'income' ? principal : -(principal + fee);
  const unavailable = saving || stale || disabled;
  const isFinancial = step === 'choose' || step === 'confirm';
  const title = { choose: 'Tinjau transaksi', confirm: 'Konfirmasi pencatatan', reject: 'Tolak transaksi' }[step];

  const submit = async () => {
    if (lock.current || stale || disabled || step === 'choose') return;
    const input = isFinancial ? choice : { action: step, source: null, destination: null };
    if (!input) return;
    lock.current = true;
    setSaving(true);
    setFailure('');
    try {
      buildReviewDecision(review, input);
      await onDecision(review, { action: input.action, source: input.source, destination: input.destination });
      onClose();
    } catch (error) {
      setFailure(error?.message || 'Keputusan gagal dikirim. Silakan coba lagi.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal title={title} onClose={close} width={540}>
      <div className="txReviewIdentity"><strong>{review.provider || 'Penyedia tidak diketahui'}</strong><p className="num">{review.id.slice(0, 8)}</p></div>
      <p className="txReviewNotice">{NOTICE}</p>
      {localMode && <p className="txReviewNotice">Mode lokal — simulasi. Tidak ada pencatatan ke akun cloud.</p>}
      <dl className="txReviewSummary">
        <div><dt>Jumlah</dt><dd className="num">{amountLabel(review.amount, review.currency)}</dd></div>
        <div><dt>Biaya</dt><dd className="num">{amountLabel(review.fee, review.currency)}</dd></div>
      </dl>
      {isFinancial && choices.length > 0 && (step === 'choose' ? (
        <div className="field">
          <label className="inputLabel" htmlFor={selectId}>Pencatatan transaksi</label>
          <select className="inputField txReviewSelect" id={selectId} value={selected} disabled={unavailable} onChange={event => setSelected(event.target.value)}>
            <option value="">Pilih pencatatan</option>
            {choices.map((item, index) => <option key={index} value={index}>{reviewActionLabel(item, review.walletOptions)}</option>)}
          </select>
        </div>
      ) : <p>{reviewActionLabel(choice, review.walletOptions)}</p>)}
      {isFinancial && choice && <div className="txReviewDeltas">
        <p>Perubahan saldo setelah dicatat</p>
        <dl className="txReviewSummary">
          <div>
            <dt>{review.walletOptions.find(option => option.key === (choice.action === 'income' ? choice.destination : choice.source)).name}</dt>
            <dd className="num">{delta > 0 ? '+' : ''}{fmtFull(delta)}</dd>
          </div>
          {choice.action === 'transfer' && <div>
            <dt>{review.walletOptions.find(option => option.key === choice.destination).name}</dt>
            <dd className="num">+{fmtFull(principal)}</dd>
          </div>}
        </dl>
      </div>}
      {isFinancial && choices.length === 0 && <p className="txReviewNotice">Tidak ada pilihan pencatatan yang aman. Nominal, biaya, atau dompet perlu diperiksa oleh pemroses.</p>}
      {step === 'reject' && <p>Yakin menolak bukti transaksi ini? Penolakan tidak mengubah saldo.</p>}

      {stale && <p role="alert" className="txReviewError">Data konfirmasi berubah. Tutup dialog dan tinjau data terbaru.</p>}
      {failure && <p role="alert" className="txReviewError">{failure}</p>}
      {saving && <p role="status">Mengirim keputusan…</p>}
      <div className="modalActions txReviewActions" aria-busy={saving}>
        {step === 'choose' && <button className="btnGhost" type="button" disabled={unavailable} onClick={() => setStep('reject')}>Tolak transaksi</button>}
        {step !== 'choose' && <button className="btnGhost" type="button" disabled={saving} onClick={() => setStep('choose')}>Kembali</button>}
        {step === 'choose' && choices.length > 0 && <button className="btnPrimary" type="button" disabled={!choice || unavailable} onClick={() => setStep('confirm')}>Lanjutkan</button>}
        {step === 'confirm' && <button className="btnPrimary" type="button" disabled={!choice || unavailable} onClick={submit}>Konfirmasi &amp; Catat</button>}
        {step === 'reject' && <button className="btnDanger" type="button" disabled={unavailable} onClick={submit}>Ya, Tolak</button>}

      </div>
    </Modal>
  );
}

export default function TransactionReviewPanel({ reviews = [], loading = false, error = '', onRetry, onDecision, localMode = false }) {
  const headingId = useId();
  const [opened, setOpened] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [acknowledged, setAcknowledged] = useState(new Set());
  const decisionKey = review => `${review.id}:${review.version}`;
  const decide = async (review, input) => {
    await onDecision(review, input);
    setAcknowledged(previous => new Set([...previous, decisionKey(review)]));
  };
  const history = reviews.filter(review => HISTORY_STATES.includes(review.state));
  const active = reviews.filter(review => !HISTORY_STATES.includes(review.state));
  const count = active.filter(review => safeChoices(review).length > 0 && !review.webDecisionAccepted && !acknowledged.has(decisionKey(review))).length;
  const disabled = loading || !!error || !onDecision;

  return (
    <section className="card txReview" aria-labelledby={headingId} aria-busy={loading}>
      <div className="cardHead">
        <div><h2 className="cardTitle" id={headingId}>Perlu Konfirmasi</h2><p className="cardSub">{count} perlu ditinjau</p></div>
        {history.length > 0 && <button className="btnSmallGhost" type="button" aria-expanded={showHistory} onClick={() => setShowHistory(value => !value)}>Riwayat ({history.length})</button>}
      </div>
      <p className="txReviewNotice">Persetujuan berlaku hanya untuk bukti dan revisi yang ditinjau. Status tercatat mengikuti hasil pemroses, bukan saat tombol ditekan.</p>
      {localMode && <p className="txReviewNotice">Mode lokal — simulasi. Tidak ada pencatatan ke akun cloud.</p>}
      {loading && <p role="status">Memuat konfirmasi… Keputusan dinonaktifkan sementara.</p>}
      {error && <div role="alert" className="txReviewError">{error}{onRetry && <button className="btnSmallGhost" type="button" disabled={loading} onClick={onRetry}>Muat ulang</button>}</div>}
      {!loading && !error && active.length === 0 && <p className="txReviewMuted">Tidak ada konfirmasi tertunda.</p>}
      <ul className="txReviewList">
        {[...active, ...(showHistory ? history : [])].map(review => (
          <li key={review.id}>
            <article className="txReviewRow" data-review-id={review.id}>
              <div className="txReviewIdentity">
                <h3>{review.provider || 'Penyedia tidak diketahui'}</h3>
                <p>{timeLabel(review.occurredAt)} · <span className="num">{review.id.slice(0, 8)}</span></p>
                <p>{reviewReasonLabel(review.reason)}</p>
                {review.error && <p className="txReviewError">{review.error}</p>}
              </div>
              <span className="num txReviewAmount">{amountLabel(review.amount, review.currency)}</span>
              <span className="badge badgeInactive">{STATUS[review.state] || 'Perlu diperiksa'}</span>
              {review.state === 'pending' && review.kind === 'receipt' && !review.webDecisionAccepted && <button className="btnSmallPrimary" type="button" disabled={disabled || acknowledged.has(decisionKey(review))} onClick={() => setOpened(review)}>Tinjau</button>}
              {(review.state === 'blocked' || review.webDecisionAccepted) && <p className="txReviewExplanation">Keputusan revisi ini tidak dapat diulang dari web. Tunggu pemroses atau hubungi administrator untuk pemulihan yang aman.</p>}
              {acknowledged.has(decisionKey(review)) && <p className="txReviewExplanation" role="status">Keputusan terkirim. Menunggu pembaruan status dari sistem.</p>}
              {(review.kind === 'delivery' || (review.state === 'blocked' && review.event_id != null)) && <p className="txReviewExplanation">Tidak dapat dikonfirmasi dari panel ini. Pemroses perlu memeriksa status pengiriman atau pencatatan.</p>}
            </article>
          </li>
        ))}
      </ul>
      {opened && <ReviewDialog review={opened} current={reviews.find(review => review.id === opened.id)} localMode={localMode} disabled={disabled} onDecision={decide} onClose={() => setOpened(null)} />}
    </section>
  );
}
