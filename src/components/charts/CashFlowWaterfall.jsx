import { fmtDate, rp } from '../../utils/formatters';
import { dailyCashFlow } from '../../utils/cashFlow';

/** Daily net cash flow. Transfers/adjustments are deliberately not cash flow. */
export default function CashFlowWaterfall({ transactions }) {
  const days = dailyCashFlow(transactions);
  const max = Math.max(1, ...days.map(day => Math.abs(day.net)));
  if (!days.length) return <p className="cardSub">Belum ada arus kas pada periode ini.</p>;
  return <div className="waterfall" role="img" aria-label="Arus kas bersih per hari aktif, tidak termasuk transfer atau penyesuaian saldo">
    {days.map(day => <span key={day.date} className={day.net < 0 ? 'out' : undefined} style={{ height: Math.max(8, Math.abs(day.net) / max * 64) }} title={`${fmtDate(day.date)}: bersih ${rp(day.net)}`} />)}
  </div>;
}
