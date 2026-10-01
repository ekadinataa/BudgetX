import { rp, rpShort, fmtDate, monthKey } from '../../utils/formatters';
import {
  getCatById,
  getCatIcon,
  sectionColor,
  getRecentTransactions,
} from '../../utils/helpers';
import { computeNetWorth, computeHealthRatios } from '../../utils/assetHelpers';
import { useAuth } from '../../context/AuthContext';
import { usePageActions } from '../../context/pageActions';
import NavIcon from '../../components/icons/NavIcon';
import ScoreDonut, { RatioBar, SectionTitle } from './ScoreParts';

const SECTIONS = [
  { id: 'needs', label: 'Kebutuhan' },
  { id: 'wants', label: 'Keinginan' },
  { id: 'savings', label: 'Tabungan' },
];

/** Quick-action tiles, per the reference: five across, first one primary. */
/**
 * Quick actions mirror the reference `budgetx-app.html`: two of them open a
 * modal in place (new transaction / transfer), the rest jump to the page that
 * hosts the form. `act` names the behaviour so ids stay unique.
 */
const QUICK_ACTIONS = [
  { act: 'tx-new', icon: 'plus', label: 'Transaksi', primary: true },
  { act: 'nav', page: 'wallet', icon: 'wallet', label: 'Dompet' },
  { act: 'tx-new-transfer', icon: 'transfer', label: 'Transfer' },
  { act: 'nav', page: 'budget', icon: 'income', label: 'Atur Pemasukan' },
  { act: 'nav', page: 'settings', icon: 'settings', label: 'Kategori' },
];

function StatCard({ label, value, sub, tone }) {
  return (
    <div className="statCard">
      <div className="statLabel">{label}</div>
      <div className="statValue num" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="statDetail">{sub}</div>}
    </div>
  );
}

/**
 * Dashboard — Main overview page.
 *
 * Structure follows the agreed reference (budgetx-app.html): a page header
 * with a period switch, a balance hero, a four-up stat grid, then a two
 * column grid — actions + budget on the left, health score + recommendations
 * on the right. Everything renders the user's real data; the reference's
 * sample figures are not copied.
 *
 * @param {Object} props
 * @param {Array} props.wallets
 * @param {Array} props.transactions
 * @param {Object} props.budgets
 * @param {Function} props.setPage
 * @param {Function} props.onAddTx
 * @param {Array} props.categories
 * @param {Array} [props.debts]
 * @param {Array} [props.investments]
 * @param {Array} [props.fixedAssets]
 */
export default function Dashboard({
  wallets,
  transactions,
  budgets,
  setPage,
  onAddTx,
  categories,
  debts = [],
  investments = [],
  fixedAssets = [],
  yearMode = false,
  onToggleYear,
}) {
  const { user } = useAuth();
  const today = new Date();
  const mk = monthKey(today);
  const year = today.getFullYear();
  // Budgets are stored per month (YYYY-MM), so "Tahun Ini" has to aggregate the
  // twelve monthly plans instead of reading a single key.
  const budgetMonths = yearMode
    ? Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
    : [mk];
  const budget = budgets[mk] || {};
  const totalIncomePlanned = budgetMonths.reduce(
    (s, k) => s + (budgets[k]?.totalIncome || 0),
    0
  );
  const sections = yearMode
    ? SECTIONS.reduce((acc, sec) => {
        acc[sec.id] = {
          total: budgetMonths.reduce(
            (s, k) => s + (budgets[k]?.sections?.[sec.id]?.total || 0),
            0
          ),
        };
        return acc;
      }, {})
    : budget.sections || {};

  const runQuickAction = (qa) => {
    if (qa.act === 'tx-new') return onAddTx('expense');
    if (qa.act === 'tx-new-transfer') return onAddTx('transfer');
    return setPage(qa.page);
  };

  // ── Period selection ────────────────────────────────────────────────
  // The reference switches the whole dashboard between "Bulan Ini" and
  // "Tahun Ini"; `yearMode` lifts to App so the preference survives a
  // navigation and reaches Firestore with the rest of the prefs.
  const periodTxs = yearMode
    ? transactions.filter((t) => t.date.startsWith(String(year)))
    : transactions.filter((t) => t.date.startsWith(mk));

  const income = periodTxs
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const expense = periodTxs
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const net = income - expense;

  // ── Budget ──────────────────────────────────────────────────────────
  const allocated = SECTIONS.reduce(
    (s, sec) => s + (sections[sec.id]?.total || 0),
    0
  );
  const sectionSpend = { needs: 0, wants: 0, savings: 0 };
  periodTxs
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      const cat = getCatById(t.categoryId, categories);
      if (cat && sectionSpend[cat.section] !== undefined) {
        sectionSpend[cat.section] += t.amount;
      }
    });
  const budgetSpent = SECTIONS.reduce(
    (s, sec) => s + sectionSpend[sec.id],
    0
  );
  const budgetUsedPct =
    allocated > 0 ? Math.round((budgetSpent / allocated) * 100) : 0;

  // ── Health ──────────────────────────────────────────────────────────
  const nw = computeNetWorth(wallets, debts, investments, fixedAssets);
  const health = computeHealthRatios(nw, transactions, debts);

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);
  const recentTxs = getRecentTransactions(transactions, 6);

  const hour = today.getHours();
  const greet =
    hour < 11 ? 'Selamat pagi'
      : hour < 15 ? 'Selamat siang'
        : hour < 19 ? 'Selamat sore'
          : 'Selamat malam';
  const userName = user?.email ? user.email.split('@')[0] : '';
  const periodLabel = yearMode ? 'Ringkasan ' + year : monthKeyLong(today);

  const recommendations = buildRecommendations(health, nw, budgetSpent, allocated);
  const topbarActions = usePageActions(onToggleYear && (
    <div className="seg" role="group" aria-label="Periode ringkasan">
      <button type="button" aria-pressed={!yearMode} onClick={() => onToggleYear(false)}>Bulan Ini</button>
      <button type="button" aria-pressed={yearMode} onClick={() => onToggleYear(true)}>Tahun Ini</button>
    </div>
  ));

  return (
    <>
      {topbarActions}
      {/* ── Page header ───────────────────────────────────────────── */}
      <div className="largeTitleBlock">
        <div>
        <h1 className="largeTitle">
          {greet}
          {userName ? `, ${userName}` : ''}
        </h1>
        <p className="pageSubtitle">
          {fmtDate(today.toISOString().slice(0, 10))} · {periodLabel}
        </p>
        </div>
      </div>

      {/* ── Balance hero ──────────────────────────────────────────── */}
      <section className="balanceCard">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--s3)' }}>
          <div style={{ minWidth: 0 }}>
            <div className="balanceLabel">Total Saldo Seluruh Dompet</div>
            <div className="balanceValue">{rp(totalBalance)}</div>
          </div>
          <span className="tag">{wallets.length} dompet</span>
        </div>
        <div className="balanceRow">
          <div className="balanceCell">
            <div className="balanceCellLabel">Pemasukan</div>
            <div className="balanceCellValue num" style={{ color: 'var(--green-ink)' }}>
              {rpShort(income)}
            </div>
          </div>
          <div className="balanceCell">
            <div className="balanceCellLabel">Pengeluaran</div>
            <div className="balanceCellValue num">{rpShort(expense)}</div>
          </div>
          <div className="balanceCell">
            <div className="balanceCellLabel">Sisa</div>
            <div
              className="balanceCellValue num"
              style={{ color: net >= 0 ? 'var(--green-ink)' : 'var(--red-ink)' }}
            >
              {rpShort(net)}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <div className="statGrid">
        <StatCard
          label={yearMode ? 'Pengeluaran Tahun Ini' : 'Pengeluaran Bulan Ini'}
          value={rp(expense)}
          sub={yearMode ? 'Januari–Desember' : monthKeyLong(today)}
        />
        <StatCard
          label={yearMode ? 'Pemasukan Tahun Ini' : 'Pemasukan Bulan Ini'}
          value={rp(income)}
          sub={
            income > 0 && expense > 0
              ? `Pengeluaran ${Math.round((expense / income) * 100)}% dari pemasukan`
              : 'Belum ada pemasukan'
          }
        />
        <StatCard
          label="Budget Terpakai"
          value={allocated > 0 ? `${budgetUsedPct}%` : 'Belum diatur'}
          sub={
            allocated > 0
              ? `${rp(budgetSpent)} dari ${rp(allocated)}`
              : 'Buat budget di halaman Budget'
          }
          tone={allocated > 0 && budgetSpent > allocated ? 'var(--red-ink)' : 'var(--green-ink)'}
        />
        <StatCard
          label="Rasio Utang"
          value={`${health.debtToAsset.toFixed(1)}%`}
          sub={health.debtToAsset < 30 ? 'Aman' : 'Perlu diturunkan'}
          tone={health.debtToAsset < 30 ? 'var(--green-ink)' : 'var(--orange-ink)'}
        />
      </div>

      {/* ── Two-column body ───────────────────────────────────────── */}
      <div className="mainGrid">
        <div className="col">
          {/* Aksi cepat */}
          <section className="card">
            <h2 className="sectionTitle">
              <NavIcon name="bolt" size={14} />
              Aksi Cepat
            </h2>
            <div className="quickActions">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.label}
                  type="button"
                  className={`quickBtn${qa.primary ? ' quickBtn--primary' : ''}`}
                  onClick={() => runQuickAction(qa)}
                >
                  <span className="quickBtnIcon">
                    <NavIcon name={qa.icon} size={20} />
                  </span>
                  {qa.label}
                </button>
              ))}
            </div>
          </section>

          {/* Budget per section */}
          <section className="card">
            <SectionTitle
              variant="card"
              action={
                <button className="btnSmallGhost" type="button" onClick={() => setPage('budget')}>
                  <NavIcon name="budget" size={14} />
                  Atur
                </button>
              }
            >
              Budget {periodLabel.replace('Ringkasan ', '')}
            </SectionTitle>
            <p className="cardSub" style={{ marginTop: -8, marginBottom: 12 }}>
              {allocated > 0
                ? `Alokasi ${rp(allocated)} dari pemasukan ${rp(totalIncomePlanned)}`
                : 'Belum ada budget untuk periode ini'}
            </p>
            {allocated === 0 ? (
              <div className="emptyState">
                <div className="emptyIcon"><NavIcon name="budget" size={28} /></div>
                <div className="emptyTitle">Budget belum dibuat</div>
                <p style={{ marginBottom: 12 }}>
                  Tetapkan pemasukan dan alokasi per kategori agar pengeluaran bisa dipantau.
                </p>
                <button className="btnPrimary" type="button" onClick={() => setPage('budget')}>
                  Buat Budget
                </button>
              </div>
            ) : (
              SECTIONS.map((sec, i) => {
                const data = sections[sec.id] || { total: 0 };
                const spent = sectionSpend[sec.id];
                const pct = data.total > 0 ? (spent / data.total) * 100 : 0;
                const over = spent > data.total;
                const remaining = Math.max(0, data.total - spent);
                const usedPct = data.total > 0 ? Math.round((spent / data.total) * 100) : 0;
                const color = over ? 'var(--red)' : sectionColor(sec.id);
                return (
                  <div
                    key={sec.id}
                    style={{
                      padding: '12px 0',
                      borderTop: i === 0 ? 'none' : 'var(--hairline) solid var(--separator)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: 10, marginBottom: 8,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span className="dot" style={{ background: color }} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{sec.label}</span>
                        {over && <span className="badge badgeOverdue"> Lewa</span>}
                      </span>
                      <span className="num" style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <span style={{ color: over ? 'var(--red-ink)' : 'var(--label)' }}>
                          {rpShort(spent)}
                        </span>
                        {' / '}
                        {rpShort(data.total)}
                      </span>
                    </div>
                    <div className="progressWrap">
                      <div
                        className="progressBar"
                        style={{ width: `${Math.min(100, pct)}%`, background: color }}
                      />
                    </div>
                    <div
                      style={{
                        display: 'flex', justifyContent: 'space-between', gap: 10,
                        marginTop: 5, fontSize: 11, color: 'var(--label-2)',
                      }}
                    >
                      <span>{usedPct}% terpakai</span>
                      <span>Sisa {rpShort(remaining)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          <section className="card">
            <SectionTitle
              variant="card"
              action={
                <button className="linkBtn" type="button" onClick={() => setPage('tx')}>
                  Lihat semua
                </button>
              }
            >
              Transaksi Terbaru
            </SectionTitle>
            {recentTxs.length === 0 ? (
              <div className="emptyState">
                <div className="emptyTitle">Belum ada transaksi</div>
              </div>
            ) : (
              <div className="list">
                {recentTxs.map((t) => {
                  const cat = getCatById(t.categoryId, categories);
                  return (
                    <div key={t.id} className="listRow">
                      <span className="itemIcon" aria-hidden="true">{getCatIcon(cat)}</span>
                      <span className="itemInfo">
                        <span className="itemName truncate">{t.note || '—'}</span>
                        <span className="itemMeta">
                          {fmtDate(t.date)}
                          {cat ? ` · ${cat.name}` : ''}
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
                        {rp(t.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>        </div>

        {/* ── Right rail ──────────────────────────────────────────── */}
        <div className="col">
          <section className="card">
            <SectionTitle icon="target">Skor Kesehatan Keuangan</SectionTitle>
            <div className="scoreHero">
              <ScoreDonut
                score={health.overallScore}
                color={health.grade.ring}
                inkColor={health.grade.ink}
              />
              <div className="scoreInfo">
                <span className="scoreGrade" style={{ color: health.grade.ink }}>
                  <NavIcon name="check" size={16} />
                  {health.grade.label}
                </span>
                <p className="cardSub" style={{ marginTop: 6 }}>
                  Rata-rata 3 bulan terakhir: pemasukan {rpShort(health.monthlyIncome)},
                  pengeluaran {rpShort(health.monthlyExpense)}.
                </p>
              </div>
            </div>
            <div className="divider" />
            <div className="ratioList">
              <RatioBar
                label="Rasio utang / aset"
                value={`${health.debtToAsset.toFixed(1)}%`}
                pct={health.debtToAsset}
              />
              <RatioBar
                label="Dana darurat"
                value={`${health.emergencyFundMonths.toFixed(1)} bulan`}
                pct={(health.emergencyFundMonths / 6) * 100}
              />
              <RatioBar
                label="Cicilan / pemasukan"
                value={`${health.debtServiceRatio.toFixed(1)}%`}
                pct={health.debtServiceRatio}
              />
              <RatioBar
                label="Rasio tabungan"
                value={`${health.savingsRate.toFixed(1)}%`}
                pct={Math.max(0, health.savingsRate)}
              />
            </div>
          </section>

          <section className="card">
            <SectionTitle icon="info">Rekomendasi</SectionTitle>
            <div className="rekomList">
              {recommendations.map((r) => (
                <div key={r.text} className={`rekomItem rekom${r.tone}`}>
                  <NavIcon name={r.tone === 'Sehat' ? 'check' : 'warning'} size={15} />
                  <span>{r.text}</span>
                </div>
              ))}
            </div>
          </section>



          {/* Ringkasan Kekayaan — the reference's `dashboard-networth` card.
              Replaces the pre-revamp wallet card: same intent (a single
              at-a-glance money summary) with the reference's three-up grid. */}
          <section className="card">
            <SectionTitle icon="wallet">Ringkasan Kekayaan</SectionTitle>
            <div className="netWorthGrid">
              <div className="netWorthItem">
                <div className="netWorthLabel">Total Aset</div>
                <div className="netWorthValue num">{rpShort(nw.totalAssets)}</div>
              </div>
              <div className="netWorthItem">
                <div className="netWorthLabel">Total Utang</div>
                <div className="netWorthValue num">{rpShort(nw.totalLiabilities)}</div>
              </div>
              <div className="netWorthItem">
                <div className="netWorthLabel">Bersih</div>
                <div
                  className="netWorthValue num"
                  style={{ color: nw.netWorth < 0 ? 'var(--red-ink)' : 'var(--label)' }}
                >
                  {rpShort(nw.netWorth)}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function monthKeyLong(d) {
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

/**
 * Derive the recommendation list from the same ratios the score uses, so the
 * two panels can never disagree. Tones map onto the reference's
 * rekomSehat / rekomPerhatian / rekomBahaya classes.
 */
function buildRecommendations(health, nw, budgetSpent, allocated) {
  const out = [];
  const push = (tone, text) => out.push({ tone, text });

  if (health.debtToAsset < 30) {
    push('Sehat', `Rasio utang ${health.debtToAsset.toFixed(1)}% — aman, posisi aset lebih besar dari utang.`);
  } else {
    push('Perhatian', `Rasio utang ${health.debtToAsset.toFixed(1)}% — turunkan agar di bawah 30%.`);
  }

  if (health.emergencyFundMonths < 3) {
    push('Bahaya', `Dana darurat hanya ${health.emergencyFundMonths.toFixed(1)} bulan pengeluaran. Targetkan minimal 3 bulan.`);
  } else if (health.emergencyFundMonths < 6) {
    push('Perhatian', `Dana darurat ${health.emergencyFundMonths.toFixed(1)} bulan. Targetkan 6 bulan.`);
  } else {
    push('Sehat', `Dana darurat ${health.emergencyFundMonths.toFixed(1)} bulan — sudah exceeds target 6 bulan.`);
  }

  if (health.savingsRate > 0) {
    push('Sehat', `Rasio tabungan ${health.savingsRate.toFixed(1)}% dari pemasukan.`);
  } else {
    push('Bahaya', 'Rasio tabungan minus — pengeluaran melampaui pemasukan.');
  }

  if (allocated > 0 && budgetSpent > allocated) {
    push('Bahaya', `Budget terpakai ${Math.round((budgetSpent / allocated) * 100)}% — melebihi alokasi.`);
  } else if (allocated > 0) {
    push('Sehat', `Budget terpakai ${Math.round((budgetSpent / allocated) * 100)}% dari alokasi.`);
  }

  if (nw.netWorth < 0) {
    push('Bahaya', 'Kekayaan bersih minus — liabilitas melebihi aset.');
  }

  return out.slice(0, 5);
}
