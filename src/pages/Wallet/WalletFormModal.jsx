import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { WALLET_TYPES } from '../../utils/constants';

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
export default function WalletFormModal({ title, initial = {}, onClose, onSave }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    type: initial.type || 'bank',
    balance: initial.balance != null ? String(initial.balance) : '',
    color: initial.color || '#4F6EF7',
    note: initial.note || '',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <Modal title={title} onClose={onClose}>
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
      <Field label="Saldo Awal">
        <Input
          type="number"
          value={form.balance}
          onChange={set('balance')}
          placeholder="0"
        />
      </Field>
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
      <button className="btnPrimary" onClick={handleSave}>
        Simpan
      </button>
    </Modal>
  );
}
