import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';

/**
 * CycleSettingModal — Modal for selecting the billing cycle start date.
 *
 * Allows the user to pick a cycle start day (1–28). The selected day determines
 * how the reporting period boundaries are calculated. Persisted via the parent's
 * setCycleStart which writes to localStorage.
 *
 * @param {Object} props
 * @param {number} props.current - Current cycle start day
 * @param {() => void} props.onClose - Close callback
 * @param {(day: number) => void} props.onSave - Save callback with selected day
 *
 * Requirements: 7.7, 7.8
 */
export default function CycleSettingModal({ current, onClose, onSave }) {
  const [day, setDay] = useState(current);

  const dayOptions = [1, 5, 10, 15, 20, 23, 24, 25, 26, 27, 28];

  return (
    <Modal title="Atur Siklus Pembayaran" onClose={onClose} width={420}>
      <p
        style={{
          fontSize: 13,
          color: 'var(--text-4)',
          marginBottom: 16,
          lineHeight: 1.6,
        }}
      >
        Tentukan tanggal mulai siklus bulanan Anda. Misalnya jika gaji masuk tanggal 25,
        periode laporan akan dihitung dari tgl 25 bulan lalu hingga tgl 24 bulan berjalan.
      </p>
      <Field label="Tanggal Mulai Siklus">
        <div className="dayGrid">
          {dayOptions.map((d) => (
            <button
              key={d}
              className={day === d ? 'dayBtn dayBtnActive' : 'dayBtn'}
              aria-pressed={day === d}
              onClick={() => setDay(d)}
            >
              {d}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-5)', marginTop: 10 }}>
          {day <= 1
            ? 'Siklus standar: 1 – akhir bulan'
            : `Siklus: tgl ${day} bulan lalu – tgl ${day - 1} bulan berjalan`}
        </p>
      </Field>
      <button
        className="btnPrimary"
        onClick={() => onSave(day)}
      >
        Simpan
      </button>
    </Modal>
  );
}
