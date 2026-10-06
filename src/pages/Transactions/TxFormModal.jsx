import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import CategoryPicker from '../../components/ui/CategoryPicker';
import { filterCategoriesByTxType } from '../../utils/helpers';
import { TODAY } from '../../data/defaults';

/**
 * TxFormModal — Add / Edit transaction modal.
 *
 * Supports income, expense, and transfer types. When type is "transfer",
 * the category field is replaced with a destination wallet selector.
 *
 * Also used from the global add-transaction trigger in App.jsx.
 *
 * @param {Object} props
 * @param {Array} props.wallets - Available wallets
 * @param {Object|null} [props.initial] - Existing transaction for edit mode, null for add
 * @param {Array} props.categories - All categories
 * @param {() => void} props.onClose - Close callback
 * @param {(data: Object) => void} props.onSave - Save callback with form data
 * @param {string} [props.presetType] - Starting type when adding (ignored when editing)
 *
 * Requirements: 4.4, 4.5, 4.6, 4.7
 */
export default function TxFormModal({ wallets, initial, onClose, onSave, categories, presetType = 'expense' }) {
  const [form, setForm] = useState({
    date: initial?.date || TODAY,
    walletId: initial?.walletId || wallets[0]?.id || '',
    type: initial?.type || presetType,
    categoryId: initial ? (initial.categoryId || '') : (filterCategoriesByTxType(categories, presetType)[0]?.id || ''),
    amount: initial?.amount ? String(initial.amount) : '',
    note: initial?.note || '',
    tags: initial?.tags ? initial.tags.join(', ') : '',
    toWalletId: initial?.toWalletId || '',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const availCats = filterCategoriesByTxType(categories, form.type);

  const handleSubmit = () => {
    if (!form.amount || !form.walletId) return;
    onSave({
      ...form,
      amount: parseFloat(form.amount),
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    });
  };

  return (
    <Modal
      title={
        initial ? 'Edit Transaksi' : presetType === 'transfer' ? 'Transfer' : 'Tambah Transaksi'
      }
      onClose={onClose}
      width={500}
    >
      <div className="formGrid">
        <Field label="Tipe">
          <Select value={form.type} onChange={set('type')}>
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan</option>
            <option value="transfer">Transfer</option>
          </Select>
        </Field>
        <Field label="Tanggal">
          <Input type="date" value={form.date} onChange={set('date')} />
        </Field>
      </div>
      <div className="formGrid">
        <Field label="Dompet">
          <Select value={form.walletId} onChange={set('walletId')}>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
        </Field>
        {form.type === 'transfer' ? (
          <Field label="Ke Dompet">
            <Select value={form.toWalletId} onChange={set('toWalletId')}>
              <option value="">— Pilih —</option>
              {wallets
                .filter((w) => w.id !== form.walletId)
                .map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
            </Select>
          </Field>
        ) : (
          <Field label="Kategori">
            <CategoryPicker
              categories={availCats}
              value={form.categoryId}
              onChange={set('categoryId')}
            />
          </Field>
        )}
      </div>
      <Field label="Jumlah (Rp)">
        <Input type="number" value={form.amount} onChange={set('amount')} placeholder="0" />
        <div className="chipGroup">
          {[10000, 25000, 50000, 100000, 200000, 500000].map(amt => (
            <button key={amt} type="button" onClick={() => setForm(f => ({ ...f, amount: String(amt) }))}
              className="filterChip">
              {amt >= 1000000 ? `${amt/1000000}jt` : `${amt/1000}rb`}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Catatan">
        <Input value={form.note} onChange={set('note')} placeholder="Keterangan transaksi" />
      </Field>
      <Field label="Tags (pisahkan dengan koma)">
        <Input value={form.tags} onChange={set('tags')} placeholder="cth. rutin, makan" />
      </Field>
      <button className="btnPrimary" onClick={handleSubmit}>
        {initial ? 'Simpan Perubahan' : 'Tambah Transaksi'}
      </button>
    </Modal>
  );
}
