import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { getSubscriptionCategoryInfo } from '../../utils/subscriptionHelpers';

const CATEGORY_OPTIONS = [
  'streaming',
  'utilitas',
  'internet',
  'asuransi',
  'fitness',
  'cloud',
  'edukasi',
  'lainnya',
];

const CYCLE_OPTIONS = [
  { value: 'bulanan', label: 'Bulanan' },
  { value: 'tahunan', label: 'Tahunan' },
  { value: 'mingguan', label: 'Mingguan' },
];

export default function SubscriptionFormModal({ initial, wallets, onClose, onSave, onDelete }) {
  const [name, setName] = useState(initial?.name || '');
  const [category, setCategory] = useState(initial?.category || 'lainnya');
  const [amount, setAmount] = useState(initial?.amount || '');
  const [billingCycle, setBillingCycle] = useState(initial?.billingCycle || 'bulanan');
  const [nextDueDate, setNextDueDate] = useState(initial?.nextDueDate || '');
  const [walletId, setWalletId] = useState(initial?.walletId || (wallets[0]?.id || ''));
  const [note, setNote] = useState(initial?.note || '');
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Nama wajib diisi';
    if (!amount || Number(amount) <= 0) errs.amount = 'Jumlah harus lebih dari 0';
    if (!nextDueDate) errs.nextDueDate = 'Tanggal jatuh tempo wajib diisi';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    onSave({
      name: name.trim(),
      category,
      amount: Number(amount),
      billingCycle,
      nextDueDate,
      walletId,
      note: note.trim(),
      isActive: initial?.isActive !== undefined ? initial.isActive : true,
    });
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete(initial.id);
  };

  return (
    <Modal title={initial ? 'Edit Langganan' : 'Tambah Langganan'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label="Nama Langganan" error={errors.name}>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Netflix, Spotify, PLN Listrik..."
          />
        </Field>

        <div className="formGrid">
          <Field label="Kategori">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map((cat) => {
                const info = getSubscriptionCategoryInfo(cat);
                return <option key={cat} value={cat}>{info.emoji} {info.label}</option>;
              })}
            </Select>
          </Field>
          <Field label="Siklus Tagihan">
            <Select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)}>
              {CYCLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="formGrid">
          <Field label="Jumlah (Rp)" error={errors.amount}>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="79000"
            />
          </Field>
          <Field label="Tanggal Jatuh Tempo" error={errors.nextDueDate}>
            <Input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Dompet Pembayaran">
          <Select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>

        <Field label="Catatan (Opsional)">
          <Input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan tambahan..."
          />
        </Field>

        <div className="modalActions">
        <button type="submit" className="btnPrimary">
          {initial ? 'Simpan Perubahan' : 'Tambah Langganan'}
        </button>

        {initial && onDelete && (
          <button type="button" className="btnSmallDanger" onClick={handleDelete}>
            {confirmDelete ? 'Yakin hapus?' : 'Hapus Langganan'}
          </button>
        )}
        </div>
      </form>
    </Modal>
  );
}
