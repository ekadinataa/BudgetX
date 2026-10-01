import { useState, useMemo } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import { adjustCycleStart } from '../../utils/periodAdjuster';
import { validateCustomRange } from '../../services/validator';

const DAY_OPTIONS = [1, 5, 10, 15, 20, 21, 22, 23, 24, 25, 26, 27, 28];

/**
 * PeriodModal — Choose budget period mode: standard month, custom billing cycle,
 * or custom date range.
 *
 * "Per Bulan" = standard calendar month (1st – end of month).
 * "Custom Siklus" = billing cycle starting on a chosen day (e.g. 23rd of prev month – 22nd).
 * "Custom Rentang" = user-defined start and end dates for the budget period.
 *
 * When in Custom Siklus mode, a "Sesuaikan hari libur" toggle allows the user
 * to enable automatic adjustment of the cycle start date when payday falls on
 * a weekend or Indonesian public holiday.
 *
 * @param {Object} props
 * @param {'month'|'cycle'|'range'} props.currentMode
 * @param {number} props.currentCycleStart
 * @param {boolean} [props.currentSalaryAdjust=false]
 * @param {() => void} props.onClose
 * @param {(mode: string, cycleStart: number, salaryAdjust: boolean, rangeStart?: string, rangeEnd?: string) => void} props.onSave
 */
export default function PeriodModal({ currentMode, currentCycleStart, currentSalaryAdjust = false, onClose, onSave }) {
  const [mode, setMode] = useState(currentMode);
  const [day, setDay] = useState(currentCycleStart > 1 ? currentCycleStart : 25);
  const [salaryAdj, setSalaryAdj] = useState(currentSalaryAdjust);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeError, setRangeError] = useState('');

  // Compute adjusted date preview for the current month
  const adjustedPreview = useMemo(() => {
    if (!salaryAdj || mode !== 'cycle' || day <= 1) return null;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-indexed
    const adjusted = adjustCycleStart(year, month, day);
    const nominal = new Date(year, month - 1, day);
    const isAdjusted = adjusted.getTime() !== nominal.getTime();
    return {
      date: adjusted,
      label: adjusted.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      isAdjusted,
    };
  }, [salaryAdj, mode, day]);

  // Validate range dates whenever they change
  const handleRangeStartChange = (e) => {
    const val = e.target.value;
    setRangeStart(val);
    if (val && rangeEnd) {
      const err = validateCustomRange({ start: val, end: rangeEnd });
      setRangeError(err && rangeEnd <= val ? 'Tanggal akhir harus setelah tanggal mulai' : '');
    } else {
      setRangeError('');
    }
  };

  const handleRangeEndChange = (e) => {
    const val = e.target.value;
    setRangeEnd(val);
    if (rangeStart && val) {
      const err = validateCustomRange({ start: rangeStart, end: val });
      setRangeError(err && val <= rangeStart ? 'Tanggal akhir harus setelah tanggal mulai' : '');
    } else {
      setRangeError('');
    }
  };

  // Determine if save button should be disabled
  const isSaveDisabled = mode === 'range' && (
    !rangeStart || !rangeEnd || validateCustomRange({ start: rangeStart, end: rangeEnd }) !== null
  );

  const handleSave = () => {
    if (mode === 'range') {
      onSave('range', 1, false, rangeStart, rangeEnd);
    } else {
      onSave(mode, mode === 'cycle' ? day : 1, mode === 'cycle' ? salaryAdj : false);
    }
  };

  return (
    <Modal title="Atur Periode Budget" onClose={onClose} width={460}>
      <p style={{ fontSize: 13, color: 'var(--text-4)', marginBottom: 20, lineHeight: 1.6 }}>
        Pilih bagaimana periode budget dihitung. Jika gaji Anda masuk di pertengahan bulan
        (misal tanggal 23–25), gunakan <strong>Custom Siklus</strong> agar budget sesuai
        dengan siklus pemasukan Anda.
      </p>

      {/* Mode selector */}
      <Field label="Mode Periode">
        <div className="periodModeRow">
          <button
            className={mode === 'month' ? 'periodModeBtn periodModeBtnActive' : 'periodModeBtn'}
              aria-pressed={mode === 'month'}
            onClick={() => setMode('month')}
          >
            <span className="periodModeIcon">📅</span>
            <div>
              <div className="periodModeName">Per Bulan</div>
              <div className="periodModeDesc">Tanggal 1 – akhir bulan</div>
            </div>
          </button>
          <button
            className={mode === 'cycle' ? 'periodModeBtn periodModeBtnActive' : 'periodModeBtn'}
              aria-pressed={mode === 'cycle'}
            onClick={() => setMode('cycle')}
          >
            <span className="periodModeIcon">🔄</span>
            <div>
              <div className="periodModeName">Custom Siklus</div>
              <div className="periodModeDesc">Sesuai tanggal gajian</div>
            </div>
          </button>
          <button
            className={mode === 'range' ? 'periodModeBtn periodModeBtnActive' : 'periodModeBtn'}
              aria-pressed={mode === 'range'}
            onClick={() => setMode('range')}
          >
            <span className="periodModeIcon">📆</span>
            <div>
              <div className="periodModeName">Custom Rentang</div>
              <div className="periodModeDesc">Pilih tanggal mulai & akhir</div>
            </div>
          </button>
        </div>
      </Field>

      {/* Cycle start day picker (only shown for custom cycle mode) */}
      {mode === 'cycle' && (
        <Field label="Tanggal Mulai Siklus">
          <div className="dayGrid">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={day === d ? 'dayBtn dayBtnActive' : 'dayBtn'}
                aria-pressed={day === d}
              >
                {d}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-5)', marginTop: 10 }}>
            {day <= 1
              ? 'Siklus: 1 – akhir bulan (sama dengan Per Bulan)'
              : `Siklus: tgl ${day} bulan lalu – tgl ${day - 1} bulan berjalan`}
          </p>
          <div className="cycleExample">
            <span className="cycleExampleLabel">Contoh:</span>
            {day <= 1
              ? ' 1 Apr – 30 Apr 2026'
              : ` ${day} Mar – ${day - 1} Apr 2026`}
          </div>
        </Field>
      )}

      {/* Salary adjustment toggle (only shown for custom cycle mode) */}
      {mode === 'cycle' && (
        <div className="salaryAdjustSection">
          <label className="toggleRow">
            <input
              type="checkbox"
              checked={salaryAdj}
              onChange={(e) => setSalaryAdj(e.target.checked)}
              className="salaryAdjustCheckbox"
            />
            <span className="periodModeName">Sesuaikan hari libur</span>
          </label>
          <p className="periodModeDesc">
            Jika tanggal gajian jatuh di hari libur/weekend, periode akan dimulai dari hari kerja sebelumnya
          </p>
          {salaryAdj && adjustedPreview && (
            <div className="cycleExample">
              <span className="cycleExampleLabel">
                {adjustedPreview.isAdjusted ? 'Tanggal disesuaikan:' : 'Tanggal tidak berubah:'}
              </span>
              <span className="salaryAdjustPreviewDate">{adjustedPreview.label}</span>
            </div>
          )}
        </div>
      )}

      {/* Date range inputs (only shown for custom range mode) */}
      {mode === 'range' && (
        <>
          <Field label="Tanggal Mulai">
            <Input
              type="date"
              value={rangeStart}
              onChange={handleRangeStartChange}
            />
          </Field>
          <Field label="Tanggal Akhir" error={rangeError}>
            <Input
              type="date"
              value={rangeEnd}
              onChange={handleRangeEndChange}
            />
          </Field>
        </>
      )}

      <button
        className="btnPrimary"
        style={isSaveDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
        disabled={isSaveDisabled}
        onClick={handleSave}
      >
        Simpan Pengaturan
      </button>
    </Modal>
  );
}
