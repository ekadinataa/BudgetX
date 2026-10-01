import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { validateInvestment } from '../../services/investmentValidator';

const ASSET_TYPE_OPTIONS = [
  { value: 'deposito', label: 'Deposito' },
  { value: 'saham', label: 'Saham' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'emas', label: 'Emas' },
  { value: 'reksadana', label: 'Reksadana' },
  { value: 'obligasi', label: 'Obligasi' },
  { value: 'p2p', label: 'P2P Lending' },
  { value: 'lainnya', label: 'Lainnya' },
];

/**
 * InvestmentFormModal — Create/edit investment record form.
 */
export default function InvestmentFormModal({ initial, onClose, onSave, onDelete }) {
  const hasTransactions = initial?.transactions?.length > 0;

  const [form, setForm] = useState({
    name: initial?.name || '',
    assetType: initial?.assetType || 'saham',
    notes: initial?.notes || '',
    // Type-specific
    interestRate: initial?.interestRate ? String(initial.interestRate) : '',
    maturityDate: initial?.maturityDate || '',
    bankName: initial?.bankName || '',
    tickerSymbol: initial?.tickerSymbol || '',
    coinName: initial?.coinName || '',
    fundName: initial?.fundName || '',
    managerName: initial?.managerName || '',
  });

  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = () => {
    const data = { ...form };
    const error = validateInvestment(data);
    if (error) {
      if (error.includes('Nama')) setErrors({ name: error });
      else if (error.includes('aset')) setErrors({ assetType: error });
      else setErrors({ _general: error });
      return;
    }
    setErrors({});

    const result = {
      name: form.name.trim(),
      assetType: form.assetType,
      notes: form.notes.trim(),
    };

    // Type-specific fields
    if (form.assetType === 'deposito') {
      result.interestRate = Number(form.interestRate) || 0;
      result.maturityDate = form.maturityDate;
      result.bankName = form.bankName.trim();
    } else if (form.assetType === 'saham') {
      result.tickerSymbol = form.tickerSymbol.trim().toUpperCase();
    } else if (form.assetType === 'crypto') {
      result.coinName = form.coinName.trim();
    } else if (form.assetType === 'emas') {
      result.unit = 'gram';
    } else if (form.assetType === 'reksadana') {
      result.fundName = form.fundName.trim();
      result.managerName = form.managerName.trim();
    }

    onSave(result);
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(initial.id);
  };

  return (
    <Modal title={initial ? 'Edit Investasi' : 'Tambah Investasi'} onClose={onClose} width={520}>
      <Field label="Nama Investasi" error={errors.name}>
        <Input
          value={form.name}
          onChange={set('name')}
          placeholder="cth. BCA Deposito, BBCA, Bitcoin"
        />
      </Field>

      <Field label="Jenis Aset" error={errors.assetType}>
        <Select value={form.assetType} onChange={set('assetType')} disabled={hasTransactions}>
          {ASSET_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      </Field>

      {/* Type-specific fields */}
      {form.assetType === 'deposito' && (
        <>
          <div className="formGrid">
            <Field label="Bunga per Tahun (%)">
              <Input
                type="number"
                value={form.interestRate}
                onChange={set('interestRate')}
                placeholder="5"
              />
            </Field>
            <Field label="Tanggal Jatuh Tempo">
              <Input type="date" value={form.maturityDate} onChange={set('maturityDate')} />
            </Field>
          </div>
          <Field label="Nama Bank">
            <Input value={form.bankName} onChange={set('bankName')} placeholder="cth. BCA, BNI" />
          </Field>
        </>
      )}

      {form.assetType === 'saham' && (
        <Field label="Kode Saham">
          <Input value={form.tickerSymbol} onChange={set('tickerSymbol')} placeholder="cth. BBCA, TLKM" />
        </Field>
      )}

      {form.assetType === 'crypto' && (
        <Field label="Nama Koin">
          <Input value={form.coinName} onChange={set('coinName')} placeholder="cth. Bitcoin, Ethereum" />
        </Field>
      )}

      {form.assetType === 'reksadana' && (
        <>
          <Field label="Nama Reksa Dana">
            <Input value={form.fundName} onChange={set('fundName')} placeholder="cth. Schroder Dana Istimewa" />
          </Field>
          <Field label="Manajer Investasi">
            <Input value={form.managerName} onChange={set('managerName')} placeholder="cth. Schroder Investment" />
          </Field>
        </>
      )}

      <Field label="Catatan (opsional)">
        <Input value={form.notes} onChange={set('notes')} placeholder="Catatan tambahan" />
      </Field>

      {errors._general && (
        <div style={{ color: 'var(--red-ink)', fontSize: 12, marginBottom: 8 }}>{errors._general}</div>
      )}

      <button className="btnPrimary" onClick={handleSubmit}>
        {initial ? 'Simpan Perubahan' : 'Tambah'}
      </button>

      {initial && onDelete && (
        <button className="btnSmallDanger" onClick={handleDelete}>
          {confirmDelete ? 'Yakin hapus?' : 'Hapus'}
        </button>
      )}
    </Modal>
  );
}
