import { useState, useMemo } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { validateDebt } from '../../services/debtValidator';
import { calcAnnuityInstallment, calcTotalInterest } from '../../utils/debtHelpers';
import { fmtFull } from '../../utils/formatters';
import { TODAY } from '../../data/defaults';

/**
 * DebtFormModal — Create/edit debt record form with optional annuity interest.
 */
export default function DebtFormModal({ initial, wallets, onClose, onSave, onDelete }) {
  const hasPayments = initial?.payments?.length > 0;

  const [form, setForm] = useState({
    type: initial?.type || 'utang',
    personName: initial?.personName || '',
    totalAmount: initial?.totalAmount ? String(initial.totalAmount) : '',
    walletId: initial?.walletId || wallets[0]?.id || '',
    dueDate: initial?.dueDate || '',
    description: initial?.description || '',
    interestEnabled: initial?.interestEnabled || false,
    interestRate: initial?.interestRate ? String(initial.interestRate) : '8',
    tenorMonths: initial?.tenorMonths ? String(initial.tenorMonths) : '12',
    startDate: initial?.startDate || TODAY,
  });

  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Preview calculations
  const preview = useMemo(() => {
    if (!form.interestEnabled || !form.totalAmount || !form.tenorMonths || !form.interestRate) return null;
    const principal = Number(form.totalAmount);
    const rate = Number(form.interestRate);
    const tenor = Number(form.tenorMonths);
    if (principal <= 0 || tenor <= 0) return null;

    const installment = calcAnnuityInstallment(principal, rate, tenor);
    const totalInterest = calcTotalInterest(principal, rate, tenor);
    const totalPayment = installment * tenor;

    return { installment, totalInterest, totalPayment };
  }, [form.interestEnabled, form.totalAmount, form.interestRate, form.tenorMonths]);

  const validate = () => {
    const data = {
      ...form,
      totalAmount: Number(form.totalAmount),
    };
    const error = validateDebt(data, hasPayments);
    if (error) {
      const errs = {};
      if (error.includes('Nama')) errs.personName = error;
      else if (error.includes('Jumlah')) errs.totalAmount = error;
      else if (error.includes('Tipe')) errs.type = error;
      else if (error.includes('Dompet')) errs.walletId = error;
      else if (error.includes('tanggal')) errs.dueDate = error;
      else errs._general = error;
      setErrors(errs);
      return false;
    }

    // Validate interest fields
    if (form.interestEnabled) {
      if (!form.interestRate || Number(form.interestRate) <= 0) {
        setErrors({ interestRate: 'Bunga harus lebih dari 0' });
        return false;
      }
      if (!form.tenorMonths || Number(form.tenorMonths) <= 0) {
        setErrors({ tenorMonths: 'Tenor harus lebih dari 0' });
        return false;
      }
    }

    setErrors({});
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const data = {
      type: form.type,
      personName: form.personName.trim(),
      totalAmount: Number(form.totalAmount),
      walletId: form.walletId,
      dueDate: form.dueDate,
      description: form.description.trim(),
      interestEnabled: form.interestEnabled,
    };

    if (form.interestEnabled) {
      data.interestRate = Number(form.interestRate);
      data.tenorMonths = Number(form.tenorMonths);
      data.startDate = form.startDate;
      data.monthlyInstallment = calcAnnuityInstallment(data.totalAmount, data.interestRate, data.tenorMonths);
    } else {
      data.interestRate = 0;
      data.tenorMonths = 0;
      data.startDate = '';
      data.monthlyInstallment = 0;
    }

    // If editing with payments, don't send type/totalAmount/interest changes
    if (hasPayments) {
      delete data.type;
      delete data.totalAmount;
      delete data.interestEnabled;
      delete data.interestRate;
      delete data.tenorMonths;
      delete data.startDate;
      delete data.monthlyInstallment;
      delete data.schedule;
    }

    onSave(data);
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(initial.id);
  };

  return (
    <Modal title={initial ? 'Edit Utang/Piutang' : 'Tambah Utang/Piutang'} onClose={onClose} width={520}>
      <Field label="Tipe" error={errors.type}>
        <div className="radioGroup">
          <label className="radioRow">
            <input
              type="radio"
              name="debtType"
              value="utang"
              checked={form.type === 'utang'}
              onChange={set('type')}
              disabled={hasPayments}
            />
            Utang (saya pinjam)
          </label>
          <label className="radioRow">
            <input
              type="radio"
              name="debtType"
              value="piutang"
              checked={form.type === 'piutang'}
              onChange={set('type')}
              disabled={hasPayments}
            />
            Piutang (saya pinjamkan)
          </label>
        </div>
      </Field>

      <Field label="Nama Orang" error={errors.personName}>
        <Input
          value={form.personName}
          onChange={set('personName')}
          placeholder="cth. Budi, Bank BCA"
        />
      </Field>

      <div className="formGrid">
        <Field label="Jumlah Pokok (Rp)" error={errors.totalAmount}>
          <Input
            type="number"
            value={form.totalAmount}
            onChange={set('totalAmount')}
            placeholder="0"
            disabled={hasPayments}
          />
        </Field>
        <Field label="Dompet" error={errors.walletId}>
          <Select value={form.walletId} onChange={set('walletId')}>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Interest toggle */}
      {!hasPayments && (
        <div style={{ marginBottom: 16 }}>
          <label className="radioRow" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.interestEnabled}
              onChange={(e) => setForm((f) => ({ ...f, interestEnabled: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: 'var(--blue)' }}
            />
            <span style={{ fontWeight: 600 }}>Pakai Bunga (Anuitas)</span>
          </label>
        </div>
      )}

      {/* Interest fields */}
      {form.interestEnabled && !hasPayments && (
        <>
          <div className="formGrid">
            <Field label="Bunga per Tahun (%)" error={errors.interestRate}>
              <Input
                type="number"
                value={form.interestRate}
                onChange={set('interestRate')}
                placeholder="8"
              />
            </Field>
            <Field label="Tenor (bulan)" error={errors.tenorMonths}>
              <Input
                type="number"
                value={form.tenorMonths}
                onChange={set('tenorMonths')}
                placeholder="12"
              />
            </Field>
          </div>

          <Field label="Tanggal Mulai Cicilan">
            <Input type="date" value={form.startDate} onChange={set('startDate')} />
          </Field>

          {/* Preview */}
          {preview && (
            <div style={{
              padding: '12px 16px',
              background: 'var(--blue-soft)',
              borderRadius: 10,
              border: '1px solid var(--separator)',
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
                📊 Preview Cicilan Anuitas
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
                <div>Cicilan/bulan:</div>
                <div style={{ fontWeight: 700 }}>{fmtFull(preview.installment)}</div>
                <div>Total bunga:</div>
                <div style={{ fontWeight: 700 }}>{fmtFull(preview.totalInterest)}</div>
                <div>Total bayar:</div>
                <div style={{ fontWeight: 700 }}>{fmtFull(preview.totalPayment)}</div>
                <div>Pokok:</div>
                <div>{fmtFull(Number(form.totalAmount))}</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Show interest info for existing records */}
      {hasPayments && initial?.interestEnabled && (
        <div style={{
          padding: '10px 14px',
          background: 'var(--bg-3)',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 12,
          color: 'var(--text-3)',
        }}>
          Bunga {initial.interestRate}%/tahun · Tenor {initial.tenorMonths} bulan · Cicilan {fmtFull(initial.monthlyInstallment)}/bulan
        </div>
      )}

      <Field label="Tanggal Jatuh Tempo (opsional)" error={errors.dueDate}>
        <Input type="date" value={form.dueDate} onChange={set('dueDate')} />
      </Field>

      <Field label="Keterangan (opsional)">
        <Input
          value={form.description}
          onChange={set('description')}
          placeholder="cth. KPR, Pinjaman Bank"
        />
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
