import { useState } from 'react';
import { fmtFull, fmtDate, monthKey, rpShort } from '../../utils/formatters';
import { computeWalletAggregates, getRecentTransactions } from '../../utils/helpers';
import { buildWalletAdjustment } from '../../utils/walletAdjustment';
import NavIcon from '../../components/icons/NavIcon';
import { usePageActions } from '../../context/pageActions';
import WalletCard from './WalletCard';
import WalletFormModal from './WalletFormModal';
import TransferModal from './TransferModal';

/**
 * WalletPage — Multi-wallet management page.
 *
 * Displays summary cards (net balance, total assets, total debt),
 * wallets grouped by type, and modals for add/edit/transfer.
 *
 * @param {Object} props
 * @param {Array} props.wallets
 * @param {Function} props.setWallets
 * @param {Array} props.transactions
 * @param {Function} props.setTransactions
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 */
export default function WalletPage({
  wallets,
  setWallets,
  transactions,
  setTransactions,
  onCreateWallet,
  onUpdateWallet,
  onDeleteWallet,
  onCreateTransaction,
  setPage,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editWallet, setEditWallet] = useState(null);

  const { netBalance, totalAsset, totalDebt } = computeWalletAggregates(wallets);
  const positive = wallets.filter(w => w.balance > 0).sort((a, b) => b.balance - a.balance);
  const positiveTotal = positive.reduce((s, w) => s + w.balance, 0);
  const mk = monthKey(new Date());
  const monthTransactions = transactions.filter(t => t.date.startsWith(mk));
  const recentExpenses = getRecentTransactions(transactions.filter(t => t.type === 'expense'), 5);

  /** Add a new wallet */
  const handleAddWallet = async (data) => {
    const walletData = {
      name: data.name,
      type: data.type,
      balance: parseFloat(data.balance) || 0,
      color: data.color,
      note: data.note || '',
      ...Object.fromEntries(['creditLimit', 'heldAmount'].filter(field => data[field] !== undefined).map(field => [field, data[field]])),
    };
    try {
      if (onCreateWallet) {
        await onCreateWallet(walletData);
      } else {
        setWallets((ws) => [...ws, { id: 'w' + Date.now(), ...walletData }]);
      }
    } catch { /* error shown via toast */ }
    setShowAdd(false);
  };

  /** Edit an existing wallet */
  const handleEditWallet = async (data, adjustment) => {
    const walletData = {
      name: data.name,
      type: data.type,
      balance: parseFloat(data.balance) || 0,
      color: data.color,
      note: data.note || '',
      ...Object.fromEntries(['creditLimit', 'heldAmount'].filter(field => data[field] !== undefined).map(field => [field, data[field]])),
    };
    const live = wallets.find(w => w.id === editWallet.id);
    if (!live) throw new Error('Dompet tidak ditemukan.');
    if (!adjustment) walletData.balance = live.balance;
    if (onUpdateWallet) {
      if (adjustment) await onUpdateWallet(editWallet.id, walletData, adjustment);
      else await onUpdateWallet(editWallet.id, walletData);
    } else {
      const transaction = buildWalletAdjustment(live, walletData, adjustment);
      setWallets((ws) => ws.map((w) => w.id === editWallet.id ? { ...w, ...walletData } : w));
      if (transaction) setTransactions(ts => [{ id: crypto.randomUUID(), ...transaction }, ...ts]);
    }
    // Failed saves propagate to the form and keep it open for retry.
    setEditWallet(null);
  };

  /** Delete a wallet with confirmation */
  const handleDelete = async (id) => {
    if (!window.confirm('Hapus dompet ini?')) return;
    try {
      if (onDeleteWallet) {
        await onDeleteWallet(id);
      } else {
        setWallets((ws) => ws.filter((w) => w.id !== id));
      }
    } catch { /* error shown via toast */ }
  };

  /** Execute a transfer between wallets */
  const handleTransfer = async (data) => {
    const amt = parseFloat(data.amount) || 0;
    const txData = {
      date: data.date,
      walletId: data.from,
      type: 'transfer',
      categoryId: null,
      amount: amt,
      note: data.note || 'Transfer',
      tags: [],
      toWalletId: data.to,
    };
    try {
      if (onCreateTransaction) {
        await onCreateTransaction(txData);
      } else {
        setWallets((ws) => ws.map((w) => {
          if (w.id === data.from) return { ...w, balance: w.balance - amt };
          if (w.id === data.to) return { ...w, balance: w.balance + amt };
          return w;
        }));
        setTransactions((ts) => [{ id: 'tx' + Date.now(), ...txData }, ...ts]);
      }
    } catch { /* error shown via toast */ }
    setShowTransfer(false);
  };

  // Header actions live in the topbar so they stay reachable while a long wallet
  // list scrolls. The hook returns a portal, so it is rendered in the tree.
  // `.toolbar` normalises the secondary `Transfer` button up to the primary
  // button's height; without it the pair rendered 32px beside 44px.
  const topbarActions = usePageActions(
    <div className="toolbar">
      <button className="btnGhost" onClick={() => setShowTransfer(true)}>
        <NavIcon name="transfer" size={16} /> Transfer
      </button>
      <button className="btnPrimary" onClick={() => setShowAdd(true)}>
        <NavIcon name="plus" size={16} /> Tambah Dompet
      </button>
    </div>,
  );

  // `display: contents` so this wrapper does not become a single flex child of
  // `.container`. As a plain `<div>` it absorbed the container's `gap` for the
  // whole page, leaving every card below it flush against its neighbour — which
  // is why the spacing read as cramped rather than merely tight. `{topbarActions}`
  // is a portal and renders null, so nothing else depends on this element.
  return (
    <div className="pageStack">
      {topbarActions}

      {/* Page header — actions go to the sticky topbar, as the reference's
          `pageHeader(title, sub, actions)` does. */}
      <div className="largeTitleBlock">
        <div>
          <h1 className="largeTitle">Dompet</h1>
          <p className="pageSubtitle">
            {wallets.length} dompet · ringkasan saldo dan arus akun
          </p>
        </div>
      </div>

      {/* Summary row */}
      <div className="kpiRow4">
        <div className="statCard">
          <div className="statLabel">Total Saldo Bersih</div>
          <div
            className="statValue num"
            style={{ color: netBalance < 0 ? 'var(--red-ink)' : 'var(--blue-ink)' }}
          >
            {fmtFull(netBalance)}
          </div>
          <div className="statDetail">Aset dikurangi utang</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Total Aset</div>
          <div
            className="statValue num"
            style={{ color: 'var(--green-ink)' }}
          >
            {fmtFull(totalAsset)}
          </div>
          <div className="statDetail">{positive.length} dompet positif</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Total Hutang</div>
          <div
            className="statValue num"
            style={{ color: 'var(--red-ink)' }}
          >
            {fmtFull(totalDebt)}
          </div>
          <div className="statDetail">Saldo negatif kartu &amp; dompet</div>
        </div>
        <div className="statCard"><div className="statLabel">Aktivitas bulan ini</div><div className="statValue num">{monthTransactions.length}</div><div className="statDetail">{rpShort(monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0))} keluar</div></div>
      </div>

      <div className="walletOverview">
        <section className="card">
          <div className="cardHead"><div><h2 className="cardTitle">Alokasi saldo</h2><p className="cardSub">Distribusi saldo positif di dompet aktif</p></div><span className="num">{fmtFull(positiveTotal)}</span></div>
          <div className="walletAllocationBar" role="img" aria-label="Distribusi saldo positif per dompet">{positive.map(w => <span key={w.id} style={{ width: `${w.balance / positiveTotal * 100}%`, background: w.color }} title={`${w.name}: ${fmtFull(w.balance)}`} />)}</div>
          <div className="legend">{positive.map(w => <div className="legendRow" key={w.id}><span className="dot" style={{ background: w.color }} /><span className="legendName">{w.name}</span><span className="legendPct num">{(w.balance / positiveTotal * 100).toFixed(0)}%</span></div>)}</div>
          {!positive.length && <p className="cardSub">Belum ada saldo positif untuk ditampilkan.</p>}
        </section>
        <section className="card">
          <div className="cardHead"><div><h2 className="cardTitle">Butuh perhatian</h2><p className="cardSub">Pengeluaran terbaru yang perlu ditinjau</p></div>{setPage && <button className="btnSmallGhost" type="button" onClick={() => setPage('tx')}>Transaksi</button>}</div>
          <div className="list">{recentExpenses.map(t => <div className="listRow" key={t.id}><span className="itemIcon"><NavIcon name="expense" size={16} /></span><span className="itemInfo"><span className="itemName">{t.note || 'Pengeluaran'}</span><span className="itemMeta">{fmtDate(t.date)} · {wallets.find(w => w.id === t.walletId)?.name || 'Dompet dihapus'}</span></span><span className="itemAmount num">−{fmtFull(t.amount)}</span></div>)}</div>
          {!recentExpenses.length && <p className="cardSub">Belum ada pengeluaran.</p>}
        </section>
      </div>
      <section className="walletAccountGrid" aria-label="Semua dompet">
              {wallets.map((w) => (
                <WalletCard
                  key={w.id}
                  wallet={w}
                  transactions={transactions}
                  onEdit={() => setEditWallet(w)}
                  onDelete={() => handleDelete(w.id)}
                />
              ))}
      </section>
      {!wallets.length && <section className="card emptyState"><h2 className="cardTitle">Belum ada dompet</h2><p className="cardSub">Tambahkan rekening atau dompet pertama Anda.</p><button className="btnPrimary" type="button" onClick={() => setShowAdd(true)}>Tambah Dompet</button></section>}

      {/* Add wallet modal */}
      {showAdd && (
        <WalletFormModal
          title="Tambah Dompet"
          onClose={() => setShowAdd(false)}
          onSave={handleAddWallet}
        />
      )}

      {/* Edit wallet modal */}
      {editWallet && (
        <WalletFormModal
          title="Edit Dompet"
          initial={editWallet}
          currentBalance={wallets.find(w => w.id === editWallet.id)?.balance}
          onClose={() => setEditWallet(null)}
          onSave={handleEditWallet}
        />
      )}

      {/* Transfer modal */}
      {showTransfer && (
        <TransferModal
          wallets={wallets}
          onClose={() => setShowTransfer(false)}
          onSave={handleTransfer}
        />
      )}
    </div>
  );
}
