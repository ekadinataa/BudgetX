import { useState } from 'react';
import { monthKey } from '../../utils/formatters';
import { getCatById } from '../../utils/helpers';
import AmountText from '../../components/ui/AmountText';
import styles from './Dashboard.module.css';

const DAY_HEADERS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/**
 * Calendar — Interactive monthly calendar with transaction dots and day detail.
 *
 * Shows colored dots for expense (red) and income (green) days.
 * Clicking a day shows that day's transactions below the calendar.
 *
 * @param {Object} props
 * @param {Array} props.transactions - All transactions
 * @param {Array} props.transactions - All transactions
 * @param {Array} props.categories - All categories
 * @param {Date} props.today - Today's date object
 *
 * Requirements: 6.3, 6.4
 */
export default function Calendar({ transactions, categories, today }) {
  const [calMonth, setCalMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDay, setSelectedDay] = useState(today.getDate());

  const calMk = monthKey(calMonth);
  const calTxs = transactions.filter((t) => t.date.startsWith(calMk));

  // Build day map: { dayNumber: { income, expense } }
  const dayMap = {};
  calTxs.forEach((t) => {
    const d = parseInt(t.date.split('-')[2], 10);
    if (!dayMap[d]) dayMap[d] = { income: 0, expense: 0 };
    if (t.type === 'income') dayMap[d].income += t.amount;
    if (t.type === 'expense') dayMap[d].expense += t.amount;
  });

  // Calendar grid
  const firstDow = calMonth.getDay(); // 0 = Sunday
  const totalDays = new Date(
    calMonth.getFullYear(),
    calMonth.getMonth() + 1,
    0
  ).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  const isCurrentMonth =
    calMonth.getMonth() === today.getMonth() &&
    calMonth.getFullYear() === today.getFullYear();

  const selectedDayStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  const selectedTxs = transactions.filter((t) => t.date === selectedDayStr);

  const prevMonth = () =>
    setCalMonth(
      new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1)
    );
  const nextMonth = () =>
    setCalMonth(
      new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1)
    );

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>
          {calMonth.toLocaleDateString('id-ID', {
            month: 'long',
            year: 'numeric',
          })}
        </h3>
        <div className={styles.calNavGroup}>
          <button className={styles.calNavBtn} onClick={prevMonth}>
            ‹
          </button>
          <button className={styles.calNavBtn} onClick={nextMonth}>
            ›
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className={styles.calGrid}>
        {DAY_HEADERS.map((d) => (
          <div key={d} className={styles.calDayHeader}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className={styles.calGrid}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const isToday = isCurrentMonth && day === today.getDate();
          const isSel = day === selectedDay && isCurrentMonth;
          const data = dayMap[day];

          let cellClass = styles.calCell;
          if (isToday) cellClass += ' ' + styles.calCellToday;
          if (isSel) cellClass += ' ' + styles.calCellSel;

          return (
            <button
              key={day}
              className={cellClass}
              onClick={() => setSelectedDay(day)}
            >
              <span
                style={{ fontSize: 12, fontWeight: isToday ? 700 : 400 }}
              >
                {day}
              </span>
              {data && (
                <div className={styles.calDots}>
                  {data.expense > 0 && (
                    <div
                      className={styles.calDot}
                      style={{ background: '#EF4444' }}
                    />
                  )}
                  {data.income > 0 && (
                    <div
                      className={styles.calDot}
                      style={{ background: '#22C55E' }}
                    />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day transactions */}
      {selectedTxs.length > 0 && (
        <div className={styles.calDetail}>
          <div className={styles.calDetailDate}>
            {new Date(selectedDayStr + 'T00:00:00').toLocaleDateString(
              'id-ID',
              { weekday: 'long', day: 'numeric', month: 'long' }
            )}
          </div>
          {selectedTxs.map((t) => {
            const cat = getCatById(t.categoryId, categories);
            return (
              <div key={t.id} className={styles.calTxRow}>
                <div className={styles.calTxLeft}>
                  <div
                    className={styles.calTxDot}
                    style={{
                      background: cat?.color || 'var(--text-6)',
                    }}
                  />
                  <span className={styles.calTxNote}>{t.note}</span>
                </div>
                <AmountText type={t.type} amount={t.amount} size={13} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
