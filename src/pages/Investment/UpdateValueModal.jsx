import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import { validateCurrentValue } from '../../services/investmentValidator';
import { fmtFull } from '../../utils/formatters';

/**
 * UpdateValueModal — Update current market value of an investment.
 */
export default function UpdateValueModal({ investment, onClose, onConfirm }) {
  const [value, setValue] = useState(String(investment.currentValue || 0));
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const numValue = Number(value);
    const err = validateCurrentValue(numValue);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    onConfirm(numValue);
  };

  return (
    <Modal title={`Update Nilai — ${investment.name}`} onClose={onClose} width={400}>
      <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 12 }}>
        Nilai saat ini: <strong>{fmtFull(investment.currentValue || 0)}</strong>
      </div>

      <Field label="Nilai Terkini (Rp)" error={error}>
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0"
        />
      </Field>

      <button className="btnPrimary" onClick={handleSubmit}>
        Simpan
      </button>
    </Modal>
  );
}
