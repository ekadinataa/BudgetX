import { useState, useMemo } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { validateFixedAsset } from '../../services/fixedAssetValidator';
import { fmtFull } from '../../utils/formatters';

const FIXED_ASSET_CATEGORIES = [
  { value: 'rumah', label: 'Rumah/Properti', emoji: '🏠' },
  { value: 'kendaraan', label: 'Kendaraan', emoji: '🚗' },
  { value: 'elektronik', label: 'Elektronik/Gadget', emoji: '📱' },
  { value: 'jam', label: 'Jam Tangan', emoji: '⌚' },
  { value: 'perhiasan', label: 'Perhiasan', emoji: '💎' },
  { value: 'furnitur', label: 'Furnitur', emoji: '🪑' },
  { value: 'lainnya', label: 'Lainnya', emoji: '📦' },
];

/**
 * FixedAssetFormModal — Create/edit fixed asset record form.
 */
export default function FixedAssetFormModal({ initial, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    category: initial?.category || 'rumah',
    purchasePrice: initial?.purchasePrice ? String(initial.purchasePrice) : '',
    currentValue: initial?.currentValue ? String(initial.currentValue) : '',
    purchaseDate: initial?.purchaseDate || '',
    note: initial?.note || '',
  });

  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Preview gain/loss
  const preview = useMemo(() => {
    const purchase = Number(form.purchasePrice);
    const current = Number(form.currentValue);
    if (!purchase || purchase <= 0 || !current) return null;
    const change = ((current - purchase) / purchase) * 100;
    return { change, gain: current - purchase };
  }, [form.purchasePrice, form.currentValue]);

  const handleSubmit = () => {
    const data = {
      ...form,
      purchasePrice: Number(form.purchasePrice),
      currentValue: Number(form.currentValue) || Number(form.purchasePrice),
    };

    const error = validateFixedAsset(data);
    if (error) {
      if (error.includes('Nama')) setErrors({ name: error });
      else if (error.includes('Kategori')) setErrors({ category: error });
      else if (error.includes('Harga')) setErrors({ purchasePrice: error });
      else if (error.includes('Nilai')) setErrors({ currentValue: error });
      else setErrors({ _general: error });
      return;
    }
    setErrors({});

    onSave({
      name: form.name.trim(),
      category: form.category,
      purchasePrice: Number(form.purchasePrice),
      currentValue: Number(form.currentValue) || Number(form.purchasePrice),
      purchaseDate: form.purchaseDate,
      note: form.note.trim(),
    });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(initial.id);
  };

  return (
    <Modal title={initial ? 'Edit Aset Tetap' : 'Tambah Aset Tetap'} onClose={onClose} width={520}>
      <Field label="Nama Aset" error={errors.name}>
        <Input
          value={form.name}
          onChange={set('name')}
          placeholder="cth. Rumah Serpong, Mobil Yaris G 2020"
        />
      </Field>

      <Field label="Kategori" error={errors.category}>
        <Select value={form.category} onChange={set('category')}>
          {FIXED_ASSET_CATEGORIES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.emoji} {opt.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="formGrid">
        <Field label="Harga Beli (Rp)" error={errors.purchasePrice}>
          <Input
            type="number"
            value={form.purchasePrice}
            onChange={set('purchasePrice')}
            placeholder="0"
          />
        </Field>
        <Field label="Nilai Saat Ini (Rp)" error={errors.currentValue}>
          <Input
            type="number"
            value={form.currentValue}
            onChange={set('currentValue')}
            placeholder="Sama dengan harga beli"
          />
        </Field>
      </div>

      {/* Gain/loss preview */}
      {preview && (
        <div style={{
          padding: '10px 14px',
          background: preview.change >= 0 ? 'var(--green-soft)' : 'var(--red-soft)',
          borderRadius: 10,
          border: `1px solid ${preview.change >= 0 ? 'var(--green-soft)' : 'var(--red-soft)'}`,
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: preview.change >= 0 ? 'var(--green-ink)' : 'var(--red-ink)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>{preview.change >= 0 ? '📈 Apresiasi' : '📉 Depresiasi'}</span>
            <span>{preview.change >= 0 ? '+' : ''}{preview.change.toFixed(1)}%</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>
            {preview.change >= 0 ? 'Naik' : 'Turun'}: {fmtFull(Math.abs(preview.gain))}
          </div>
        </div>
      )}

      <Field label="Tanggal Pembelian (opsional)">
        <Input type="date" value={form.purchaseDate} onChange={set('purchaseDate')} />
      </Field>

      <Field label="Catatan (opsional)">
        <Input
          value={form.note}
          onChange={set('note')}
          placeholder="cth. Warna putih, cicilan 5 tahun"
        />
      </Field>

      {errors._general && (
        <div style={{ color: 'var(--red-ink)', fontSize: 12, marginBottom: 8 }}>{errors._general}</div>
      )}

      <button
        className="btnPrimary"
        onClick={handleSubmit}
      >
        {initial ? 'Simpan Perubahan' : 'Tambah Aset'}
      </button>

      {initial && onDelete && (
        <button
          className={confirmDelete ? 'btnDanger' : 'btnSmallDanger'}
          onClick={handleDelete}
        >
          {confirmDelete ? 'Yakin hapus aset ini?' : 'Hapus Aset'}
        </button>
      )}
    </Modal>
  );
}
