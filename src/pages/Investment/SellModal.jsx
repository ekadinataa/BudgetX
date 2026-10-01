import { useState, useMemo } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { validateInvestmentTransaction } from '../../services/investmentValidator';
import { computeTotalUnits } from '../../utils/investmentHelpers';
import { fmtFull } from '../../utils/formatters';

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * SellModal — Record a sell transaction for an investment.
 */
export default function SellModal({ investment, wallets, onClose, onConfirm }) {
  const maxUnits = computeTotalUnits(investment.transactions || []);

  const [form, setForm] = useState({
    units: '',
    pricePerUnit: '',
    walletId: wallets[0]?.id || '',
    date: TODAY,
    note: '',
  });

  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const totalAmount = useMemo(() => {
    const u = Number(form.units) || 0;
    const p = Number(form.pricePerUnit) || 0;
    return u * p;
  }, [form.units, form.pricePerUnit]);

  const handleSubmit = () => {
    const data = {
      units: Number(form.units),
      pricePerUnit: Number(form.pricePerUnit),
      walletId: form.walletId,
      date: form.date || TODAY,
      note: form.note.trim(),
    };

    const error = validateInvestmentTransaction(data, 'sell', maxUnits);
    if (error) {
      if (error.includes('Unit')) setErrors({ units: error });
      else if (error.includes('Harga')) setErrors({ pricePerUnit: error });
      else if (error.includes('Dompet')) setErrors({ walletId: error });
      else setErrors({ _general: error });
      return;
    }

    setErrors({});
    onConfirm({
      ...data,
      totalAmount,
    });
  };

  return (
    <Modal title={`Jual — ${investment.name}`} onClose={onClose} width={460}>
      <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 12 }}>
        Unit yang dimiliki: <strong>{maxUnits}</strong>
      </div>

      <div className="formGrid">
        <Field label="Unit Jual" error={errors.units}>
          <Input
            type="number"
            value={form.units}
            onChange={set('units')}
            placeholder={`Max ${maxUnits}`}
          />
        </Field>
        <Field label="Harga per Unit (Rp)" error={errors.pricePerUnit}>
          <Input
            type="number"
            value={form.pricePerUnit}
            onChange={set('pricePerUnit')}
            placeholder="0"
          />
        </Field>
      </div>

      <div className="formGrid">
        <Field label="Dompet" error={errors.walletId}>
          <Select value={form.walletId} onChange={set('walletId')}>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tanggal">
          <Input type="date" value={form.date} onChange={set('date')} />
        </Field>
      </div>

      <Field label="Catatan (opsional)">
        <Input value={form.note} onChange={set('note')} placeholder="Catatan penjualan" />
      </Field>

      {totalAmount > 0 && (
        <div className="formPreview">
          <strong>Total: {fmtFull(totalAmount)}</strong>
        </div>
      )}

      {errors._general && (
        <div style={{ color: 'var(--red-ink)', fontSize: 12, marginBottom: 8 }}>{errors._general}</div>
      )}

      <button className="btnPrimary" onClick={handleSubmit}>
        Konfirmasi Jual
      </button>
    </Modal>
  );
}
