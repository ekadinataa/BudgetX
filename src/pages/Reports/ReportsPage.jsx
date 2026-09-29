import { useState } from 'react';
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
import styles from './ReportsPage.module.css';

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

  return (
    <div>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Laporan</h1>
          <p className={styles.periodLabel}>{range.label}</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.cycleBtn} onClick={() => setShowCycleDlg(true)}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            Siklus: tgl {cycleStart}
          </button>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 'auto' }}>
            {allPeriods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Cashflow summary */}
      <div className={styles.cashGrid}>
        <CashCard label="Total Pemasukan" value={income} color="#22C55E" icon="income" />
        <CashCard
          label="Total Pengeluaran"
          value={expense}
          color="#EF4444"
          icon="expense"
          sub={`${expDelta > 0 ? '+' : ''}${expDelta}% vs ${prevLabelShort}`}
          subColor={expDelta > 0 ? '#EF4444' : '#22C55E'}
        />
        <CashCard
          label="Net Cashflow"
          value={net}
          color={net >= 0 ? '#4F6EF7' : '#EF4444'}
          icon={net >= 0 ? 'income' : 'expense'}
        />
      </div>

      {/* Charts row */}
      <div className={styles.chartsGrid}>
        {/* Pie chart */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Pengeluaran per Kategori</h3>
          {topCats.length === 0 ? (
            <div className={styles.emptyState}>Tidak ada data</div>
          ) : (
            <div>
              <div className={styles.pieChartWrap}>
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
                  <div key={x.cat.id} className={styles.legendRow}>
                    <div className={styles.legendLeft}>
                      <div className={styles.legendDot} style={{ background: x.cat.color }} />
                      <span className={styles.legendName}>{x.cat.name}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className={styles.legendAmount}>{fmtFull(x.amt)}</span>
                      <span className={styles.legendPct}>
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
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Pemasukan vs Pengeluaran</h3>
          <CompareBarChart
            a={{ label: 'Pemasukan', value: income, color: '#22C55E' }}
            b={{ label: 'Pengeluaran', value: expense, color: '#EF4444' }}
            prev={{ label: prevLabelShort, value: prevExp, color: 'var(--text-6)' }}
          />
          <div style={{ marginTop: 20 }}>
            <div className={styles.compareLabel}>
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
      <div className={`${styles.card} ${styles.dailyCard}`}>
        <h3 className={styles.cardTitle}>Pengeluaran Harian</h3>
        <DailyBarChart data={dailyExp} max={maxDaily} days={rangeDays} cycleStart={cycleStart} />
      </div>

      {/* Budget performance */}
      <div className={styles.card}>
        <div className={styles.perfHeader}>
          <h3 className={styles.cardTitle} style={{ margin: 0 }}>
            Performa Anggaran
          </h3>
          <span className={styles.perfSubtitle}>per seksi &amp; kategori</span>
        </div>

        {['needs', 'wants', 'savings'].map((sec) => {
          const secData = budget.sections[sec] || { total: 0, cats: [] };
          const spent = secSpend[sec] || 0;
          const over = spent > secData.total;
          const pct = secData.total > 0 ? Math.round((spent / secData.total) * 100) : 0;

          return (
            <div key={sec} className={styles.sectionBlock}>
              {/* Section header */}
              <div
                className={styles.sectionHeader}
                style={{ background: sectionColor(sec) + '12' }}
              >
                <div className={styles.sectionLeft}>
                  <div className={styles.sectionDot} style={{ background: sectionColor(sec) }} />
                  <span className={styles.sectionName}>{sectionLabel(sec)}</span>
                  {over && (
                    <span className={styles.sectionOverflow}>
                      <NavIcon name="warning" size={12} /> Melebihi!
                    </span>
                  )}
                </div>
                <div className={styles.sectionRight}>
                  <span style={{ fontWeight: 700, color: over ? '#EF4444' : 'var(--text-1)' }}>
                    {fmtFull(spent)}
                  </span>
                  <span className={styles.sectionSep}> / </span>
                  <span className={styles.sectionAllocated}>{fmtFull(secData.total)}</span>
                  <span
                    style={{
                      marginLeft: 8,
                      fontWeight: 700,
                      color: over ? '#EF4444' : pct > 80 ? '#F59E0B' : '#22C55E',
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              </div>

              {/* Section progress bar */}
              <div className={styles.sectionProgressWrap}>
                <ProgressBar
                  value={spent}
                  max={secData.total}
                  color={sectionColor(sec)}
                  height={6}
                  showOverflow
                />
              </div>

              {/* Per-category rows */}
              <div className={styles.catList}>
                {secData.cats.map((c) => {
                  const cat = getCat(c.id);
                  const cSpent = catSpend[c.id] || 0;
                  const cOver = cSpent > c.amt;
                  const cPct = c.amt > 0 ? Math.round((cSpent / c.amt) * 100) : 0;
                  return (
                    <div key={c.id}>
                      <div className={styles.catRow}>
                        <div className={styles.catLeft}>
                          <div
                            className={styles.catDot}
                            style={{ background: cat?.color || 'var(--text-6)' }}
                          />
                          <span className={styles.catName}>{cat?.name || c.id}</span>
                          {cOver && <span className={styles.catOverBadge}>OVER</span>}
                        </div>
                        <div className={styles.catRight}>
                          <span className={styles.catAmounts}>
                            <span
                              style={{
                                fontWeight: 600,
                                color: cOver ? '#EF4444' : 'var(--text-2)',
                              }}
                            >
                              {fmt(cSpent)}
                            </span>
                            <span className={styles.catSep}> / </span>
                            {fmt(c.amt)}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: cOver ? '#EF4444' : cPct > 80 ? '#F59E0B' : '#22C55E',
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
                  <div className={styles.catEmpty}>Belum ada kategori</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Amortized Recurring Items Analysis */}
      {recurringItems.length > 0 && (
        <div className={styles.card} style={{ marginTop: 24 }}>
          <div className={styles.perfHeader}>
            <h3 className={styles.cardTitle} style={{ margin: 0 }}>
              📦 Biaya Berkala (Amortized)
            </h3>
            <span className={styles.perfSubtitle}>biaya bulanan sebenarnya dari item berkala</span>
          </div>

          {/* Amortized summary by section */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '16px 0' }}>
            {['needs', 'wants', 'savings'].map((sec) => {
              const amortizedSections = getAmortizedBySection(recurringItems, categories);
              const val = amortizedSections[sec] || 0;
              return (
                <div key={sec} style={{
                  padding: '12px 16px',
                  background: sectionColor(sec) + '10',
                  borderRadius: 10,
                  border: `1px solid ${sectionColor(sec)}30`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', marginBottom: 4 }}>
                    {sectionLabel(sec)}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: sectionColor(sec) }}>
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
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
              Total Biaya Berkala/Bulan
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#4F6EF7' }}>
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
            background: 'rgba(79, 110, 247, 0.08)',
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
    <div className={styles.cashCard}>
      <div className={styles.cashCardHeader}>
        <span className={styles.cashCardLabel}>{label}</span>
        <span className={styles.cashCardIcon} style={{ color }}>
          <NavIcon name={icon} size={18} />
        </span>
      </div>
      <div className={styles.cashCardValue} style={{ color }}>
        {fmtFull(value)}
      </div>
      {sub && (
        <div className={styles.cashCardSub} style={{ color: subColor || 'var(--text-4)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}
