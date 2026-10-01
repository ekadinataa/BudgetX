import { useState } from 'react';
import { fmtFull, fmtDate } from '../../utils/formatters';
import { getDaysUntilDue } from '../../utils/debtHelpers';
import { getCurrentInstallmentInfo, generateAmortizationSchedule } from '../../utils/debtHelpers';
import NavIcon from '../../components/icons/NavIcon';

/**
 * DebtCard — one debt or receivable, on the reference's `recItem` family.
 *
 * `budgetx-app.html` shares `recList`/`recHead`/`recActions` across the
 * recurring, subscription and debt pages, and additionally defines
 * `progressWrap`/`progressBar` and `paymentHistory*` for this one — all three
 * are already in `base.css`. What the page owned locally and no longer does:
 * `cardOverdue`, `badgeUtang`/`badgePiutang`/`badgeSettled`, `toggleBtn`.
 */
export default function DebtCard({ debt, onEdit, onPay }) {
  // Today is computed per render, not read from a module-level constant: a tab
  // left open overnight must not keep yesterday's date (see AGENTS.md §9).
  // `getDaysUntilDue` wants "YYYY-MM-DD", not a Date — `date + 'T00:00:00'`
  // on a Date object stringifies to its toString() form and yields NaN, which
  // silently made every overdue badge disappear.
  const today = new Date().toISOString().slice(0, 10);
  const daysUntilDue = debt.dueDate ? getDaysUntilDue(debt.dueDate, today) : null;
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0 && debt.status === 'active';
  const progress = debt.totalAmount > 0
    ? ((debt.totalAmount - debt.remainingAmount) / debt.totalAmount) * 100
    : 0;

  const isUtang = debt.type === 'utang';
  const installmentInfo = getCurrentInstallmentInfo(debt);
  const isAnnuityDebt = debt.interestEnabled || (debt.interestRate > 0 && debt.tenorMonths > 0);

  return (
    <div className={`recItem${isOverdue ? ' recItemUrgent' : ''}`}>
      <div className="recHead">
        <span
          className="recIcon"
          style={{
            background: isUtang ? 'var(--red-soft)' : 'var(--blue-soft)',
            color: isUtang ? 'var(--red-ink)' : 'var(--blue-ink)',
          }}
          aria-hidden="true"
        >
          <NavIcon name={isUtang ? 'arrowDown' : 'arrow'} size={18} />
        </span>

        <div className="recItemInfo">
          <div className="recItemName truncate">{debt.personName}</div>
          <div className="recItemMeta">
            <span className={isUtang ? 'badge badgeOverdue' : 'badge badgeOk'}>
              {isUtang ? 'Utang' : 'Piutang'}
            </span>
            {isAnnuityDebt && (
              <span className="badge badgeSoon">
                {debt.interestRate}% Anuitas
              </span>
            )}
            {debt.status === 'settled' && <span className="badge badgeOk">Lunas</span>}
            {isOverdue && <span className="badge badgeOverdue">Terlambat</span>}
            {debt.dueDate && <span>Jatuh tempo: {fmtDate(debt.dueDate)}</span>}
          </div>
          {isAnnuityDebt && debt.status === 'active' && installmentInfo && (
            <div className="recItemSub num" style={{ marginTop: 4 }}>
              Cicilan ke-{installmentInfo.month}: {fmtFull(installmentInfo.total)}/bln
              (Pokok {fmtFull(installmentInfo.principal)} + Bunga {fmtFull(installmentInfo.interest)})
            </div>
          )}
          <div className="progressWrap">
            <div
              className="progressBar"
              style={{
                width: `${Math.min(100, progress)}%`,
                background: debt.status === 'settled' ? 'var(--green)' : 'var(--blue)',
              }}
            />
          </div>
        </div>

        <div className="recItemAmount">
          <div className="recItemValue num">{fmtFull(debt.totalAmount)}</div>
          <div className="recItemSub num">Sisa: {fmtFull(debt.remainingAmount)}</div>
        </div>
      </div>

      <div className="recActions">
        {debt.status === 'active' && (
          <button className="btnSmallPrimary" onClick={onPay}>
            Bayar
          </button>
        )}
        <button className="btnSmallGhost" onClick={onEdit}>
          <NavIcon name="edit" size={14} /> Edit
        </button>
        <ScheduleToggle debt={debt} isAnnuity={isAnnuityDebt} />
      </div>
    </div>
  );
}

/** Amortisation table, revealed on demand. */
function ScheduleToggle({ debt, isAnnuity }) {
  const [open, setOpen] = useState(false);
  if (!isAnnuity) return null;

  const schedule = generateAmortizationSchedule(
    debt.totalAmount,
    debt.interestRate,
    debt.tenorMonths,
    debt.startDate || debt.createdAt || '',
  );
  if (schedule.length === 0) return null;

  const paidCount = (debt.payments || []).length;

  return (
    <>
      <button className="btnSmallGhost" onClick={() => setOpen((v) => !v)}>
        {open ? 'Sembunyikan jadwal' : 'Tabel amortisasi'} ({schedule.length} bulan)
      </button>
      {open && (
        <div className="paymentHistory">
          <div className="paymentHistoryTitle">Jadwal Amortisasi</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tableCompact">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Bln</th>
                  <th style={{ textAlign: 'right' }}>Pokok</th>
                  <th style={{ textAlign: 'right' }}>Bunga</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Sisa</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row, i) => {
                  const isPaid = i < paidCount;
                  return (
                    <tr key={row.month} className={isPaid ? 'tableRowMuted' : undefined}>
                      <td>{row.month}{isPaid ? ' ✓' : ''}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmtFull(row.principal)}</td>
                      <td className="num" style={{ textAlign: 'right', color: 'var(--orange-ink)' }}>
                        {fmtFull(row.interest)}
                      </td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {fmtFull(row.total)}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmtFull(row.remainingPrincipal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
