import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { TODAY } from '../../data/defaults';
import { calcNextEstimateDate } from '../../utils/recurring';
import { fmtFull } from '../../utils/formatters';

/**
 * RepurchaseModal — Confirm repurchase of a recurring item.
 *
 * Allows user to set purchase date, update price if changed,
 * select wallet, and optionally auto-create a transaction.
 *
 * @param {Object} props
 * @param {Object} props.item - The recurring item being repurchased
 * @param {Array} props.wallets - Available wallets
 * @param {() => void} props.onClose - Close callback
 * @param {(data: Object) => void} props.onConfirm - Confirm callback with repurchase data
 */
export default function RepurchaseModal({ item, wallets, onClose, onConfirm }) {
  const [form, setForm] = useState({
    purchaseDate: TODAY,
    amount: String(item.amount),
    walletId: item.walletId || wallets[0]?.id || '',
    createTransaction: true,
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const nextDate = calcNextEstimateDate(form.purchaseDate, item.durationDays);

  const handleConfirm = () => {
    onConfirm({
      purchaseDate: form.purchaseDate,
      amount: Number(form.amount),
      walletId: form.walletId,
      createTransaction: form.createTransaction,
      nextEstimateDate: nextDate,
    });
  };

  return (
    <Modal title="Konfirmasi Pembelian Ulang" onClose={onClose} width={440}>
      <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg-3)', borderRadius: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
          {item.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>
          Durasi pakai: {item.durationDays} hari · Harga sebelumnya: {fmtFull(item.amount)}
        </div>
      </div>

      <Field label="Tanggal Beli">
        <Input type="date" value={form.purchaseDate} onChange={set('purchaseDate')} />
      </Field>

      <Field label="Harga (jika berubah)">
        <Input type="number" value={form.amount} onChange={set('amount')} placeholder="0" />
      </Field>

      <Field label="Dompet">
        <Select value={form.walletId} onChange={set('walletId')}>
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </Select>
      </Field>

      {nextDate && (
        <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 12 }}>
          Estimasi habis berikutnya: <strong>{nextDate}</strong>
        </div>
      )}

      <label className="toggleRow">
        <input
          type="checkbox"
          checked={form.createTransaction}
          onChange={(e) => setForm((f) => ({ ...f, createTransaction: e.target.checked }))}
        />
        Buat transaksi pengeluaran otomatis
      </label>

      <button className="btnPrimary" onClick={handleConfirm}>
        Konfirmasi
      </button>
    </Modal>
  );
}
