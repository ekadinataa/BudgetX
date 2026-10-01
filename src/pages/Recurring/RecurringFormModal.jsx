import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { calcNextEstimateDate, shortcutToDays, formatDuration } from '../../utils/recurring';
import { TODAY } from '../../data/defaults';

const DURATION_SHORTCUTS = [
  { label: '2 mgg', value: '2mgg' },
  { label: '1 bln', value: '1bln' },
  { label: '1.5 bln', value: '1.5bln' },
  { label: '2 bln', value: '2bln' },
  { label: '3 bln', value: '3bln' },
  { label: '6 bln', value: '6bln' },
  { label: '1 thn', value: '1thn' },
];

/**
 * RecurringFormModal — Add/Edit recurring item form.
 *
 * @param {Object} props
 * @param {Object|null} props.initial - Existing item for edit mode, null for add
 * @param {Array} props.categories - All categories
 * @param {Array} props.wallets - All wallets
 * @param {() => void} props.onClose - Close callback
 * @param {(data: Object) => void} props.onSave - Save callback
 * @param {(id: string) => void} [props.onDelete] - Delete callback (edit mode only)
 */
export default function RecurringFormModal({ initial, categories, wallets, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    categoryId: initial?.categoryId || categories[0]?.id || '',
    walletId: initial?.walletId || '',
    amount: initial?.amount ? String(initial.amount) : '',
    durationDays: initial?.durationDays ? String(initial.durationDays) : '',
    lastPurchaseDate: initial?.lastPurchaseDate || '',
    note: initial?.note || '',
    tags: initial?.tags ? initial.tags.join(', ') : '',
  });

  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleShortcut = (shortcut) => {
    const days = shortcutToDays(shortcut);
    if (days) {
      setForm((f) => ({ ...f, durationDays: String(days) }));
    }
  };

  const activeShortcut = DURATION_SHORTCUTS.find(
    (s) => shortcutToDays(s.value) === Number(form.durationDays)
  );

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Nama wajib diisi';
    if (!form.amount || Number(form.amount) <= 0) errs.amount = 'Harga harus lebih dari 0';
    if (!form.durationDays || Number(form.durationDays) <= 0) errs.durationDays = 'Durasi harus lebih dari 0';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const durationDays = Number(form.durationDays);
    const lastPurchaseDate = form.lastPurchaseDate || '';
    const nextEstimateDate = lastPurchaseDate
      ? calcNextEstimateDate(lastPurchaseDate, durationDays)
      : '';

    onSave({
      name: form.name.trim(),
      categoryId: form.categoryId,
      walletId: form.walletId,
      amount: Number(form.amount),
      durationDays,
      lastPurchaseDate,
      nextEstimateDate,
      note: form.note,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    });
  };

  // Filter categories to only expense-related ones (needs, wants, savings)
  const expenseCategories = categories.filter((c) => c.section !== 'income');

  return (
    <Modal title={initial ? 'Edit Barang Berkala' : 'Tambah Barang Berkala'} onClose={onClose} width={500}>
      <Field label="Nama Item" error={errors.name}>
        <Input value={form.name} onChange={set('name')} placeholder="cth. Skincare Moisturizer" />
      </Field>

      <div className="formGrid">
        <Field label="Kategori">
          <Select value={form.categoryId} onChange={set('categoryId')}>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Dompet (opsional)">
          <Select value={form.walletId} onChange={set('walletId')}>
            <option value="">— Tidak dipilih —</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Harga (Rp)" error={errors.amount}>
        <Input type="number" value={form.amount} onChange={set('amount')} placeholder="0" />
      </Field>

      <Field label="Durasi Pemakaian (hari)" error={errors.durationDays}>
        <Input
          type="number"
          value={form.durationDays}
          onChange={set('durationDays')}
          placeholder="cth. 45"
        />
        <div className="chipGroup">
          {DURATION_SHORTCUTS.map((s) => (
            <button
              key={s.value}
              type="button"
              className="filterChip"
              aria-pressed={activeShortcut?.value === s.value}
              onClick={() => handleShortcut(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Tanggal Beli Terakhir (opsional)">
        <Input type="date" value={form.lastPurchaseDate} onChange={set('lastPurchaseDate')} />
      </Field>

      {form.lastPurchaseDate && form.durationDays && Number(form.durationDays) > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 12, marginTop: -8 }}>
          Estimasi habis: {calcNextEstimateDate(form.lastPurchaseDate, Number(form.durationDays))}
          {' '}({formatDuration(Number(form.durationDays))} dari pembelian)
        </div>
      )}

      <Field label="Catatan (opsional)">
        <Input value={form.note} onChange={set('note')} placeholder="cth. Merk Somethinc" />
      </Field>

      <Field label="Tags (pisahkan dengan koma)">
        <Input value={form.tags} onChange={set('tags')} placeholder="cth. perawatan, rutin" />
      </Field>

      <button className="btnPrimary" onClick={handleSubmit}>
        {initial ? 'Simpan Perubahan' : 'Tambah Item'}
      </button>

      {initial && onDelete && (
        <button className="btnSmallDanger" onClick={() => onDelete(initial.id)}>
          Hapus Item
        </button>
      )}
    </Modal>
  );
}
