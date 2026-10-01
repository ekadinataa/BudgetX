import { useState } from 'react';
import { fmtFull } from '../../utils/formatters';
import { computeWalletAggregates } from '../../utils/helpers';
import { WALLET_TYPES } from '../../utils/constants';
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
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editWallet, setEditWallet] = useState(null);

  const { netBalance, totalAsset, totalDebt } = computeWalletAggregates(wallets);

  /** Add a new wallet */
  const handleAddWallet = async (data) => {
    const walletData = {
      name: data.name,
      type: data.type,
      balance: parseFloat(data.balance) || 0,
      color: data.color,
      note: data.note || '',
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
  const handleEditWallet = async (data) => {
    const walletData = {
      name: data.name,
      type: data.type,
      balance: parseFloat(data.balance) || 0,
      color: data.color,
      note: data.note || '',
    };
    try {
      if (onUpdateWallet) {
        await onUpdateWallet(editWallet.id, walletData);
      } else {
        setWallets((ws) => ws.map((w) => w.id === editWallet.id ? { ...w, ...walletData } : w));
      }
    } catch { /* error shown via toast */ }
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
            Kelola semua dompet &amp; rekening Anda
          </p>
        </div>
      </div>

      {/* Summary row */}
      <div className="statGrid">
        <div className="statCard">
          <div className="statLabel">Total Saldo Bersih</div>
          <div
            className="statValue num"
            style={{ color: netBalance < 0 ? 'var(--red-ink)' : 'var(--blue-ink)' }}
          >
            {fmtFull(netBalance)}
          </div>
        </div>
        <div className="statCard">
          <div className="statLabel">Total Aset</div>
          <div
            className="statValue num"
            style={{ color: 'var(--green-ink)' }}
          >
            {fmtFull(totalAsset)}
          </div>
        </div>
        <div className="statCard">
          <div className="statLabel">Total Hutang</div>
          <div
            className="statValue num"
            style={{ color: 'var(--red-ink)' }}
          >
            {fmtFull(totalDebt)}
          </div>
        </div>
      </div>

      {/* Wallets grouped by type */}
      {WALLET_TYPES.map((wt) => {
        const group = wallets.filter((w) => w.type === wt.value);
        if (!group.length) return null;
        return (
          <div key={wt.value} className="sectionBlock">
            <h2 className="sectionTitle">{wt.label}</h2>
            <div className="walletGrid">
              {group.map((w) => (
                <WalletCard
                  key={w.id}
                  wallet={w}
                  transactions={transactions}
                  onEdit={() => setEditWallet(w)}
                  onDelete={() => handleDelete(w.id)}
                />
              ))}
            </div>
          </div>
        );
      })}

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
