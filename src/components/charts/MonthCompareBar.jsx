import { fmt } from '../../utils/formatters';

/**
 * MonthCompareBar — Horizontal comparison bars for current vs previous month expenses.
 *
 * Renders two horizontal bars side by side with labels and formatted values.
 *
 * @param {Object} props
 * @param {number} props.current - Current month expense total
 * @param {number} props.prev - Previous month expense total
 * @param {string} props.curLabel - Label for current month bar
 * @param {string} props.prevLabel - Label for previous month bar
 *
 * Requirements: 7.3
 */
export default function MonthCompareBar({ current, prev, curLabel, prevLabel }) {
  const max = Math.max(current, prev, 1);

  const bars = [
    { label: curLabel, value: current, color: 'var(--red-ink)' },
    { label: prevLabel, value: prev, color: 'var(--red-ink)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {bars.map((b) => (
        <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-4)', width: 52, flexShrink: 0 }}>
            {b.label}
          </span>
          <div
            style={{
              flex: 1,
              background: 'var(--bg-3)',
              borderRadius: 99,
              height: 10,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(b.value / max) * 100}%`,
                height: '100%',
                background: b.color,
                borderRadius: 99,
                transition: 'width 0.4s',
              }}
            />
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: b.color,
              width: 62,
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmt(b.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
