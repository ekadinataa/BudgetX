import { useId, useState } from 'react';
import { rp, rpShort } from '../../utils/formatters';

/** SVG presentation only: callers supply totals from the production period helpers. */
export default function CashFlowTrend({ values }) {
  const [active, setActive] = useState(null);
  const tooltipId = useId();
  if (!values.length) return <p className="reportEmpty">Belum ada data arus kas untuk rentang ini.</p>;
  const max = Math.max(1, ...values.flatMap(v => [v.income, v.expense])) * 1.12;
  const x = index => values.length === 1 ? 360 : 55 + index * 635 / (values.length - 1);
  const y = value => 215 - value / max * 195;
  const points = key => values.map((v, i) => `${x(i)},${y(v[key])}`).join(' ');
  const item = active === null ? null : values[active];
  return <div className="trendWrap" onKeyDown={e => { if (e.key === 'Escape') setActive(null); }}>
    {item && <div id={tooltipId} className="chartTooltip" role="status" style={{ left: `${Math.max(18, Math.min(82, x(active) / 720 * 100))}%`, top: `${Math.max(20, y(item.income) / 250 * 100)}%` }}>
      {item.label} · Masuk {rp(item.income)} · Keluar {rp(item.expense)}
    </div>}
    <svg className="trendChart" viewBox="0 0 720 250" role="group" aria-label={`Tren pemasukan dan pengeluaran, ${values.length} periode tersedia`}>
      {[0, .5, 1].map(f => <g key={f}><line x1="55" x2="690" y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeDasharray="3 5" /><text x="47" y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="var(--label-2)">{rpShort(max * f)}</text></g>)}
      <path className="area" d={`M ${x(0)},215 L ${points('income')} L ${x(values.length - 1)},215 Z`} />
      <polyline className="income" points={points('income')} /><polyline className="expense" points={points('expense')} />
      {values.map((v, i) => <g key={v.key}>
        <circle className="point" role="img" tabIndex={0} cx={x(i)} cy={y(v.income)} r="5" aria-label={`${v.label}: pemasukan ${rp(v.income)}, pengeluaran ${rp(v.expense)}`} aria-describedby={active === i ? tooltipId : undefined} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} />
        <text x={x(i)} y="242" textAnchor="middle" fontSize="10" fill="var(--label-2)">{v.label}</text>
      </g>)}
    </svg>
  </div>;
}
