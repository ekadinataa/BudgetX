import { useState } from 'react';
import { fmtFull, rp, rpShort, monthKey } from '../../utils/formatters';
import { getCreditPosition, walletTypeLabel } from '../../utils/helpers';
import WalletIcon from '../../components/ui/WalletIcon';
import NavIcon from '../../components/icons/NavIcon';
import Modal from '../../components/Modal/Modal';

/**
 * Compact reference card: icon/actions, identity, signed balance, monthly flow.
 * Credit metrics remain derived from the live wallet and available on demand;
 * opening their read-only dialog never changes the account grid or wallet data.
 *
 * @param {Object} props
 * @param {Object} props.wallet - Wallet object
 * @param {Array} props.transactions - All transactions
 * @param {Function} props.onEdit - Callback when edit button is clicked
 * @param {Function} props.onDelete - Callback when delete button is clicked
 */
export default function WalletCard({ wallet: w, transactions, onEdit, onDelete }) {
  const [showCredit, setShowCredit] = useState(false);
  const isCredit = w.type === 'credit' || w.type === 'paylater';
  const credit = isCredit ? getCreditPosition(w) : null;
  const mk = monthKey(new Date());
  const txs = transactions.filter(
    (t) => (t.walletId === w.id || t.toWalletId === w.id) && t.date.startsWith(mk)
  );
  const income = txs
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const expense = txs
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  const monthLabel = new Date().toLocaleDateString('id-ID', { month: 'short' });

  return (
    <article className="card walletCard" aria-label={w.name} style={w.color ? { '--wallet-accent': w.color } : undefined}>
      <div className="walletCardHeader">
        <div className="walletIcon">
          <WalletIcon type={w.type} size={17} aria-hidden="true" />
        </div>
        <div className="walletCardActions">
          <button type="button" className="iconBtn" onClick={onEdit} aria-label={`Edit ${w.name}`}>
            <NavIcon name="edit" size={15} />
          </button>
          <button type="button" className="iconBtn iconBtnDanger" onClick={onDelete} aria-label={`Hapus ${w.name}`}>
            <NavIcon name="trash" size={15} />
          </button>
        </div>
      </div>
      <div className="walletCardIdentity">
        <h2 className="walletName" title={w.name}>{w.name}</h2>
        <p className="walletType truncate" title={w.note || undefined}>
          {walletTypeLabel(w.type)}{w.note ? ` · ${w.note}` : ''}
        </p>
      </div>
      <div className={`walletBalance num${w.balance < 0 ? ' walletBalanceNegative' : ''}`}>{rp(w.balance)}</div>
      {isCredit && <button type="button" className="walletCreditToggle" aria-label={`Rincian kredit ${w.name}`} aria-haspopup="dialog" onClick={() => setShowCredit(true)}>
        Rincian kredit <NavIcon name="chevron" size={14} />
      </button>}
      <footer className="walletCardFooter" aria-label={`Arus kas ${monthLabel}`}>
        <span title={`Pemasukan ${monthLabel}: ${fmtFull(income)}`}>
          <span className="walletCardFooterLabel">Masuk</span>{' '}
          <strong className="walletCardFooterValue amountIn num">{rpShort(income)}</strong>
        </span>
        <span title={`Pengeluaran ${monthLabel}: ${fmtFull(expense)}`}>
          <span className="walletCardFooterLabel">Keluar</span>{' '}
          <strong className="walletCardFooterValue num">{rpShort(expense)}</strong>
        </span>
      </footer>
      {isCredit && showCredit && <div className="walletCreditDialog">
        <Modal title={`Rincian kredit — ${w.name}`} onClose={() => setShowCredit(false)}>
          <p className="cardSub">Saldo negatif berarti utang; saldo positif berarti kelebihan bayar. Plafon bukan saldo dompet.</p>
          <dl className="walletCreditMetrics">
            {[
              ['Saldo tercatat', w.balance],
              ['Plafon', w.creditLimit],
              ['Outstanding', credit.outstanding],
              ['Limit tersedia', credit.availableLimit],
              ['Hold', w.heldAmount ?? 0],
            ].map(([label, value]) => <div key={label}>
              <dt>{label}</dt><dd className="num">{value == null ? 'Belum diatur' : fmtFull(value)}</dd>
            </div>)}
          </dl>
          <button type="button" className="btnPrimary" onClick={() => setShowCredit(false)}>Selesai</button>
        </Modal>
      </div>}
    </article>
  );
}
