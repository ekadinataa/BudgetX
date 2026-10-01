import { useState } from 'react';
import { usePageActions } from '../../context/pageActions';
import { fmtFull, fmt, monthKey } from '../../utils/formatters';
import {
  getCatById,
  sectionLabel,
  sectionColor,
  getPeriodRange,
  filterByRange,
} from '../../utils/helpers';
import {
  getTotalAmortizedCost,
  getAmortizedByCategory,
  getAmortizedBySection,
} from '../../utils/recurring';
import NavIcon from '../../components/icons/NavIcon';
import Select from '../../components/ui/Select';
import ProgressBar from '../../components/ui/ProgressBar';
import PieChart from '../../components/charts/PieChart';
import CompareBarChart from '../../components/charts/CompareBarChart';
import MonthCompareBar from '../../components/charts/MonthCompareBar';
import DailyBarChart from '../../components/charts/DailyBarChart';
import CycleSettingModal from './CycleSettingModal';

/**
 * ReportsPage — Financial reports with charts, comparisons, and budget performance.
 *
 * Displays cashflow summary, pie chart by category, income vs expense bar chart,
 * daily expense chart, and per-section/per-category budget performance.
 *
 * @param {Object} props
 * @param {Array} props.transactions
 * @param {Object} props.budgets
 * @param {number} props.cycleStart
 * @param {Function} props.setCycleStart
 * @param {Array} props.categories
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */
export default function ReportsPage({
  transactions,
  budgets,
  cycleStart,
  setCycleStart,
  categories,
  recurringItems = [],
}) {
  const getCat = (id) => getCatById(id, categories);

  // Build available periods from transactions
  const periodSet = new Set();
  transactions.forEach((t) => {
    if (t.date) periodSet.add(t.date.slice(0, 7));
  });
  // Also include current month
  const now = new Date();
  const currentMk = monthKey(now);
  periodSet.add(currentMk);

  const allPeriods = [...periodSet]
    .sort()
    .reverse()
    .map((mk) => {
      const [y, m] = mk.split('-').map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString('id-ID', {
        month: 'long',
        year: 'numeric',
      });
      return { value: mk, label };
    });

  const [period, setPeriod] = useState(allPeriods[0]?.value || currentMk);
  const [showCycleDlg, setShowCycleDlg] = useState(false);

  // Current period range
  const range = getPeriodRange(period, cycleStart);

  // Previous period
  const [py, pm] = period.split('-').map(Number);
  const prevMonth = pm === 1 ? 12 : pm - 1;
  const prevYear = pm === 1 ? py - 1 : py;
  const prevMk = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  const prevRange = getPeriodRange(prevMk, cycleStart);
  const prevLabel = new Date(prevYear, prevMonth - 1, 1).toLocaleDateString('id-ID', {
    month: 'long',
  });
  const prevLabelShort = new Date(prevYear, prevMonth - 1, 1).toLocaleDateString('id-ID', {
    month: 'short',
  });

  // Filter transactions
  const txs = filterByRange(transactions, range);
  const prevTxs = filterByRange(transactions, prevRange);

  // Cashflow totals
  const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = income - expense;
  const prevExp = prevTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const expDelta = prevExp > 0 ? ((expense - prevExp) / prevExp * 100).toFixed(1) : 0;

  // Category breakdown for pie chart
  const catBreakdown = {};
  txs.filter((t) => t.type === 'expense').forEach((t) => {
    catBreakdown[t.categoryId] = (catBreakdown[t.categoryId] || 0) + t.amount;
  });
  const topCats = Object.entries(catBreakdown)
    .map(([id, amt]) => ({ cat: getCat(id), amt }))
    .filter((x) => x.cat)
    .sort((a, b) => b.amt - a.amt);

  // Daily expenses
  const rangeDays = [];
  let cur = new Date(range.start + 'T00:00:00');
  const endD = new Date(range.end + 'T00:00:00');
  while (cur <= endD) {
    rangeDays.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86400000);
  }
  const dailyExp = rangeDays.map((ds) =>
    txs.filter((t) => t.date === ds && t.type === 'expense').reduce((s, t) => s + t.amount, 0),
  );
  const maxDaily = Math.max(...dailyExp, 1);

  // Budget performance
  const budget = budgets[period] || {
    sections: {
      needs: { total: 0, cats: [] },
      wants: { total: 0, cats: [] },
      savings: { total: 0, cats: [] },
    },
  };
  const catSpend = {};
  txs.filter((t) => t.type === 'expense').forEach((t) => {
    catSpend[t.categoryId] = (catSpend[t.categoryId] || 0) + t.amount;
  });
  const secSpend = { needs: 0, wants: 0, savings: 0 };
  txs.filter((t) => t.type === 'expense').forEach((t) => {
    const cat = getCat(t.categoryId);
    if (cat && secSpend[cat.section] !== undefined) {
      secSpend[cat.section] += t.amount;
    }
  });

  const topbarActions = usePageActions(
    <div className="toolbar">
      <button className="btnGhost" onClick={() => setShowCycleDlg(true)}>
        <NavIcon name="calendar" size={15} /> Siklus: tgl {cycleStart}
      </button>
      <Select aria-label="Periode laporan" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 'auto' }}>
        {allPeriods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </Select>
    </div>,
  );

  // See BudgetPage: `display: contents` keeps `.container`'s flex `gap` working.
  return (
    <div className="pageStack">
      {topbarActions}
      {/* Page header */}
      <div className="largeTitleBlock">
        <div>
          <h1 className="largeTitle">Laporan</h1>
          <p className="reportPeriodLabel">{range.label}</p>
        </div>
      </div>

      {/* Cashflow summary */}
      <div className="grid3">
        <CashCard label="Total Pemasukan" value={income} color="var(--green-ink)" icon="income" />
        <CashCard
          label="Total Pengeluaran"
          value={expense}
          color="var(--red-ink)"
          icon="expense"
          sub={`${expDelta > 0 ? '+' : ''}${expDelta}% vs ${prevLabelShort}`}
          subColor={expDelta > 0 ? 'var(--red-ink)' : 'var(--green-ink)'}
        />
        <CashCard
          label="Net Cashflow"
          value={net}
          color={net >= 0 ? 'var(--blue)' : 'var(--red)'}
          icon={net >= 0 ? 'income' : 'expense'}
        />
      </div>

      {/* Charts row */}
      <div className="reportCharts">
        {/* Pie chart */}
        <div className="card">
          <h3 className="cardTitle contentTitle">Pengeluaran per Kategori</h3>
          {topCats.length === 0 ? (
            <div className="reportEmpty">Tidak ada data</div>
          ) : (
            <div>
              <div className="reportPie">
                <PieChart
                  slices={topCats.map((x) => ({
                    label: x.cat.name,
                    value: x.amt,
                    color: x.cat.color,
                  }))}
                  size={180}
                />
              </div>
              <div style={{ marginTop: 16 }}>
                {topCats.slice(0, 6).map((x) => (
                  <div key={x.cat.id} className="reportLegendRow">
                    <div className="reportLegendLeft">
                      <div className="reportLegendDot" style={{ background: x.cat.color }} />
                      <span className="reportLegendName">{x.cat.name}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className="reportLegendAmount">{fmtFull(x.amt)}</span>
                      <span className="reportLegendPct">
                        {expense > 0 ? Math.round((x.amt / expense) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Income vs Expense */}
        <div className="card">
          <h3 className="cardTitle contentTitle">Pemasukan vs Pengeluaran</h3>
          <CompareBarChart
            a={{ label: 'Pemasukan', value: income, color: 'var(--green-ink)' }}
            b={{ label: 'Pengeluaran', value: expense, color: 'var(--red-ink)' }}
            prev={{ label: prevLabelShort, value: prevExp, color: 'var(--text-6)' }}
          />
          <div style={{ marginTop: 20 }}>
            <div className="reportCompareLabel">
              Pengeluaran bulan ini vs {prevLabel}
            </div>
            <MonthCompareBar
              current={expense}
              prev={prevExp}
              curLabel="Bln Ini"
              prevLabel={prevLabelShort}
            />
          </div>
        </div>
      </div>

      {/* Daily chart */}
      <div className="card">
        <h3 className="cardTitle contentTitle">Pengeluaran Harian</h3>
        <DailyBarChart data={dailyExp} max={maxDaily} days={rangeDays} cycleStart={cycleStart} />
      </div>

      {/* Budget performance */}
      <div className="card">
        <div className="cardHead reportHead">
          <h3 className="cardTitle contentTitle" style={{ margin: 0 }}>
            Performa Anggaran
          </h3>
          <span className="reportSubtitle">per seksi &amp; kategori</span>
        </div>

        {['needs', 'wants', 'savings'].map((sec) => {
          const secData = budget.sections[sec] || { total: 0, cats: [] };
          const spent = secSpend[sec] || 0;
          const over = spent > secData.total;
          const pct = secData.total > 0 ? Math.round((spent / secData.total) * 100) : 0;

          return (
            <div key={sec} className="reportSectionBlock">
              {/* Section header */}
              <div
                className="reportSectionHead"
                style={{ background: `color-mix(in srgb, ${sectionColor(sec)} 7%, transparent)` }}
              >
                <div className="reportSectionLeft">
                  <div className="reportSectionDot" style={{ background: sectionColor(sec) }} />
                  <span className="reportSectionName">{sectionLabel(sec)}</span>
                  {over && (
                    <span className="reportOverflow">
                      <NavIcon name="warning" size={12} /> Melebihi!
                    </span>
                  )}
                </div>
                <div className="reportSectionRight">
                  <span style={{ fontWeight: 700, color: over ? 'var(--red-ink)' : 'var(--text-1)' }}>
                    {fmtFull(spent)}
                  </span>
                  <span className="reportMuted"> / </span>
                  <span className="reportMuted">{fmtFull(secData.total)}</span>
                  <span
                    style={{
                      marginLeft: 8,
                      fontWeight: 700,
                      color: over ? 'var(--red-ink)' : pct > 80 ? 'var(--orange-ink)' : 'var(--green-ink)',
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              </div>

              {/* Section progress bar */}
              <div className="reportSectionProgress">
                <ProgressBar
                  value={spent}
                  max={secData.total}
                  color={sectionColor(sec)}
                  height={6}
                  showOverflow
                />
              </div>

              {/* Per-category rows */}
              <div className="reportCategoryList">
                {secData.cats.map((c) => {
                  const cat = getCat(c.id);
                  const cSpent = catSpend[c.id] || 0;
                  const cOver = cSpent > c.amt;
                  const cPct = c.amt > 0 ? Math.round((cSpent / c.amt) * 100) : 0;
                  return (
                    <div key={c.id}>
                      <div className="reportCategoryRow">
                        <div className="reportCategoryLeft">
                          <div
                            className="reportCategoryDot"
                            style={{ background: cat?.color || 'var(--text-6)' }}
                          />
                          <span className="reportCategoryName">{cat?.name || c.id}</span>
                          {cOver && <span className="reportCategoryOver">OVER</span>}
                        </div>
                        <div className="reportCategoryRight">
                          <span className="reportCategoryAmounts">
                            <span
                              style={{
                                fontWeight: 600,
                                color: cOver ? 'var(--red-ink)' : 'var(--text-2)',
                              }}
                            >
                              {fmt(cSpent)}
                            </span>
                            <span className="reportMuted"> / </span>
                            {fmt(c.amt)}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: cOver ? 'var(--red-ink)' : cPct > 80 ? 'var(--orange-ink)' : 'var(--green-ink)',
                              minWidth: 32,
                              textAlign: 'right',
                            }}
                          >
                            {cPct}%
                          </span>
                        </div>
                      </div>
                      <ProgressBar
                        value={cSpent}
                        max={c.amt}
                        color={cat?.color || sectionColor(sec)}
                        height={5}
                        showOverflow
                      />
                    </div>
                  );
                })}
                {secData.cats.length === 0 && (
                  <div className="reportCategoryEmpty">Belum ada kategori</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Amortized Recurring Items Analysis */}
      {recurringItems.length > 0 && (
        <div className="card">
          <div className="cardHead reportHead">
            <h3 className="cardTitle contentTitle" style={{ margin: 0 }}>
              📦 Biaya Berkala (Amortized)
            </h3>
            <span className="reportSubtitle">biaya bulanan sebenarnya dari item berkala</span>
          </div>

          {/* Amortized summary by section */}
          <div className="grid3" style={{ margin: '16px 0' }}>
            {['needs', 'wants', 'savings'].map((sec) => {
              const amortizedSections = getAmortizedBySection(recurringItems, categories);
              const val = amortizedSections[sec] || 0;
              return (
                <div key={sec} style={{
                  padding: '12px 16px',
                  background: `color-mix(in srgb, ${sectionColor(sec)} 10%, transparent)`,
                  borderRadius: 10,
                  border: '1px solid var(--separator)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', marginBottom: 4 }}>
                    {sectionLabel(sec)}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: sec === 'needs' ? 'var(--blue-ink)' : sec === 'wants' ? 'var(--orange-ink)' : 'var(--green-ink)' }}>
                    {fmtFull(Math.round(val))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)' }}>/bulan</div>
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div style={{
            padding: '12px 16px',
            background: 'var(--bg-3)',
            borderRadius: 10,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--label)' }}>
              Total Biaya Berkala/Bulan
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--blue-ink)' }}>
              {fmtFull(Math.round(getTotalAmortizedCost(recurringItems)))}
            </span>
          </div>

          {/* Per-category breakdown */}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', marginBottom: 8 }}>
            Breakdown per Kategori
          </div>
          {getAmortizedByCategory(recurringItems, categories).map((item) => (
            <div key={item.categoryId} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '1px solid var(--border-2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{item.categoryName}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                {fmtFull(Math.round(item.monthlyCost))}/bln
              </span>
            </div>
          ))}

          {/* Comparison with actual spending */}
          <div style={{
            marginTop: 16,
            padding: '12px 16px',
            background: 'var(--blue-soft)',
            borderRadius: 10,
            border: '1px solid rgba(79, 110, 247, 0.2)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
              💡 Perbandingan
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
              Pengeluaran aktual bulan ini: <strong>{fmtFull(expense)}</strong>
              <br />
              Biaya berkala (amortized): <strong>{fmtFull(Math.round(getTotalAmortizedCost(recurringItems)))}</strong>
              <br />
              True monthly cost (aktual + amortized berkala yang belum dibeli bulan ini):{' '}
              <strong>{fmtFull(Math.round(expense + getTotalAmortizedCost(recurringItems) -
                recurringItems.filter(i => i.isActive && i.lastPurchaseDate && i.lastPurchaseDate.startsWith(period)).reduce((s, i) => s + i.amount, 0)
              ))}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Cycle setting modal */}
      {showCycleDlg && (
        <CycleSettingModal
          current={cycleStart}
          onClose={() => setShowCycleDlg(false)}
          onSave={(v) => {
            setCycleStart(v);
            setShowCycleDlg(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * CashCard — Summary card for cashflow metrics.
 */
function CashCard({ label, value, color, icon, sub, subColor }) {
  return (
    <div className="statCard">
      <div className="reportCashHead">
        <span className="statLabel">{label}</span>
        <span className="reportCashIcon" style={{ color }}>
          <NavIcon name={icon} size={18} />
        </span>
      </div>
      <div className="statValue num" style={{ color }}>
        {fmtFull(value)}
      </div>
      {sub && (
        <div className="statDetail reportDelta" style={{ color: subColor || 'var(--text-4)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}
