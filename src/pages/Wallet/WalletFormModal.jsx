import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { WALLET_TYPES } from '../../utils/constants';
import { getCreditPosition } from '../../utils/helpers';
import { fmtFull } from '../../utils/formatters';
import { validateWallet } from '../../services/validator';

/** Predefined color palette for wallet color picker */
const COLORS = [
  '#2563EB',
  '#00AED6',
  '#4C2A86',
  '#F97316',
  '#16A34A',
  '#DC2626',
  '#EC4899',
  '#64748B',
];

/**
 * WalletFormModal — Add or edit wallet form inside a Modal.
 *
 * @param {Object} props
 * @param {string} props.title - Modal title ("Tambah Dompet" or "Edit Dompet")
 * @param {Object} [props.initial={}] - Pre-filled wallet data for editing
 * @param {Function} props.onClose - Close callback
 * @param {Function} props.onSave - Save callback receiving form data
 *
 * Requirements: 3.3, 3.4, 3.5
 */
export default function WalletFormModal({ title, initial = {}, currentBalance, onClose, onSave }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    type: initial.type || 'bank',
    balance: initial.balance != null ? String(initial.balance) : '',
    color: initial.color || '#4F6EF7',
    note: initial.note || '',
    creditLimit: initial.creditLimit != null ? String(initial.creditLimit) : '',
    heldAmount: initial.heldAmount != null ? String(initial.heldAmount) : '',
  });
  const [error, setError] = useState(null);
  const isCredit = form.type === 'credit' || form.type === 'paylater';
  const { creditLimit, heldAmount, ...base } = form;
  const data = { ...base, balance: Number(form.balance) };
  for (const [field, value] of Object.entries({ creditLimit, heldAmount })) {
    // Blank keeps an existing value; new/legacy wallets stay optional.
    if (isCredit && value !== '') data[field] = Number(value);
    else if (initial[field] !== undefined) data[field] = initial[field];
  }
  const position = getCreditPosition(data);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const [confirmation, setConfirmation] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const close = () => { if (!saving) onClose(); };
  const persist = async (adjustment) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (adjustment) await onSave(data, adjustment);
      else await onSave(data);
    } catch (err) {
      setError(err.message || 'Gagal menyimpan dompet. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  };
  const handleSave = () => {
    const validation = validateWallet(data);
    setError(validation);
    if (validation) return;
    if (initial.id && data.balance !== initial.balance) {
      setConfirmation({ expectedBalance: currentBalance ?? initial.balance });
    } else {
      persist();
    }
  };
  const confirm = () => {
    if (!reason.trim()) return setError('Alasan perubahan wajib diisi.');
    if (reason.trim().length > 1000) return setError('Alasan maksimal 1000 karakter.');
    if (currentBalance != null && currentBalance !== confirmation.expectedBalance) {
      return setError('Saldo dompet berubah. Tinjau ulang saldo sebelum melanjutkan.');
    }
    persist({ ...confirmation, reason: reason.trim() });
  };

  if (confirmation) {
    const delta = data.balance - confirmation.expectedBalance;
    const stale = currentBalance != null && currentBalance !== confirmation.expectedBalance;
    return <Modal title="Konfirmasi Penyesuaian Saldo" onClose={close}>
      <p>{initial.name}: perubahan ini dicatat sebagai Penyesuaian Saldo, bukan pemasukan atau pengeluaran, dan tidak memakai budget.</p>
      {[
        ['Saldo sebelumnya', fmtFull(confirmation.expectedBalance)],
        ['Saldo baru', fmtFull(data.balance)],
        ['Selisih', `${delta >= 0 ? '+' : '−'}${fmtFull(Math.abs(delta))}`],
      ].map(([label, value]) => <div className="listRow" key={label}><span>{label}</span><strong className="num">{value}</strong></div>)}
      {isCredit && <p className="walletCardFooterLabel">Saldo negatif berarti utang. Saldo bertambah mengurangi utang; saldo berkurang menambah utang. Plafon dan hold tidak menghasilkan transaksi.</p>}
      <Field label="Alasan perubahan (wajib)">
        <Input aria-label="Alasan perubahan" value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} placeholder="cth. Mencocokkan saldo rekening" disabled={saving} />
      </Field>
      {(error || stale) && <div className="fieldError" role="alert">{stale ? 'Saldo dompet berubah. Tinjau ulang saldo sebelum melanjutkan.' : error}</div>}
      {stale && <button className="btnGhost" disabled={saving} onClick={() => { setConfirmation({ expectedBalance: currentBalance }); setError(null); }}>Tinjau Ulang Saldo</button>}
      <button className="btnGhost" disabled={saving} onClick={() => { setConfirmation(null); setError(null); }}>Batal</button>
      <button className="btnPrimary" disabled={saving || stale} onClick={confirm}>{saving ? 'Menyimpan…' : 'Konfirmasi Penyesuaian'}</button>
    </Modal>;
  }

  return (
    <Modal title={title} onClose={close}>
      <Field label="Nama Dompet">
        <Input
          value={form.name}
          onChange={set('name')}
          placeholder="cth. BCA Utama"
        />
      </Field>
      <Field label="Jenis">
        <Select value={form.type} onChange={set('type')}>
          {WALLET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={isCredit ? 'Saldo (negatif = utang, positif = lebih bayar)' : 'Saldo Awal'}>
        <Input
          aria-label="Saldo"
          type="number"
          value={form.balance}
          onChange={set('balance')}
          placeholder="0"
        />
      </Field>
      {isCredit && <>
        <Field label="Plafon">
          <Input aria-label="Plafon" type="number" min="0" step="any" value={form.creditLimit} onChange={set('creditLimit')} placeholder="Belum diatur" />
        </Field>
        <Field label="Hold">
          <Input aria-label="Hold" type="number" min="0" step="any" value={form.heldAmount} onChange={set('heldAmount')} placeholder="0" />
        </Field>
        <p className="walletCardFooterLabel">Plafon bukan saldo/aset. Kosong mempertahankan nilai lama; isi 0 untuk menolkan.</p>
        {[['Outstanding', position.outstanding], ['Limit tersedia', position.availableLimit]].map(([label, value]) => (
          <div className="listRow" key={label}>
            <span>{label}</span><span className="num">{value == null ? 'Belum diatur' : fmtFull(value)}</span>
          </div>
        ))}
      </>}
      {error && <div className="fieldError" role="alert">{error}</div>}
      <Field label="Warna">
        <div className="swatches">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setForm((f) => ({ ...f, color: c }))}
              className="swatch"
              style={{ background: c }}
              aria-pressed={form.color === c}
              aria-label={`Pilih warna ${c}`}
            />
          ))}
        </div>
      </Field>
      <Field label="Catatan (opsional)">
        <Input
          value={form.note}
          onChange={set('note')}
          placeholder="cth. 4 digit terakhir"
        />
      </Field>
      <button className="btnPrimary" disabled={saving} onClick={handleSave}>
        {saving ? 'Menyimpan…' : 'Simpan'}
      </button>
    </Modal>
  );
}
