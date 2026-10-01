import { useState, useMemo } from 'react';
import { rpShort, fmtDate } from '../../utils/formatters';
import { getCatById, getCatIcon } from '../../utils/helpers';
import NavIcon from '../../components/icons/NavIcon';

const DAY_HEADERS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/**
 * TxCalendar — month grid with per-day type dots and a detail list.
 *
 * Rebuild of the pre-revamp `Dashboard/Calendar.jsx`, moved to the Transactions
 * page and restyled with the reference's `cal*` primitives from
 * `styles/base.css` (see `data-od-id="tx-calendar"` in budgetx-app.html).
 * The reference shows it above the transaction list on this page.
 *
 * @param {Object} props
 * @param {Array} props.transactions - All transactions
 * @param {Array} props.categories - All categories
 */
export default function TxCalendar({ transactions, categories }) {
  const today = useMemo(() => new Date(), []);
  const [calMonth, setCalMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDay, setSelectedDay] = useState(today.getDate());

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const calMk = `${year}-${String(month + 1).padStart(2, '0')}`;

  // One pass over the month: which days have which transaction types, so the
  // dots and the selected-day list share a single source.
  const byDay = useMemo(() => {
    const map = {};
    transactions.forEach((t) => {
      if (!t.date?.startsWith(calMk)) return;
      const d = parseInt(t.date.slice(8, 10), 10);
      (map[d] ||= []).push(t);
    });
    return map;
  }, [transactions, calMk]);

  const cells = useMemo(() => {
    const out = [];
    for (let i = 0; i < new Date(year, month, 1).getDay(); i++) out.push(null);
    for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) out.push(d);
    return out;
  }, [year, month]);

  const isCurrentMonth =
    month === today.getMonth() && year === today.getFullYear();

  const selectedDate = `${calMk}-${String(selectedDay).padStart(2, '0')}`;
  const selectedTxs = byDay[selectedDay] || [];
  const selIncome = selectedTxs
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const selExpense = selectedTxs
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  const shift = (delta) =>
    setCalMonth(new Date(year, month + delta, 1));

  return (
    <div className="card calShell">
      <div className="calNavGroup">
        <button
          className="iconBtn"
          type="button"
          onClick={() => shift(-1)}
          aria-label="Bulan sebelumnya"
        >
          <NavIcon name="chevronLeft" size={16} />
        </button>
        <span className="calMonth">
          {calMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
        </span>
        <button
          className="iconBtn"
          type="button"
          onClick={() => shift(1)}
          aria-label="Bulan berikutnya"
        >
          <NavIcon name="chevronRight" size={16} />
        </button>
      </div>

      {/* Grid and day-detail side by side once there is width. `.calCell` uses
          aspect-ratio: 1/1, which the reference only ever draws at card width;
          left full-width on a 1440px display the cells grew to ~150px each. */}
      <div className="calBody">
      <div className="calGridWrap">
      <div className="calDayHeader">
        {DAY_HEADERS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="calGrid">
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} />;
          const list = byDay[day] || [];
          const types = {};
          list.forEach((t) => {
            types[t.type] =
              t.type === 'income' ? 'var(--green)'
                : t.type === 'transfer' ? 'var(--blue)'
                  : 'var(--red)';
          });
          return (
            <button
              key={day}
              type="button"
              className={
                'calCell'
                + (isCurrentMonth && day === today.getDate() ? ' calCellToday' : '')
                + (day === selectedDay ? ' calCellSel' : '')
              }
              onClick={() => setSelectedDay(day)}
              aria-label={`${day} ${calMonth.toLocaleDateString('id-ID', { month: 'long' })}`}
              aria-pressed={day === selectedDay}
            >
              <span>{day}</span>
              {list.length > 0 && (
                <span className="calDots">
                  {Object.keys(types).slice(0, 3).map((k) => (
                    <span key={k} className="calDot" style={{ background: types[k] }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      </div>

      <div className="calDetail">
        <div className="dateHeader">
          <span className="dateLabel">{fmtDate(selectedDate)}</span>
          <span className="dateTotals">
            {selIncome > 0 && (
              <span className="dateTotal num amountIn">+{rpShort(selIncome)}</span>
            )}
            {selExpense > 0 && (
              <span className="dateTotal num">−{rpShort(selExpense)}</span>
            )}
          </span>
        </div>

        {selectedTxs.length === 0 ? (
          <p className="cardSub" style={{ padding: '14px 0', textAlign: 'center' }}>
            Tidak ada transaksi pada tanggal ini.
          </p>
        ) : (
          <div className="list">
            {selectedTxs.map((t) => {
              const cat = getCatById(t.categoryId, categories);
              return (
                <div key={t.id} className="listRow">
                  <span className="itemIcon" aria-hidden="true">{getCatIcon(cat)}</span>
                  <span className="itemInfo">
                    <span className="itemName truncate">{t.note || '—'}</span>
                    <span className="itemMeta">
                      {cat ? cat.name : t.type === 'transfer' ? 'Transfer' : '—'}
                    </span>
                  </span>
                  <span
                    className="itemAmount num"
                    style={{
                      color:
                        t.type === 'income' ? 'var(--green-ink)'
                          : t.type === 'transfer' ? 'var(--indigo-ink)'
                            : 'var(--label)',
                    }}
                  >
                    {t.type === 'income' ? '+' : t.type === 'transfer' ? '' : '−'}
                    {rpShort(t.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
