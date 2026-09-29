import { fmtFull, fmt, fmtDate, monthKey } from '../../utils/formatters';
import {
  getCatById,
  getCatIcon,
  sectionLabel,
  sectionColor,
  walletTypeLabel,
  getRecentTransactions,
} from '../../utils/helpers';
import { groupByStatus, formatDaysRemaining } from '../../utils/recurring';
import { getUpcomingSubscriptions, getSubscriptionCategoryInfo } from '../../utils/subscriptionHelpers';
import { useAuth } from '../../context/AuthContext';
import ProgressBar from '../../components/ui/ProgressBar';
import AmountText from '../../components/ui/AmountText';
import NavIcon from '../../components/icons/NavIcon';
import WalletIcon from '../../components/ui/WalletIcon';
import StatCard from './StatCard';
import Calendar from './Calendar';
import DebtWidget from './DebtWidget';
import InvestmentWidget from './InvestmentWidget';
import styles from './Dashboard.module.css';

/**
 * Dashboard — Main overview page.
 *
 * Shows daily budget, monthly stats, budget summary, calendar,
 * wallet summary, and recent transactions.
 *
 * @param {Object} props
 * @param {Array} props.wallets
 * @param {Array} props.transactions
 * @param {Object} props.budgets
 * @param {Function} props.setPage
 * @param {Function} props.onAddTx
 * @param {Array} props.categories
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */
export default function Dashboard({
  wallets,
  transactions,
  budgets,
  setPage,
  onAddTx,
  categories,
  recurringItems = [],
  debts = [],
  investments = [],
  subscriptions = [],
}) {
  const today = new Date();
  const mk = monthKey(today);
  const budget = budgets[mk] || {};
  const sections = budget.sections || {};

  // Auth context for greeting
  const { user } = useAuth();

  // Personalized greeting based on time of day
  const getGreeting = () => {
    const hour = today.getHours();
    if (hour < 11) return 'Selamat Pagi 👋';
    if (hour < 15) return 'Selamat Siang ☀️';
    if (hour < 18) return 'Selamat Sore 🌅';
    return 'Selamat Malam 🌙';
  };
  const userName = user?.email ? user.email.split('@')[0] : '';

  // Today's date string
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Today's expense transactions
  const todayTxs = transactions.filter(
    (t) => t.date === todayStr && t.type === 'expense'
  );
  const todaySpent = todayTxs.reduce((s, t) => s + t.amount, 0);

  // Month totals
  const monthTxs = transactions.filter((t) => t.date.startsWith(mk));
  const monthIncome = monthTxs
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTxs
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  // Daily budget
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  ).getDate();
  const dailyBudget = monthIncome / daysInMonth;
  const dailyRemaining = dailyBudget - todaySpent;

  // Section spending
  const sectionSpend = { needs: 0, wants: 0, savings: 0 };
  monthTxs
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      const cat = getCatById(t.categoryId, categories);
      if (cat && sectionSpend[cat.section] !== undefined) {
        sectionSpend[cat.section] += t.amount;
      }
    });

  // Month label for stat card
  const monthLabel = today.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });

  // Expense percentage of income
  const expPct =
    monthIncome > 0 ? Math.round((monthExpense / monthIncome) * 100) : 0;

  // Total balance
  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);

  // Recent transactions (6 most recent non-transfer)
  const recentTxs = getRecentTransactions(transactions, 6);

  // Smart insight: compute top expense category this month
  const getInsight = () => {
    const expenseTxs = monthTxs.filter((t) => t.type === 'expense');
    if (expenseTxs.length === 0) return null;
    const catTotals = {};
    expenseTxs.forEach((t) => {
      if (t.categoryId) {
        catTotals[t.categoryId] = (catTotals[t.categoryId] || 0) + t.amount;
      }
    });
    const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return null;
    const [topCatId, topAmount] = sorted[0];
    const topCat = getCatById(topCatId, categories);
    if (topCat) return { icon: '💡', text: `Pengeluaran terbesarmu bulan ini: ${topCat.name} (${fmtFull(topAmount)})` };
    return null;
  };
  const insight = getInsight();

  return (
    <div className={styles.wrapper}>
      {/* Personalized Greeting */}
      <div className={styles.greeting}>
        {getGreeting()}{userName ? `, ${userName}` : ''}
        <div className={styles.greetingSub}>Yuk, kelola keuanganmu hari ini</div>
      </div>

      {/* Mobile Hero Card */}
      <div className={styles.heroCard}>
        <div className={styles.heroTop}>
          <span className={styles.heroLabel}>Total Saldo</span>
          <span className={styles.heroPeriod}>{monthLabel}</span>
        </div>
        <div className={styles.heroValue}>{fmtFull(totalBalance)}</div>
        <div className={styles.heroSubCards}>
          <div className={styles.heroSubCard}>
            <span className={styles.heroSubIcon} style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}>↑</span>
            <div>
              <div className={styles.heroSubLabel}>Pemasukan</div>
              <div className={styles.heroSubValue} style={{ color: '#22C55E' }}>{fmt(monthIncome)}</div>
            </div>
          </div>
          <div className={styles.heroSubCard}>
            <span className={styles.heroSubIcon} style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>↓</span>
            <div>
              <div className={styles.heroSubLabel}>Pengeluaran</div>
              <div className={styles.heroSubValue} style={{ color: '#EF4444' }}>{fmt(monthExpense)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Smart Insight Card */}
      {insight && (
        <div className={styles.insightCard}>
          <span className={styles.insightIcon}>{insight.icon}</span>
          <span>{insight.text}</span>
        </div>
      )}

      {/* Mobile Quick Menu */}
      <div className={styles.quickMenu}>
        <h3 className={styles.quickMenuTitle}>Menu</h3>
        <div className={styles.quickMenuGrid}>
          <button className={styles.quickMenuItem} onClick={() => setPage('budget')}>
            <span className={styles.quickMenuIcon} style={{ background: 'rgba(79,110,247,0.12)', color: '#4F6EF7' }}>
              <NavIcon name="budget" size={20} />
            </span>
            <span className={styles.quickMenuLabel}>Budget</span>
          </button>
          <button className={styles.quickMenuItem} onClick={() => setPage('recurring')}>
            <span className={styles.quickMenuIcon} style={{ background: 'rgba(168,85,247,0.12)', color: '#A855F7' }}>
              <NavIcon name="recurring" size={20} />
            </span>
            <span className={styles.quickMenuLabel}>Berkala</span>
          </button>
          <button className={styles.quickMenuItem} onClick={() => setPage('subscription')}>
            <span className={styles.quickMenuIcon} style={{ background: 'rgba(168,85,247,0.12)', color: '#A855F7' }}>
              <NavIcon name="subscription" size={20} />
            </span>
            <span className={styles.quickMenuLabel}>Langganan</span>
          </button>
          <button className={styles.quickMenuItem} onClick={() => setPage('debt')}>
            <span className={styles.quickMenuIcon} style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
              <NavIcon name="debt" size={20} />
            </span>
            <span className={styles.quickMenuLabel}>Utang</span>
          </button>
          <button className={styles.quickMenuItem} onClick={() => setPage('invest')}>
            <span className={styles.quickMenuIcon} style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>
              <NavIcon name="invest" size={20} />
            </span>
            <span className={styles.quickMenuLabel}>Investasi</span>
          </button>
          <button className={styles.quickMenuItem} onClick={() => setPage('wallet')}>
            <span className={styles.quickMenuIcon} style={{ background: 'rgba(236,72,153,0.12)', color: '#EC4899' }}>
              <NavIcon name="wallet" size={20} />
            </span>
            <span className={styles.quickMenuLabel}>Dompet</span>
          </button>
          <button className={styles.quickMenuItem} onClick={() => setPage('report')}>
            <span className={styles.quickMenuIcon} style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}>
              <NavIcon name="report" size={20} />
            </span>
            <span className={styles.quickMenuLabel}>Laporan</span>
          </button>
          <button className={styles.quickMenuItem} onClick={() => setPage('asset')}>
            <span className={styles.quickMenuIcon} style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}>
              <NavIcon name="asset" size={20} />
            </span>
            <span className={styles.quickMenuLabel}>Aset</span>
          </button>
          <button className={styles.quickMenuItem} onClick={() => setPage('fire')}>
            <span className={styles.quickMenuIcon} style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
              <NavIcon name="fire" size={20} />
            </span>
            <span className={styles.quickMenuLabel}>FIRE</span>
          </button>
        </div>
      </div>

      {/* Top stat row */}
      <div className={styles.statGrid}>
        <StatCard
          label="Budget Hari Ini"
          value={fmtFull(dailyBudget)}
          sub={`Terpakai ${fmt(todaySpent)}`}
          accent={dailyRemaining >= 0 ? '#22C55E' : '#EF4444'}
          icon="budget"
          detail={`Sisa ${fmtFull(Math.abs(dailyRemaining))}${dailyRemaining < 0 ? ' (lebih)' : ''}`}
        />
        <StatCard
          label="Pemasukan Bulan Ini"
          value={fmtFull(monthIncome)}
          sub={monthLabel}
          accent="#4F6EF7"
          icon="income"
        />
        <StatCard
          label="Pengeluaran Bulan Ini"
          value={fmtFull(monthExpense)}
          sub={`${expPct}% dari pemasukan`}
          accent="#EF4444"
          icon="expense"
        />
        <StatCard
          label="Total Saldo"
          value={fmtFull(totalBalance)}
          sub={`${wallets.length} dompet aktif`}
          accent="#A855F7"
          icon="wallet"
        />
      </div>

      <div className={styles.mainGrid}>
        {/* Left column */}
        <div className={styles.leftCol}>
          {/* Budget summary */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Ringkasan Budget</h3>
              <button
                className={styles.btnGhost}
                onClick={() => setPage('budget')}
              >
                Lihat Detail
              </button>
            </div>
            {['needs', 'wants', 'savings'].map((sec) => {
              const secData = sections[sec] || { total: 0, cats: [] };
              const spent = sectionSpend[sec];
              const pct =
                secData.total > 0
                  ? Math.round((spent / secData.total) * 100)
                  : 0;
              const over = spent > secData.total;
              return (
                <div key={sec} className={styles.budgetRow}>
                  <div className={styles.budgetRowHeader}>
                    <div className={styles.budgetRowLeft}>
                      <div
                        className={styles.budgetSectionDot}
                        style={{ background: sectionColor(sec) }}
                      />
                      <span className={styles.budgetSectionName}>
                        {sectionLabel(sec)}
                      </span>
                      {over && (
                        <span className={styles.budgetOverflow}>
                          MELEBIHI!
                        </span>
                      )}
                    </div>
                    <div className={styles.budgetRowRight}>
                      <span
                        className={styles.budgetSpent}
                        style={{
                          color: over ? '#EF4444' : 'var(--text-1)',
                        }}
                      >
                        {fmt(spent)}
                      </span>
                      <span className={styles.budgetSep}> / </span>
                      <span>{fmt(secData.total)}</span>
                    </div>
                  </div>
                  <ProgressBar
                    value={spent}
                    max={secData.total}
                    color={sectionColor(sec)}
                    height={7}
                    showOverflow
                  />
                  <div className={styles.budgetFooter}>
                    {pct}% terpakai · Sisa{' '}
                    {fmt(Math.max(0, secData.total - spent))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Calendar */}
          <Calendar
            transactions={transactions}
            wallets={wallets}
            categories={categories}
            today={today}
          />
        </div>

        {/* Right column */}
        <div className={styles.rightCol}>
          {/* Quick add button */}
          <button className={styles.addTxBtn} onClick={onAddTx}>
            <NavIcon name="plus" size={18} /> Tambah Transaksi
          </button>

          {/* Restock reminder widget */}
          {recurringItems.length > 0 && (() => {
            const { needsRestock } = groupByStatus(recurringItems);
            if (needsRestock.length === 0) return null;
            return (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>🔔 Restock Segera ({needsRestock.length})</h3>
                  <button className={styles.linkBtn} onClick={() => setPage('recurring')}>
                    Lihat Semua
                  </button>
                </div>
                {needsRestock.slice(0, 4).map((item) => {
                  const cat = getCatById(item.categoryId, categories);
                  return (
                    <div key={item.id} className={styles.recentRow}>
                      <div
                        className={styles.recentIcon}
                        style={{
                          background: (cat?.color || '#94A3B8') + '18',
                          color: cat?.color || '#94A3B8',
                        }}
                      >
                        {item.name.charAt(0)}
                      </div>
                      <div className={styles.recentInfo}>
                        <div className={styles.recentNote}>{item.name}</div>
                        <div className={styles.recentMeta}>
                          {formatDaysRemaining(item._daysLeft)}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: item._daysLeft <= 0 ? 'rgba(220, 38, 38, 0.1)' : 'rgba(217, 119, 6, 0.1)',
                        color: item._daysLeft <= 0 ? '#F87171' : '#FBBF24',
                      }}>
                        {item._daysLeft <= 0 ? 'Terlambat' : 'Segera'}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Debt widget */}
          <DebtWidget debts={debts} setPage={setPage} />

          {/* Subscription widget — upcoming payments */}
          {subscriptions.length > 0 && (() => {
            const upcomingSubs = getUpcomingSubscriptions(subscriptions);
            if (upcomingSubs.length === 0) return null;
            return (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>💳 Tagihan Segera ({upcomingSubs.length})</h3>
                  <button className={styles.linkBtn} onClick={() => setPage('subscription')}>
                    Lihat Semua
                  </button>
                </div>
                {upcomingSubs.slice(0, 4).map((sub) => {
                  const catInfo = getSubscriptionCategoryInfo(sub.category);
                  const days = sub._daysUntilDue;
                  return (
                    <div key={sub.id} className={styles.recentRow}>
                      <div
                        className={styles.recentIcon}
                        style={{
                          background: 'rgba(168,85,247,0.12)',
                          color: '#A855F7',
                          fontSize: 16,
                        }}
                      >
                        {catInfo.emoji}
                      </div>
                      <div className={styles.recentInfo}>
                        <div className={styles.recentNote}>{sub.name}</div>
                        <div className={styles.recentMeta}>
                          {fmtFull(sub.amount)}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: days <= 0 ? 'rgba(220, 38, 38, 0.1)' : 'rgba(217, 119, 6, 0.1)',
                        color: days <= 0 ? '#F87171' : '#FBBF24',
                      }}>
                        {days <= 0 ? 'Terlambat' : days === 0 ? 'Hari ini' : `${days} hari`}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Investment widget */}
          <InvestmentWidget investments={investments} onNavigate={() => setPage('invest')} />

          {/* Wallet summary */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Dompet</h3>
              <button
                className={styles.linkBtn}
                onClick={() => setPage('wallet')}
              >
                Lihat Semua
              </button>
            </div>
            {wallets.slice(0, 4).map((w) => (
              <div key={w.id} className={styles.walletRow}>
                <div
                  className={styles.walletIcon}
                  style={{
                    background: w.color + '18',
                    color: w.color,
                  }}
                >
                  <WalletIcon type={w.type} size={16} />
                </div>
                <div className={styles.walletInfo}>
                  <div className={styles.walletName}>{w.name}</div>
                  <div className={styles.walletType}>
                    {walletTypeLabel(w.type)}
                  </div>
                </div>
                <div
                  className={styles.walletBalance}
                  style={{
                    color:
                      w.balance < 0 ? '#EF4444' : 'var(--text-1)',
                  }}
                >
                  {fmt(w.balance)}
                </div>
              </div>
            ))}
          </div>

          {/* Recent transactions */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Transaksi Terbaru</h3>
              <button
                className={styles.linkBtn}
                onClick={() => setPage('tx')}
              >
                Lihat Semua
              </button>
            </div>
            {recentTxs.map((t) => {
              const cat = getCatById(t.categoryId, categories);
              return (
                <div key={t.id} className={styles.recentRow}>
                  <div
                    className={styles.recentIcon}
                    style={{
                      background:
                        (cat?.color || 'var(--text-6)') + '18',
                      color: cat?.color || 'var(--text-5)',
                    }}
                  >
                    {getCatIcon(cat)}
                  </div>
                  <div className={styles.recentInfo}>
                    <div className={styles.recentNote}>{t.note}</div>
                    <div className={styles.recentMeta}>
                      {fmtDate(t.date)} · {cat?.name || '—'}
                    </div>
                  </div>
                  <AmountText
                    type={t.type}
                    amount={t.amount}
                    size={13}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
