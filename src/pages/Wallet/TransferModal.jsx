import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { fmtFull } from '../../utils/formatters';

/**
 * TransferModal — Transfer funds between wallets.
 *
 * @param {Object} props
 * @param {Array} props.wallets - All wallets
 * @param {Function} props.onClose - Close callback
 * @param {Function} props.onSave - Save callback receiving { from, to, amount, date, note }
 *
 * Requirements: 3.7, 3.8
 */
export default function TransferModal({ wallets, onClose, onSave }) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [form, setForm] = useState({
    from: wallets[0]?.id || '',
    to: wallets[1]?.id || '',
    amount: '',
    date: todayStr,
    note: '',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fromWallet = wallets.find((w) => w.id === form.from);

  const handleSave = () => {
    const amt = parseFloat(form.amount) || 0;
    if (amt <= 0) return;
    if (form.from === form.to) return;
    onSave(form);
  };

  return (
    <Modal title="Transfer Antar Dompet" onClose={onClose} width={440}>
      <Field label="Dari Dompet">
        <Select value={form.from} onChange={set('from')}>
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({fmtFull(w.balance)})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ke Dompet">
        <Select value={form.to} onChange={set('to')}>
          {wallets
            .filter((w) => w.id !== form.from)
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({fmtFull(w.balance)})
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Jumlah">
        <Input
          type="number"
          value={form.amount}
          onChange={set('amount')}
          placeholder="0"
        />
        {fromWallet && (
          <div className="fieldHelp num">
            Saldo tersedia: {fmtFull(fromWallet.balance)}
          </div>
        )}
      </Field>
      <Field label="Tanggal">
        <Input type="date" value={form.date} onChange={set('date')} />
      </Field>
      <Field label="Catatan">
        <Input
          value={form.note}
          onChange={set('note')}
          placeholder="Opsional"
        />
      </Field>
      <button className="btnPrimary" onClick={handleSave}>
        Transfer Sekarang
      </button>
    </Modal>
  );
}
