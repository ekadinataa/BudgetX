import { useState } from 'react';
import { fmtFull } from '../../utils/formatters';
import { computeWalletAggregates } from '../../utils/helpers';
import { WALLET_TYPES } from '../../utils/constants';
import NavIcon from '../../components/icons/NavIcon';
import WalletCard from './WalletCard';
import WalletFormModal from './WalletFormModal';
import TransferModal from './TransferModal';
import styles from './WalletPage.module.css';

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

  return (
    <div>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Dompet</h1>
          <p className={styles.pageSubtitle}>
            Kelola semua dompet &amp; rekening Anda
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.btnGhost}
            onClick={() => setShowTransfer(true)}
          >
            <NavIcon name="transfer" size={16} /> Transfer
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => setShowAdd(true)}
          >
            <NavIcon name="plus" size={16} /> Tambah Dompet
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Total Saldo Bersih</div>
          <div
            className={styles.summaryValue}
            style={{ color: netBalance < 0 ? '#EF4444' : '#4F6EF7' }}
          >
            {fmtFull(netBalance)}
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Total Aset</div>
          <div
            className={styles.summaryValue}
            style={{ color: '#22C55E' }}
          >
            {fmtFull(totalAsset)}
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Total Hutang</div>
          <div
            className={styles.summaryValue}
            style={{ color: '#EF4444' }}
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
          <div key={wt.value} className={styles.groupSection}>
            <div className={styles.groupLabel}>{wt.label}</div>
            <div className={styles.groupGrid}>
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
