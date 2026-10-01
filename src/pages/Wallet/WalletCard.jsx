import { fmtFull, fmt, monthKey } from '../../utils/formatters';
import { walletTypeLabel } from '../../utils/helpers';
import WalletIcon from '../../components/ui/WalletIcon';
import NavIcon from '../../components/icons/NavIcon';

/**
 * WalletCard — one wallet: colour bar, identity, balance, monthly flow.
 *
 * Rewritten onto the reference's own primitives (`walletCard`, `walletIcon`,
 * `iconBtn`, …) which came from `budgetx-app.html`. The pre-migration version
 * painted a 135° gradient across the whole header and defined its own
 * `walletCard*` rules with the *same names* as the reference — so the two
 * designs collided, and the local one won because CSS Modules scope later.
 *
 * The reference expresses the wallet's colour twice: a 4px bar on top
 * (`.walletCardTop`) and the icon tile (`.walletIcon`). That is what replaced
 * the gradient.
 *
 * @param {Object} props
 * @param {Object} props.wallet - Wallet object
 * @param {Array} props.transactions - All transactions
 * @param {Function} props.onEdit - Callback when edit button is clicked
 * @param {Function} props.onDelete - Callback when delete button is clicked
 */
export default function WalletCard({ wallet: w, transactions, onEdit, onDelete }) {
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
    <div className="walletCard">
      <div className="walletCardTop" style={{ background: w.color }} />
      <div className="walletCardHeader">
        <div className="walletIcon" style={{ background: w.color }}>
          <WalletIcon type={w.type} size={18} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="walletName truncate">{w.name}</div>
          <div className="walletType truncate">
            {walletTypeLabel(w.type)}
            {w.note ? ` · ${w.note}` : ''}
          </div>
        </div>
        <button className="iconBtn" onClick={onEdit} aria-label={`Edit ${w.name}`}>
          <NavIcon name="edit" size={16} />
        </button>
        <button
          className="iconBtn iconBtnDanger"
          onClick={onDelete}
          aria-label={`Hapus ${w.name}`}
        >
          <NavIcon name="trash" size={16} />
        </button>
      </div>
      <div className="walletBalance num">{fmtFull(w.balance)}</div>
      <div className="walletCardFooter">
        <div>
          <div className="walletCardFooterLabel">Pemasukan {monthLabel}</div>
          <div className="walletCardFooterValue amountIn">+{fmt(income)}</div>
        </div>
        <div>
          <div className="walletCardFooterLabel">Pengeluaran {monthLabel}</div>
          <div className="walletCardFooterValue">−{fmt(expense)}</div>
        </div>
      </div>
    </div>
  );
}
