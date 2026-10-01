import { useState } from 'react';
import Modal from '../../components/Modal/Modal';

/**
 * ResetConfirmModal — Confirmation dialog for the Reset Data action.
 *
 * Uses the existing Modal component as a wrapper (handles Escape key and
 * backdrop click). Requires the user to type "Delete" (case-sensitive) in
 * a safety input before the "Konfirmasi" button becomes enabled.
 *
 * State resets automatically on open/reopen because the parent conditionally
 * renders this component, causing a fresh mount each time.
 *
 * @param {Object} props
 * @param {() => Promise<void>} props.onConfirm - Called when user confirms reset
 * @param {() => void} props.onClose - Called to dismiss modal
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4,
 *               6.6, 8.1, 8.2, 8.3
 */
export default function ResetConfirmModal({ onConfirm, onClose }) {
  const [safetyInput, setSafetyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canConfirm = safetyInput === 'Delete' && !loading;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setLoading(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan saat menghapus data.');
      setSafetyInput('');
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Modal title="Reset Data" onClose={handleClose} width={440}>
      <p style={{
        fontSize: 13,
        color: 'var(--text-3)',
        lineHeight: 1.6,
        marginBottom: 16,
      }}>
        Tindakan ini akan menghapus <strong>semua data</strong> Anda secara
        permanen, termasuk:
      </p>

      <ul style={{
        fontSize: 13,
        color: 'var(--text-3)',
        lineHeight: 1.8,
        marginBottom: 20,
        paddingLeft: 20,
      }}>
        <li>Dompet (wallets)</li>
        <li>Transaksi (transactions)</li>
        <li>Anggaran (budgets)</li>
        <li>Kategori (categories)</li>
        <li>Preferensi (preferences)</li>
      </ul>

      {loading && (
        <p style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--orange-ink)',
          background: 'var(--orange-soft)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
        }}>
          Menghapus data...
        </p>
      )}

      {error && (
        <p style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--red-ink)',
          background: 'var(--red-soft)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
        }}>
          {error}
        </p>
      )}

      <label style={{
        display: 'block',
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-4)',
        marginBottom: 8,
      }}>
        Ketik <strong>"Delete"</strong> untuk mengonfirmasi
      </label>

      <input
        className="inputField"
        type="text"
        value={safetyInput}
        onChange={(e) => setSafetyInput(e.target.value)}
        disabled={loading}
        placeholder="Delete"
      />

      <div className="modalActions">
        <button
          className="btnGhost"
          onClick={handleClose}
          disabled={loading}
        >
          Batal
        </button>

        <button
          className="btnDanger"
          onClick={handleConfirm}
          disabled={!canConfirm}
        >
          Konfirmasi
        </button>
      </div>
    </Modal>
  );
}
