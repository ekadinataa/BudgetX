import { useState, useMemo } from 'react';
import NavIcon from '../../components/icons/NavIcon';
import ProgressBar from '../../components/ui/ProgressBar';
import Select from '../../components/ui/Select';
import IncomeModal from './IncomeModal';
import SectionEditModal from './SectionEditModal';
import PeriodModal from './PeriodModal';
import PeriodTransitionModal from './PeriodTransitionModal';
import { sectionLabel, sectionColor, getPeriodRange, filterByRange, getCustomRangeKey, findActiveRange, deepCloneBudget } from '../../utils/helpers';
import { fmtFull, fmt, monthKey } from '../../utils/formatters';
import { getTotalAmortizedCost, getAmortizedBySection } from '../../utils/recurring';
import { TODAY } from '../../data/defaults';
import styles from './BudgetPage.module.css';

const EMPTY_SECTION = { total: 0, cats: [] };
const EMPTY_BUDGET = {
  totalIncome: 0,
  sections: { needs: EMPTY_SECTION, wants: EMPTY_SECTION, savings: EMPTY_SECTION },
};

/**
 * Format a YYYY-MM-DD date string to Indonesian locale (e.g. "23 Mei 2026").
 */
function formatDateID(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * BudgetPage — Monthly income allocation using the 50/30/20 rule.
 *
 * Supports three period modes:
 * - "Per Bulan" (standard calendar month)
 * - "Custom Siklus" (billing cycle based on salary date, e.g. 23–22)
 * - "Custom Rentang" (user-defined start and end dates)
 */
export default function BudgetPage({
  budgets,
  setBudgets,
  transactions,
  categories,
  setCategories,
  cycleStart,
  setCycleStart,
  salaryAdjust,
  setSalaryAdjust,
  periodMode,
  setPeriodMode,
  customRanges,
  setCustomRanges,
  onCreateCategory,
  onUpdateCategory,
  recurringItems = [],
}) {
  const getCat = (id) => categories.find((c) => c.id === id);
  const currentMk = monthKey(new Date(TODAY));

  // Internal state for month/cycle navigation
  const [selectedMk, setSelectedMk] = useState(currentMk);
  const [editSection, setEditSection] = useState(null);
  const [showIncome, setShowIncome] = useState(false);
  const [showPeriodModal, setShowPeriodModal] = useState(false);

  // Range mode internal state. `rangeOverride` only holds an explicit user pick;
  // when it is empty the active range is derived instead of stored, so no effect
  // (and no cascading render) is needed to pick the default.
  const [rangeOverride, setRangeOverride] = useState(null);
  const [showTransition, setShowTransition] = useState(false);

  const selectedRangeId = useMemo(() => {
    if (periodMode !== 'range') return rangeOverride;
    if (rangeOverride && customRanges.some((r) => r.id === rangeOverride)) {
      return rangeOverride;
    }
    return findActiveRange(customRanges, TODAY)?.id ?? null;
  }, [periodMode, rangeOverride, customRanges]);

  // Build available month options from budgets + transactions (for month/cycle modes)
  const monthOptions = useMemo(() => {
    const monthSet = new Set([currentMk]);
    Object.keys(budgets).forEach((k) => {
      // Only include YYYY-MM keys, not range keys
      if (/^\d{4}-\d{2}$/.test(k)) monthSet.add(k);
    });
    transactions.forEach((t) => { if (t.date) monthSet.add(t.date.slice(0, 7)); });
    return [...monthSet].sort().reverse().map((mk) => {
      const [y, m] = mk.split('-').map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      return { value: mk, label };
    });
  }, [budgets, transactions, currentMk]);

  // Build range options sorted by start date descending
  const rangeOptions = useMemo(() => {
    return [...customRanges]
      .sort((a, b) => b.start.localeCompare(a.start))
      .map((r) => ({
        value: r.id,
        label: `${formatDateID(r.start)} – ${formatDateID(r.end)}`,
        range: r,
      }));
  }, [customRanges]);

  // Get the currently selected range object
  const selectedRange = useMemo(() => {
    if (periodMode !== 'range') return null;
    return customRanges.find((r) => r.id === selectedRangeId) || null;
  }, [periodMode, customRanges, selectedRangeId]);

  // Compute the active date range based on period mode
  const periodRange = useMemo(() => {
    if (periodMode === 'range' && selectedRange) {
      const label = `${formatDateID(selectedRange.start)} – ${formatDateID(selectedRange.end)}`;
      return {
        start: selectedRange.start,
        end: selectedRange.end,
        label,
      };
    }
    if (periodMode === 'cycle' && cycleStart > 1) {
      return getPeriodRange(selectedMk, cycleStart, salaryAdjust);
    }
    // Standard month
    const [y, m] = selectedMk.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const label = new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    return {
      start: `${selectedMk}-01`,
      end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      label,
    };
  }, [selectedMk, periodMode, cycleStart, salaryAdjust, selectedRange]);

  // Determine the budget key based on mode
  const budgetKey = useMemo(() => {
    if (periodMode === 'range' && selectedRange) {
      return getCustomRangeKey(selectedRange.start, selectedRange.end);
    }
    return selectedMk;
  }, [periodMode, selectedRange, selectedMk]);

  const budget = budgets[budgetKey] || EMPTY_BUDGET;

  // Compute totals
  const totalAllocated = Object.values(budget.sections).reduce((s, sec) => s + sec.total, 0);
  const unallocated = budget.totalIncome - totalAllocated;

  // Filter transactions by the active period range
  const periodTxs = useMemo(
    () => filterByRange(transactions, periodRange).filter((t) => t.type === 'expense'),
    [transactions, periodRange],
  );

  const catSpend = {};
  periodTxs.forEach((t) => {
    catSpend[t.categoryId] = (catSpend[t.categoryId] || 0) + t.amount;
  });
  const secSpend = { needs: 0, wants: 0, savings: 0 };
  periodTxs.forEach((t) => {
    const cat = getCat(t.categoryId);
    if (cat && secSpend[cat.section] !== undefined) {
      secSpend[cat.section] += t.amount;
    }
  });
  const totalSpent = Object.values(secSpend).reduce((s, v) => s + v, 0);

  // Check if the active range period has ended (for transition prompt)
  const periodEnded = periodMode === 'range' && selectedRange && TODAY > selectedRange.end;

  const handleSaveIncome = (income) => {
    setBudgets((b) => ({
      ...b,
      [budgetKey]: { ...budget, totalIncome: parseFloat(income) || 0 },
    }));
    setShowIncome(false);
  };

  const handleSaveSection = (section, data) => {
    setBudgets((b) => ({
      ...b,
      [budgetKey]: {
        ...budget,
        sections: { ...budget.sections, [section]: data },
      },
    }));
    setEditSection(null);
  };

  const handleSavePeriod = (mode, cs, sa, rangeStart, rangeEnd) => {
    if (mode === 'range' && rangeStart && rangeEnd) {
      // Create a new range definition
      const newRangeId = getCustomRangeKey(rangeStart, rangeEnd);
      const newRange = { id: newRangeId, start: rangeStart, end: rangeEnd };
      // Add range if it doesn't already exist, then set mode — use direct state setters
      // to avoid stale closure issues, and persist both together
      const exists = customRanges.some((r) => r.id === newRangeId);
      const updatedRanges = exists ? customRanges : [...customRanges, newRange];
      setCustomRanges(updatedRanges);
      setPeriodMode('range');
      setRangeOverride(newRangeId);
    } else if (mode === 'cycle') {
      setPeriodMode('cycle');
      setCycleStart(cs);
      setSalaryAdjust(sa);
    } else {
      setPeriodMode('month');
      setCycleStart(1);
      setSalaryAdjust(false);
    }
    setShowPeriodModal(false);
  };

  // Handle creating a new period from the transition modal
  const handleCreatePeriod = (newStart, newEnd, copyBudget) => {
    const newRangeId = getCustomRangeKey(newStart, newEnd);
    const newRange = { id: newRangeId, start: newStart, end: newEnd };

    // Add the new range
    setCustomRanges((prev) => [...prev, newRange]);

    // Optionally copy budget from the previous period
    if (copyBudget && selectedRange) {
      const prevKey = getCustomRangeKey(selectedRange.start, selectedRange.end);
      const prevBudget = budgets[prevKey];
      if (prevBudget) {
        const cloned = deepCloneBudget(prevBudget);
        setBudgets((b) => ({ ...b, [newRangeId]: cloned }));
      }
    }

    // Select the new range
    setRangeOverride(newRangeId);
    setShowTransition(false);
  };

  // Period display label
  const periodLabel = useMemo(() => {
    if (periodMode === 'range' && selectedRange) {
      return `${formatDateID(selectedRange.start)} – ${formatDateID(selectedRange.end)}`;
    }
    if (periodMode === 'cycle' && cycleStart > 1) {
      return `Siklus tgl ${cycleStart}: ${periodRange.label}`;
    }
    return periodRange.label;
  }, [periodMode, selectedRange, cycleStart, periodRange]);

  // Period button label
  const periodButtonLabel = useMemo(() => {
    if (periodMode === 'range') return 'Custom Rentang';
    if (periodMode === 'cycle' && cycleStart > 1) return `Siklus tgl ${cycleStart}`;
    return 'Per Bulan';
  }, [periodMode, cycleStart]);

  const showSalaryBadge = periodMode === 'cycle' && cycleStart > 1 && salaryAdjust;

  return (
    <div>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Budget</h1>
          <p className={styles.pageSubtitle}>
            Kelola alokasi anggaran Anda
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnGhost} onClick={() => setShowPeriodModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            {periodButtonLabel}
          </button>
          {periodMode === 'range' ? (
            <Select
              value={selectedRangeId || ''}
              onChange={(e) => setRangeOverride(e.target.value)}
              style={{ width: 'auto' }}
            >
              {rangeOptions.length === 0 && (
                <option value="">Belum ada periode</option>
              )}
              {rangeOptions.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          ) : (
            <Select
              value={selectedMk}
              onChange={(e) => setSelectedMk(e.target.value)}
              style={{ width: 'auto' }}
            >
              {monthOptions.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          )}
          <button className={styles.btnGhost} onClick={() => setShowIncome(true)}>
            <NavIcon name="edit" size={15} /> Atur Pemasukan
          </button>
        </div>
      </div>

      {/* Period-ended transition prompt */}
      {periodEnded && (
        <div className={styles.periodEndedBanner}>
          <div className={styles.periodEndedContent}>
            <span className={styles.periodEndedIcon}>⚠️</span>
            <div className={styles.periodEndedText}>
              <div className={styles.periodEndedTitle}>Periode telah berakhir</div>
              <div className={styles.periodEndedDesc}>
                Periode {formatDateID(selectedRange.start)} – {formatDateID(selectedRange.end)} telah berakhir. Buat periode baru untuk melanjutkan pencatatan.
              </div>
            </div>
          </div>
          <button className={styles.periodEndedBtn} onClick={() => setShowTransition(true)}>
            Buat Periode Baru
          </button>
        </div>
      )}

      {/* Period info bar */}
      <div className={styles.periodBar}>
        <span className={styles.periodBarLabel}>Periode aktif:</span>
        <span className={styles.periodBarValue}>{periodLabel}</span>
        {showSalaryBadge && (
          <span className={styles.salaryAdjustBadge}>📅 Disesuaikan</span>
        )}
        {periodMode !== 'range' && (
          <span className={styles.periodBarRange}>
            ({periodRange.start} s/d {periodRange.end})
          </span>
        )}
      </div>

      {/* Overview Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Pemasukan</div>
          <div className={styles.statValue} style={{ color: '#4F6EF7' }}>
            {fmtFull(budget.totalIncome)}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Dialokasikan</div>
          <div className={styles.statValue} style={{ color: '#F59E0B' }}>
            {fmtFull(totalAllocated)}
          </div>
          <div className={styles.statSub}>
            {budget.totalIncome > 0 ? Math.round((totalAllocated / budget.totalIncome) * 100) : 0}% dari pemasukan
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Belum Dialokasikan</div>
          <div className={styles.statValue} style={{ color: unallocated < 0 ? '#EF4444' : '#22C55E' }}>
            {fmtFull(unallocated)}
          </div>
          <div className={styles.statSub}>
            {unallocated < 0 ? '⚠ Alokasi melebihi pemasukan' : 'Masih tersedia'}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Terpakai</div>
          <div className={styles.statValue} style={{ color: '#EF4444' }}>
            {fmtFull(totalSpent)}
          </div>
          <div className={styles.statSub}>
            {totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0}% dari alokasi
          </div>
        </div>
      </div>

      {/* Distribution Visualization Bar */}
      <div className={styles.distCard}>
        <div className={styles.distHeader}>
          <span className={styles.distTitle}>Distribusi Alokasi</span>
          <span className={styles.distGuide}>Panduan 50/30/20</span>
        </div>
        <div className={styles.distBar}>
          {['needs', 'wants', 'savings'].map((sec) => {
            const pct = budget.totalIncome > 0
              ? ((budget.sections[sec]?.total || 0) / budget.totalIncome) * 100
              : 0;
            return (
              <div key={sec} className={styles.distSegment} style={{ width: `${pct}%`, background: sectionColor(sec) }} />
            );
          })}
          {unallocated > 0 && <div className={styles.distUnalloc} />}
        </div>
        <div className={styles.distLegend}>
          {['needs', 'wants', 'savings'].map((sec) => {
            const pct = budget.totalIncome > 0
              ? Math.round(((budget.sections[sec]?.total || 0) / budget.totalIncome) * 100)
              : 0;
            const guide = sec === 'needs' ? 50 : sec === 'wants' ? 30 : 20;
            return (
              <div key={sec} className={styles.distLegendItem}>
                <div className={styles.distDot} style={{ background: sectionColor(sec) }} />
                <span className={styles.distLegendLabel}>{sectionLabel(sec)}</span>
                <span className={styles.distLegendPct} style={{ color: Math.abs(pct - guide) > 10 ? '#F59E0B' : 'var(--text-1)' }}>
                  {pct}%
                </span>
                <span className={styles.distLegendGuide}>(panduan {guide}%)</span>
              </div>
            );
          })}
          {unallocated > 0 && (
            <div className={styles.distLegendItem}>
              <div className={styles.distDot} style={{ background: 'var(--border)' }} />
              <span className={styles.distLegendLabel} style={{ color: 'var(--text-5)' }}>Belum dialokasikan</span>
              <span className={styles.distLegendPct} style={{ color: 'var(--text-5)' }}>
                {budget.totalIncome > 0 ? Math.round((unallocated / budget.totalIncome) * 100) : 0}%
              </span>
              <span className={styles.distLegendGuide}>({fmtFull(unallocated)})</span>
            </div>
          )}
        </div>
      </div>

      {/* Per-Section Budget Cards */}
      {['needs', 'wants', 'savings'].map((sec) => {
        const secData = budget.sections[sec] || EMPTY_SECTION;
        const spent = secSpend[sec] || 0;
        const over = spent > secData.total;
        const allocatedInSec = secData.cats.reduce((s, c) => s + c.amt, 0);
        const unallocInSec = secData.total - allocatedInSec;

        return (
          <div key={sec} className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionHeaderLeft}>
                <div className={styles.sectionDot} style={{ background: sectionColor(sec) }} />
                <span className={styles.sectionName}>{sectionLabel(sec)}</span>
                {over && (
                  <span className={styles.sectionOverflowBadge}>
                    <NavIcon name="warning" size={11} /> Melebihi Batas
                  </span>
                )}
              </div>
              <div className={styles.sectionHeaderRight}>
                <div className={styles.sectionAmounts}>
                  <div className={styles.sectionSpent} style={{ color: over ? '#EF4444' : 'var(--text-1)' }}>
                    {fmtFull(spent)} <span className={styles.sectionSep}>/</span> {fmtFull(secData.total)}
                  </div>
                  <div className={styles.sectionRemaining}>
                    Sisa {fmtFull(Math.max(0, secData.total - spent))}
                  </div>
                </div>
                <button className={styles.sectionEditBtn} onClick={() => setEditSection(sec)}>
                  <NavIcon name="edit" size={13} /> Edit
                </button>
              </div>
            </div>

            <ProgressBar value={spent} max={secData.total} color={sectionColor(sec)} height={8} showOverflow />

            <div className={styles.catGrid}>
              {secData.cats.map((c) => {
                const cat = getCat(c.id);
                const cSpent = catSpend[c.id] || 0;
                const cOver = cSpent > c.amt;
                const cPct = c.amt > 0 ? Math.min((cSpent / c.amt) * 100, 100) : 0;
                return (
                  <div key={c.id} className={styles.catCard}>
                    <div className={styles.catCardHeader}>
                      <div className={styles.catCardLeft}>
                        <div className={styles.catDot} style={{ background: cat?.color || 'var(--text-6)' }} />
                        <span className={styles.catName}>{cat?.name || c.id}</span>
                      </div>
                      {cOver && <span className={styles.catOver}>OVER</span>}
                    </div>
                    <ProgressBar value={cSpent} max={c.amt} color={cat?.color || sectionColor(sec)} height={5} showOverflow />
                    <div className={styles.catFooter}>
                      <span className={styles.catAmounts}>{fmt(cSpent)} / {fmt(c.amt)}</span>
                      <span className={styles.catPct} style={{ color: cOver ? '#EF4444' : 'var(--text-4)' }}>
                        {Math.round(cPct)}%
                      </span>
                    </div>
                  </div>
                );
              })}
              {unallocInSec > 0 && (
                <div className={styles.unallocCard}>
                  <div className={styles.unallocLabel}>Belum Dialokasikan</div>
                  <div className={styles.unallocValue}>{fmtFull(unallocInSec)}</div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Recurring Items Amortized Cost Card */}
      {recurringItems.length > 0 && (
        <div className={styles.sectionCard} style={{ marginTop: 20 }}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLeft}>
              <span style={{ fontSize: 16 }}>📦</span>
              <span className={styles.sectionName}>Biaya Berkala (Amortized)</span>
            </div>
          </div>
          <div style={{ padding: '12px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
              {['needs', 'wants', 'savings'].map((sec) => {
                const amortized = getAmortizedBySection(recurringItems, categories);
                const val = amortized[sec] || 0;
                return (
                  <div key={sec} style={{
                    padding: '10px 12px',
                    background: sectionColor(sec) + '10',
                    borderRadius: 8,
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 600 }}>
                      {sectionLabel(sec)}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: sectionColor(sec), marginTop: 4 }}>
                      {fmtFull(Math.round(val))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              background: 'var(--bg-3)',
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>
                Total biaya berkala/bulan
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#4F6EF7' }}>
                {fmtFull(Math.round(getTotalAmortizedCost(recurringItems)))}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 8, lineHeight: 1.5 }}>
              💡 Ini adalah biaya bulanan dari item yang dibeli berkala (skincare, shampo, dll) yang diamortisasi berdasarkan durasi pemakaian.
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showIncome && (
        <IncomeModal
          current={budget.totalIncome}
          onClose={() => setShowIncome(false)}
          onSave={handleSaveIncome}
        />
      )}
      {editSection && (
        <SectionEditModal
          section={editSection}
          data={budget.sections[editSection]}
          onClose={() => setEditSection(null)}
          onSave={(data) => handleSaveSection(editSection, data)}
          categories={categories}
          setCategories={setCategories}
          onCreateCategory={onCreateCategory}
          onUpdateCategory={onUpdateCategory}
        />
      )}
      {showPeriodModal && (
        <PeriodModal
          currentMode={periodMode}
          currentCycleStart={cycleStart}
          currentSalaryAdjust={salaryAdjust}
          onClose={() => setShowPeriodModal(false)}
          onSave={handleSavePeriod}
        />
      )}
      {showTransition && selectedRange && (
        <PeriodTransitionModal
          previousPeriod={selectedRange}
          onClose={() => setShowTransition(false)}
          onCreatePeriod={handleCreatePeriod}
        />
      )}
    </div>
  );
}
