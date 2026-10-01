import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import { validateCustomRange } from '../../services/validator';

/**
 * Compute the day after a given YYYY-MM-DD date string.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string} Next day in "YYYY-MM-DD" format
 */
function dayAfter(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format a YYYY-MM-DD date string to Indonesian locale (e.g. "23 Mei 2026").
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string}
 */
function formatDateID(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * PeriodTransitionModal — Modal for creating the next custom range period
 * when the current one has ended.
 *
 * @param {Object} props
 * @param {{ id: string, start: string, end: string }} props.previousPeriod - The period that just ended
 * @param {() => void} props.onClose - Callback to close the modal
 * @param {(newStart: string, newEnd: string, copyBudget: boolean) => void} props.onCreatePeriod - Callback to create the new period
 */
export default function PeriodTransitionModal({ previousPeriod, onClose, onCreatePeriod }) {
  const newStart = dayAfter(previousPeriod.end);
  const [endDate, setEndDate] = useState('');
  const [endError, setEndError] = useState('');
  const [copyBudget, setCopyBudget] = useState(true);

  const handleEndChange = (e) => {
    const val = e.target.value;
    setEndDate(val);
    if (val) {
      const err = validateCustomRange({ start: newStart, end: val });
      setEndError(err && val <= newStart ? 'Tanggal akhir harus setelah tanggal mulai' : '');
    } else {
      setEndError('');
    }
  };

  const isValid = endDate && validateCustomRange({ start: newStart, end: endDate }) === null;

  const handleConfirm = () => {
    if (isValid) {
      onCreatePeriod(newStart, endDate, copyBudget);
    }
  };

  return (
    <Modal title="Periode Baru" onClose={onClose} width={460}>
      <p style={{ fontSize: 13, color: 'var(--text-4)', marginBottom: 16, lineHeight: 1.6 }}>
        Periode sebelumnya telah berakhir. Buat periode baru untuk melanjutkan pencatatan budget Anda.
      </p>

      {/* Previous period reference */}
      <div className="salaryAdjustSection">
        <span className="cycleExampleLabel">Periode sebelumnya</span>
        <span className="salaryAdjustPreviewDate">
          {formatDateID(previousPeriod.start)} – {formatDateID(previousPeriod.end)}
        </span>
      </div>

      {/* Start date (read-only, auto-calculated) */}
      <Field label="Tanggal Mulai">
        <Input
          type="date"
          value={newStart}
          readOnly
          style={{ background: 'var(--bg-2)', cursor: 'not-allowed', opacity: 0.7 }}
        />
      </Field>

      {/* End date (user picks) */}
      <Field label="Tanggal Akhir" error={endError}>
        <Input
          type="date"
          value={endDate}
          onChange={handleEndChange}
          min={newStart}
        />
      </Field>

      {/* Copy / Fresh toggle */}
      <Field label="Opsi Budget">
        <div className="periodModeRow">
          <label className={copyBudget ? 'periodModeBtn periodModeBtnActive' : 'periodModeBtn'}>
            <input
              type="radio"
              name="copyMode"
              checked={copyBudget}
              onChange={() => setCopyBudget(true)}
              className="salaryAdjustCheckbox"
            />
            <div>
              <div className="periodModeName">📋 Salin dari periode sebelumnya</div>
              <div className="periodModeDesc">Salin alokasi pendapatan & kategori</div>
            </div>
          </label>
          <label className={!copyBudget ? 'periodModeBtn periodModeBtnActive' : 'periodModeBtn'}>
            <input
              type="radio"
              name="copyMode"
              checked={!copyBudget}
              onChange={() => setCopyBudget(false)}
              className="salaryAdjustCheckbox"
            />
            <div>
              <div className="periodModeName">✨ Mulai baru</div>
              <div className="periodModeDesc">Mulai dengan budget kosong</div>
            </div>
          </label>
        </div>
      </Field>

      <button
        className="btnPrimary"
        style={!isValid ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
        disabled={!isValid}
        onClick={handleConfirm}
      >
        Buat Periode Baru
      </button>
    </Modal>
  );
}
