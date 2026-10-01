import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';

/**
 * IncomeModal — Modal to set the total monthly income amount.
 *
 * @param {Object} props
 * @param {number} props.current - Current total income value
 * @param {() => void} props.onClose - Close callback
 * @param {(value: string) => void} props.onSave - Save callback with the new income string
 *
 * Requirements: 5.3
 */
export default function IncomeModal({ current, onClose, onSave }) {
  const [val, setVal] = useState(String(current));

  return (
    <Modal title="Atur Total Pemasukan" onClose={onClose} width={400}>
      <Field label="Total Pemasukan Bulan Ini (Rp)">
        <Input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0"
        />
      </Field>
      <button className="btnPrimary" onClick={() => onSave(val)}>
        Simpan
      </button>
    </Modal>
  );
}
