import { useState } from 'react';
import Modal from './Modal/Modal';
import { migrateData } from '../services/firestoreService';
import { STORAGE_KEY } from '../utils/constants';

/**
 * DataMigrator — Detects localStorage data and prompts user to migrate
 * it to the server after login/register.
 *
 * @param {Object} props
 * @param {() => void} props.onComplete - Called after migration completes or is declined
 */
export default function DataMigrator({ onComplete }) {
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState('');

  const raw = localStorage.getItem(STORAGE_KEY);
  let localData = null;
  try {
    localData = raw ? JSON.parse(raw) : null;
  } catch {
    localData = null;
  }

  if (!localData) {
    // No local data to migrate
    onComplete();
    return null;
  }

  const walletCount = localData.wallets?.length || 0;
  const txCount = localData.transactions?.length || 0;
  const catCount = localData.categories?.length || 0;
  const budgetCount = localData.budgets ? Object.keys(localData.budgets).length : 0;

  const handleMigrate = async () => {
    setMigrating(true);
    setError('');
    try {
      await migrateData({
        wallets: localData.wallets || [],
        transactions: localData.transactions || [],
        budgets: localData.budgets || {},
        categories: localData.categories || [],
      });
      localStorage.removeItem(STORAGE_KEY);
      onComplete();
    } catch (err) {
      setError(err.message || 'Gagal migrasi data. Coba lagi.');
      setMigrating(false);
    }
  };

  const handleDecline = () => {
    // Remove localStorage data so the prompt doesn't appear again
    localStorage.removeItem(STORAGE_KEY);
    onComplete();
  };

  return (
    <Modal title="Migrasi Data Lokal" onClose={handleDecline} width={440}>
      <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
        Kami menemukan data BudgetX yang tersimpan di perangkat ini. Apakah Anda ingin memindahkan data tersebut ke akun Anda?
      </p>
      <div
        style={{
          background: 'var(--bg-3)',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 20,
          fontSize: 13,
          color: 'var(--text-3)',
          lineHeight: 1.8,
        }}
      >
        <div>{walletCount} dompet</div>
        <div>{txCount} transaksi</div>
        <div>{catCount} kategori</div>
        <div>{budgetCount} budget bulanan</div>
      </div>

      {error && (
        <div
          style={{
            background: 'var(--red-soft)',
            border: '1px solid var(--separator)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
            color: 'var(--red-ink)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={handleDecline}
          disabled={migrating}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-3)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Lewati
        </button>
        <button
          onClick={handleMigrate}
          disabled={migrating}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--blue)',
            color: 'var(--accent-on)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            opacity: migrating ? 0.6 : 1,
          }}
        >
          {migrating ? 'Memindahkan...' : 'Pindahkan Data'}
        </button>
      </div>
    </Modal>
  );
}
