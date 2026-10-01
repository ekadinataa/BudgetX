import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { fmtFull } from '../../utils/formatters';
import { validatePayment } from '../../services/debtValidator';
import { getCurrentInstallmentInfo } from '../../utils/debtHelpers';
import { TODAY } from '../../data/defaults';

/**
 * PaymentModal — Record payment against a debt record.
 * For annuity debts, shows principal/interest breakdown.
 */
export default function PaymentModal({ debt, wallets, onClose, onConfirm }) {
  const installmentInfo = getCurrentInstallmentInfo(debt);
  const isAnnuityDebt = !!installmentInfo;

  const [form, setForm] = useState({
    amount: installmentInfo ? String(installmentInfo.total) : '',
    date: TODAY,
    walletId: debt.walletId || wallets[0]?.id || '',
    note: installmentInfo ? `Cicilan ke-${installmentInfo.month}` : '',
  });

  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const payment = {
      amount: Number(form.amount),
      date: form.date,
    };

    // Custom validation for annuity: the payment amount is the total (principal + interest)
    // but only principal reduces remainingAmount
    if (isAnnuityDebt) {
      if (payment.amount <= 0) {
        setErrors({ amount: 'Jumlah pembayaran harus lebih dari 0' });
        return false;
      }
      if (!payment.date || !/^\d{4}-\d{2}-\d{2}$/.test(payment.date)) {
        setErrors({ date: 'Tanggal wajib diisi' });
        return false;
      }
      setErrors({});
      return true;
    }

    const error = validatePayment(payment, debt.remainingAmount);
    if (error) {
      const errs = {};
      if (error.includes('Jumlah') || error.includes('melebihi')) errs.amount = error;
      else if (error.includes('Tanggal')) errs.date = error;
      else errs._general = error;
      setErrors(errs);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const paymentData = {
      amount: Number(form.amount),
      date: form.date,
      walletId: form.walletId,
      note: form.note.trim(),
    };

    // For annuity debts, calculate principal/interest based on actual payment amount
    // Interest is fixed (remainingAmount × monthlyRate), principal = payment - interest
    if (isAnnuityDebt) {
      const monthlyRate = (debt.interestRate || 0) / 100 / 12;
      const interestPart = Math.round(debt.remainingAmount * monthlyRate);
      const principalPart = Math.max(0, paymentData.amount - interestPart);
      paymentData.principalPart = principalPart;
      paymentData.interestPart = interestPart;
      paymentData.isAnnuityPayment = true;
    }

    onConfirm(paymentData);
  };

  const handlePayFull = () => {
    if (isAnnuityDebt) {
      setForm((f) => ({ ...f, amount: String(installmentInfo.total) }));
    } else {
      setForm((f) => ({ ...f, amount: String(debt.remainingAmount) }));
    }
  };

  return (
    <Modal title="Catat Pembayaran" onClose={onClose} width={440}>
      <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg-3)', borderRadius: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
          {debt.type === 'utang' ? 'Utang ke' : 'Piutang dari'} {debt.personName}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>
          Sisa pokok: <strong>{fmtFull(debt.remainingAmount)}</strong> dari {fmtFull(debt.totalAmount)}
        </div>
        {isAnnuityDebt && (
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
            Bunga {debt.interestRate}%/tahun · Tenor {debt.tenorMonths} bulan
          </div>
        )}
      </div>

      {/* Annuity installment breakdown */}
      {isAnnuityDebt && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--orange-soft)',
          borderRadius: 10,
          border: '1px solid rgba(245, 158, 11, 0.2)',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
            📋 Cicilan Bulan ke-{installmentInfo.month}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 12, color: 'var(--text-3)' }}>
            <div>Pokok:</div>
            <div style={{ fontWeight: 600 }}>{fmtFull(installmentInfo.principal)}</div>
            <div>Bunga:</div>
            <div style={{ fontWeight: 600 }}>{fmtFull(installmentInfo.interest)}</div>
            <div style={{ borderTop: '1px solid rgba(245, 158, 11, 0.2)', paddingTop: 4, marginTop: 4 }}>Total cicilan:</div>
            <div style={{ fontWeight: 700, borderTop: '1px solid rgba(245, 158, 11, 0.2)', paddingTop: 4, marginTop: 4 }}>{fmtFull(installmentInfo.total)}</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 8, lineHeight: 1.4 }}>
            💡 Dari {fmtFull(installmentInfo.total)} yang dibayar, hanya {fmtFull(installmentInfo.principal)} yang mengurangi pokok. Sisanya ({fmtFull(installmentInfo.interest)}) adalah bunga.
          </div>
        </div>
      )}

      <Field label="Jumlah Pembayaran (Rp)" error={errors.amount}>
        <Input
          type="number"
          value={form.amount}
          onChange={set('amount')}
          placeholder="0"
        />
        <button
          type="button"
          className="btnSmallGhost"
          onClick={handlePayFull}
        >
          {isAnnuityDebt
            ? `Bayar Cicilan (${fmtFull(installmentInfo.total)})`
            : `Bayar Lunas (${fmtFull(debt.remainingAmount)})`
          }
        </button>
      </Field>

      <div className="formGrid">
        <Field label="Tanggal" error={errors.date}>
          <Input type="date" value={form.date} onChange={set('date')} />
        </Field>
        <Field label="Dompet">
          <Select value={form.walletId} onChange={set('walletId')}>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Catatan (opsional)">
        <Input
          value={form.note}
          onChange={set('note')}
          placeholder="cth. Cicilan ke-2"
        />
      </Field>

      {errors._general && (
        <div style={{ color: 'var(--red-ink)', fontSize: 12, marginBottom: 8 }}>{errors._general}</div>
      )}

      <button className="btnPrimary" onClick={handleSubmit}>
        Catat Pembayaran
      </button>
    </Modal>
  );
}
