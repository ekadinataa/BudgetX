import { useState, useMemo } from 'react';
import NavIcon from '../../components/icons/NavIcon';
import ProgressBar from '../../components/ui/ProgressBar';
import Select from '../../components/ui/Select';
import IncomeModal from './IncomeModal';
import { usePageActions } from '../../context/pageActions';
import SectionEditModal from './SectionEditModal';
import PeriodModal from './PeriodModal';
import PeriodTransitionModal from './PeriodTransitionModal';
import { sectionLabel, sectionColor, getPeriodRange, filterByRange, getCustomRangeKey, findActiveRange, deepCloneBudget } from '../../utils/helpers';
import { fmtFull, fmt, monthKey } from '../../utils/formatters';
import { getTotalAmortizedCost, getAmortizedBySection } from '../../utils/recurring';
import { TODAY } from '../../data/defaults';

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

  // Header actions live in the sticky topbar (reference `pageHeader(…, actions)`).
  const topbarActions = usePageActions(
    <>
      <div className="toolbar budgetToolbar">
          <button className="btnSmallGhost" onClick={() => setShowPeriodModal(true)}>
            <NavIcon name="calendar" size={15} />
            {periodButtonLabel}
          </button>
          {periodMode === 'range' ? (
            <Select
              value={selectedRangeId || ''}
              onChange={(e) => setRangeOverride(e.target.value)}
              aria-label="Periode budget"
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
              aria-label="Periode budget"
              style={{ width: 'auto' }}
            >
              {monthOptions.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          )}
          <button className="btnSmallGhost incomeAction" aria-label="Atur Pemasukan" title="Atur Pemasukan" onClick={() => setShowIncome(true)}>
            <NavIcon name="edit" size={15} /> <span className="controlLabel">Atur Pemasukan</span>
          </button>
      </div>
    </>
  );

  // `display: contents` so this wrapper does not become a single flex child of
  // `.container`. As a plain `<div>` it absorbed the container's `gap` for the
  // whole page, leaving every card below it flush against its neighbour — which
  // is why the spacing read as cramped rather than merely tight. `{topbarActions}`
  // is a portal and renders null, so nothing else depends on this element.
  return (
    <div className="pageStack">
      {topbarActions}

      {/* Page Header */}
      <div className="largeTitleBlock">
        <div>
          <h1 className="largeTitle">Budget</h1>
          <p className="pageSubtitle">
            Kelola alokasi anggaran Anda
          </p>
        </div>
      </div>

      {/* Period-ended transition prompt */}
      {/* Reference `banner`: a tinted notice row. The inner content/text
          wrappers the module needed are gone; the button sits beside it. */}
      {periodEnded && (
        <div className="bannerRow">
          <div className="banner">
            <NavIcon name="warning" size={16} />
            <div className="bannerBody">
              <div className="bannerTitle">Periode telah berakhir</div>
              <div className="cardSub">
                Periode {formatDateID(selectedRange.start)} –{' '}
                {formatDateID(selectedRange.end)} telah berakhir. Buat periode baru
                untuk melanjutkan pencatatan.
              </div>
            </div>
          </div>
          <button className="btnSmallPrimary" onClick={() => setShowTransition(true)}>
            Buat Periode Baru
          </button>
        </div>
      )}

      {/* Period info bar */}
      <div className="periodBar">
        <span className="periodLabel">Periode aktif:</span>
        <span className="periodValue">{periodLabel}</span>
        {showSalaryBadge && (
          <span className="badge">📅 Disesuaikan</span>
        )}
        {periodMode !== 'range' && (
          <span className="cardSub">
            ({periodRange.start} s/d {periodRange.end})
          </span>
        )}
      </div>

      {/* Overview Stats — 4 cards, so this needs the 4-up grid. `grid3` put the
          fourth card alone on row 2 and left the block visibly lopsided. */}
      <div className="statGrid">
        <div className="statCard">
          <div className="statLabel">Total Pemasukan</div>
          <div className="statValue" style={{ color: 'var(--blue-ink)' }}>
            {fmtFull(budget.totalIncome)}
          </div>
        </div>
        <div className="statCard">
          <div className="statLabel">Total Dialokasikan</div>
          <div className="statValue" style={{ color: 'var(--orange-ink)' }}>
            {fmtFull(totalAllocated)}
          </div>
          <div className="statDetail">
            {budget.totalIncome > 0 ? Math.round((totalAllocated / budget.totalIncome) * 100) : 0}% dari pemasukan
          </div>
        </div>
        <div className="statCard">
          <div className="statLabel">Belum Dialokasikan</div>
          <div className="statValue" style={{ color: unallocated < 0 ? 'var(--red-ink)' : 'var(--green-ink)' }}>
            {fmtFull(unallocated)}
          </div>
          <div className="statDetail">
            {unallocated < 0 ? '⚠ Alokasi melebihi pemasukan' : 'Masih tersedia'}
          </div>
        </div>
        <div className="statCard">
          <div className="statLabel">Total Terpakai</div>
          <div className="statValue" style={{ color: 'var(--red-ink)' }}>
            {fmtFull(totalSpent)}
          </div>
          <div className="statDetail">
            {totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0}% dari alokasi
          </div>
        </div>
      </div>

      {/* Distribution Visualization Bar */}
      <div className="card">
        <div className="cardHead">
          <span className="sectionTitle">Distribusi Alokasi</span>
          <span className="legendGuide">Panduan 50/30/20</span>
        </div>
        <div className="distBar">
          {['needs', 'wants', 'savings'].map((sec) => {
            const pct = budget.totalIncome > 0
              ? ((budget.sections[sec]?.total || 0) / budget.totalIncome) * 100
              : 0;
            return (
              <div key={sec} className="distSegment" style={{ width: `${pct}%`, background: sectionColor(sec) }} />
            );
          })}
          {unallocated > 0 && <div className="distUnalloc" />}
        </div>
        <div className="legend budgetDistLegend">
          {['needs', 'wants', 'savings'].map((sec) => {
            const pct = budget.totalIncome > 0
              ? Math.round(((budget.sections[sec]?.total || 0) / budget.totalIncome) * 100)
              : 0;
            const guide = sec === 'needs' ? 50 : sec === 'wants' ? 30 : 20;
            return (
              <div key={sec} className="legendRow">
                <div className="dot" style={{ background: sectionColor(sec) }} />
                <span className="legendName">{sectionLabel(sec)}</span>
                <span className="legendGuide">(panduan {guide}%)</span>
                <span className="legendPct" style={{ color: Math.abs(pct - guide) > 10 ? 'var(--orange-ink)' : 'var(--label)' }}>
                  {pct}%
                </span>
              </div>
            );
          })}
          {unallocated > 0 && (
            <div className="legendRow">
              <div className="dot" style={{ background: 'var(--separator)' }} />
              <span className="legendName">Belum dialokasikan</span>
              <span className="legendGuide">({fmtFull(unallocated)})</span>
              <span className="legendPct">
                {budget.totalIncome > 0 ? Math.round((unallocated / budget.totalIncome) * 100) : 0}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Per-Section Budget Cards */}
      <div className={totalAllocated === 0 && Object.values(budget.sections).every(s => s.cats.length === 0) ? 'budgetSections budgetSectionsEmpty' : 'budgetSections'}>
      {['needs', 'wants', 'savings'].map((sec) => {
        const secData = budget.sections[sec] || EMPTY_SECTION;
        const spent = secSpend[sec] || 0;
        const over = spent > secData.total;
        const allocatedInSec = secData.cats.reduce((s, c) => s + c.amt, 0);
        const unallocInSec = secData.total - allocatedInSec;

        return (
          <div key={sec} className="sectionCard budgetSection">
            <div className="sectionHeader">
              <div className="sectionLeft">
                <div className="dot" style={{ background: sectionColor(sec) }} />
                <span className="sectionName">{sectionLabel(sec)}</span>
                {over && (
                  <span className="badge badgeOverdue">
                    <NavIcon name="warning" size={11} /> Melebihi Batas
                  </span>
                )}
              </div>
              <div className="sectionRight">
                <div className="sectionAmounts">
                  <div className="sectionSpent" style={{ color: over ? 'var(--red-ink)' : 'var(--label)' }}>
                    {fmtFull(spent)} <span className="sep">/</span> {fmtFull(secData.total)}
                  </div>
                  <div className="sectionRemaining">
                    Sisa {fmtFull(Math.max(0, secData.total - spent))}
                  </div>
                </div>
                <button className="btnSmallGhost" onClick={() => setEditSection(sec)}>
                  <NavIcon name="edit" size={13} /> Edit
                </button>
              </div>
            </div>

            <div className="budgetProgress">
              <ProgressBar value={spent} max={secData.total} color={sectionColor(sec)} height={5} showOverflow />
            </div>

            <div className="allocGrid">
              {secData.cats.map((c) => {
                const cat = getCat(c.id);
                const cSpent = catSpend[c.id] || 0;
                const cOver = cSpent > c.amt;
                const cPct = c.amt > 0 ? Math.min((cSpent / c.amt) * 100, 100) : 0;
                return (
                  <div key={c.id} className="allocItem">
                    <div className="allocItemHead">
                      <div className="allocItemLabel">
                        <div className="dot" style={{ background: cat?.color || 'var(--fill-tertiary)' }} />
                        <span className="allocItemName">{cat?.name || c.id}</span>
                      </div>
                      {cOver && <span className="allocItemOver">OVER</span>}
                    </div>
                    <ProgressBar value={cSpent} max={c.amt} color={cat?.color || sectionColor(sec)} height={5} showOverflow />
                    <div className="allocItemFoot">
                      <span className="num">{fmt(cSpent)} / {fmt(c.amt)}</span>
                      <span className="num" style={{ color: cOver ? 'var(--red-ink)' : 'var(--label-2)' }}>
                        {Math.round(cPct)}%
                      </span>
                    </div>
                  </div>
                );
              })}
              {unallocInSec > 0 && (
                <div className="statCard">
                  <div className="statLabel">Belum Dialokasikan</div>
                  <div className="statValue">{fmtFull(unallocInSec)}</div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>

      {/* Recurring Items Amortized Cost Card */}
      {recurringItems.length > 0 && (
        <div className="sectionCard">
          <div className="sectionHeader">
            <div className="sectionLeft">
              <span style={{ fontSize: 16 }}>📦</span>
              <span className="sectionName">Biaya Berkala (Amortized)</span>
            </div>
          </div>
          <div className="budgetAmortized">
            <div className="summaryPills">
              {['needs', 'wants', 'savings'].map((sec) => {
                const amortized = getAmortizedBySection(recurringItems, categories);
                const val = amortized[sec] || 0;
                return (
                  <div key={sec} style={{
                    padding: '10px 12px',
                    background: `color-mix(in srgb, ${sectionColor(sec)} 10%, transparent)`,
                    borderRadius: 8,
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--label-2)', fontWeight: 600 }}>
                      {sectionLabel(sec)}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: sec === 'needs' ? 'var(--blue-ink)' : sec === 'wants' ? 'var(--orange-ink)' : 'var(--green-ink)', marginTop: 4 }}>
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
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--label)' }}>
                Total biaya berkala/bulan
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue-ink)' }}>
                {fmtFull(Math.round(getTotalAmortizedCost(recurringItems)))}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--label-2)', marginTop: 8, lineHeight: 1.5 }}>
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
