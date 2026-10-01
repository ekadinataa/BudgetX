/**
 * DailyBarChart — Daily expense bar chart spanning the full period.
 *
 * Color-coded bars: blue for today, red for high spending (>70% of max),
 * amber for medium (>40%), gray for low. Includes cycle start day indicator
 * as a dashed vertical line.
 *
 * @param {Object} props
 * @param {number[]} props.data - Daily expense amounts
 * @param {number} props.max - Maximum daily expense (for scaling)
 * @param {string[]} props.days - Array of date strings ("YYYY-MM-DD")
 * @param {number} props.cycleStart - Billing cycle start day (1-28)
 *
 * Requirements: 7.4
 */
export default function DailyBarChart({ data, max, days, cycleStart }) {
  const H = 100;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const barW = 22;
  const gap = 4;
  const totalW = Math.max(data.length * (barW + gap), 580);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={totalW} height={H + 30} style={{ display: 'block' }}>
        {data.map((v, i) => {
          const bh = max > 0 ? (v / max) * (H - 14) : 0;
          const x = i * (barW + gap) + 2;
          const ds = days[i];
          const day = ds ? parseInt(ds.split('-')[2]) : i + 1;
          const isTd = ds === todayStr;
          const isCyc = day === cycleStart;
          const color = isTd
            ? 'var(--blue)'
            : v > max * 0.7
              ? 'var(--red)'
              : v > max * 0.4
                ? 'var(--orange)'
                : 'var(--text-6)';
          return (
            <g key={i}>
              {isCyc && (
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={H}
                  stroke="var(--blue)"
                  strokeWidth="1"
                  strokeDasharray="3,2"
                  opacity="0.5"
                />
              )}
              {bh > 0 && (
                <rect
                  x={x}
                  y={H - bh}
                  width={barW}
                  height={bh}
                  rx="3"
                  fill={color}
                  fillOpacity={0.9}
                />
              )}
              {(day === 1 || day % 5 === 0 || isCyc) && (
                <text
                  x={x + barW / 2}
                  y={H + 18}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill={isCyc ? 'var(--blue)' : 'var(--text-2)'}
                  fontWeight={isCyc ? 700 : 400}
                >
                  {day}
                </text>
              )}
            </g>
          );
        })}
        <line x1="0" y1={H} x2={totalW} y2={H} stroke="var(--border)" strokeWidth="1" />
      </svg>
      {cycleStart > 1 && (
        <div style={{ fontSize: 11, color: 'var(--text-5)', marginTop: 6 }}>
          <span style={{ color: 'var(--blue-ink)', fontWeight: 600 }}>│</span> = hari mulai siklus (tgl{' '}
          {cycleStart})
        </div>
      )}
    </div>
  );
}
