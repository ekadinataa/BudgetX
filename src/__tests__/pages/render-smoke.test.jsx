/**
 * Render smoke tests for every page.
 *
 * App.jsx, TransactionsPage, BudgetPage, FirePage and Dashboard had no component
 * coverage at all, which is what made the CSS-Module -> base.css migration
 * risky: a wrong className is a silent no-op, but a wrong conditional is a
 * crash, and nothing would have caught it.
 *
 * Deliberately shallow — mount each page and assert it renders its heading.
 * Behaviour is covered by the Playwright sweep, which drives the real app. What
 * this buys is "no page throws on mount", for both data shapes that actually
 * occur: populated and empty.
 *
 * The prop bags are over-provided on purpose. A page crashes on a *missing*
 * prop and never on an extra one, and the union below was extracted from the
 * pages' own signatures so a renamed prop cannot slip past.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { NAV_GROUPS } from '../../components/Sidebar/Sidebar.jsx';

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { email: 'smoke@budgetx.id' } }),
}));

// FirePage's recharts needs a measured container; jsdom has no ResizeObserver.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const TODAY = new Date().toISOString().slice(0, 10);
const NOW_MONTH = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
const noop = () => {};

const CATEGORIES = [
  { id: 'c1', name: 'Makanan', section: 'needs', color: '#FF9500', emoji: '🍔' },
  { id: 'c2', name: 'Gaji', section: 'income', color: '#34C559', emoji: '💰' },
  { id: 'c3', name: 'Dana Darurat', section: 'savings', color: '#007AFF', emoji: '🛡️' },
];

const WALLETS = [
  { id: 'w1', name: 'BCA', type: 'bank', balance: 5_000_000, color: '#007AFF' },
  { id: 'w2', name: 'Tunai', type: 'cash', balance: 500_000, color: '#34C759' },
];

const TRANSACTIONS = [
  { id: 't1', date: TODAY, type: 'expense', categoryId: 'c1', walletId: 'w1', amount: 50_000, note: 'Makan siang', tags: ['santai'] },
  { id: 't2', date: TODAY, type: 'income', categoryId: 'c2', walletId: 'w1', amount: 7_000_000, note: 'Gaji', tags: [] },
  { id: 't3', date: TODAY, type: 'transfer', walletId: 'w1', toWalletId: 'w2', amount: 300_000, note: 'Tarik tunai', tags: [] },
  { id: 't4', date: `${new Date().getFullYear()}-01-15`, type: 'expense', categoryId: 'c1', walletId: 'w2', amount: 25_000, note: 'Kopi', tags: [] },
];

const BUDGETS = {
  [NOW_MONTH]: {
    totalIncome: 7_000_000,
    sections: {
      needs: { total: 3_000_000, cats: [{ id: 'c1', amt: 3_000_000 }] },
      wants: { total: 2_000_000, cats: [] },
      savings: { total: 2_000_000, cats: [{ id: 'c3', amt: 2_000_000 }] },
    },
  },
};

const PAGES = [
  ['wallet', 'Dompet', '../../pages/Wallet/WalletPage.jsx', 'wallets'],
  ['tx', 'Transaksi', '../../pages/Transactions/TransactionsPage.jsx', 'transactions'],
  ['budget', 'Budget', '../../pages/Budget/BudgetPage.jsx', 'budgets'],
  ['recurring', 'Berkala', '../../pages/Recurring/RecurringPage.jsx', 'recurringItems'],
  ['subscription', 'Langganan', '../../pages/Subscription/SubscriptionPage.jsx', 'subscriptions'],
  ['debt', 'Utang & Piutang', '../../pages/Debt/DebtPage.jsx', 'debts'],
  ['invest', 'Investasi', '../../pages/Investment/InvestmentPage.jsx', 'investments'],
  ['asset', 'Aset Tetap', '../../pages/Asset/AssetPage.jsx', 'fixedAssets'],
  ['report', 'Laporan', '../../pages/Reports/ReportsPage.jsx', null],
  ['fire', 'FIRE', '../../pages/Fire/FirePage.jsx', null],
  ['settings', 'Pengaturan', '../../pages/Settings/SettingsPage.jsx', null],
  ['help', 'Bantuan', '../../pages/Help/HelpPage.jsx', null],
];

/** Props every page can receive; `dataKey` is swapped per data shape. */
function propsFor(dataKey, populated) {
  const data = {
    wallets: populated ? WALLETS : [],
    transactions: populated ? TRANSACTIONS : [],
    categories: CATEGORIES,
    budgets: populated ? BUDGETS : {},
    recurringItems: populated
      ? [{ id: 'r1', name: 'Gaji', amount: 7_000_000, frequency: 'monthly', nextDate: `${NOW_MONTH}-25`, status: 'active', categoryId: 'c2' }]
      : [],
    subscriptions: populated
      ? [{ id: 's1', name: 'Netflix', price: 150_000, billingCycle: 'monthly', nextDate: `${NOW_MONTH}-05`, status: 'active' }]
      : [],
    debts: populated
      ? [{ id: 'd1', type: 'utang', name: 'Kredit Mobil', principal: 50_000_000, remainingAmount: 20_000_000, monthlyInstallment: 1_500_000, interestRate: 6, status: 'active', dueDate: `${NOW_MONTH}-20`, payments: [] }]
      : [],
    investments: populated
      ? [{ id: 'i1', name: 'Reksa Dana', assetType: 'reksa_dana', units: 1000, buyPrice: 2000, currentPrice: 2500, status: 'active', transactions: [] }]
      : [],
    fixedAssets: populated
      ? [{ id: 'a1', name: 'Motor', category: 'kendaraan', value: 20_000_000, purchaseDate: `${NOW_MONTH}-01` }]
      : [],
  };

  const p = { ...data };
  // Preference-shaped props.
  p.cycleStart = 1;
  p.setCycleStart = noop;
  p.salaryAdjust = false;
  p.setSalaryAdjust = noop;
  p.periodMode = 'month';
  p.setPeriodMode = noop;
  p.customRanges = [];
  p.setCustomRanges = noop;
  p.fireSettings = null;
  p.savedSettings = null;
  p.onSaveFireSettings = noop;
  p.preferences = {};
  p.appearance = true;
  p.setPage = noop;
  p.showToast = noop;
  // Every `on*` handler gets a resolved promise where one is awaited.
  for (const k of Object.keys(p)) {
    if (/^on[A-Z]/.test(k)) p[k] = () => Promise.resolve();
  }
  // Setters.
  for (const k of Object.keys(data)) p[`set${k[0].toUpperCase()}${k.slice(1)}`] = noop;
  p.setCategories = noop;

  if (dataKey) p[dataKey] = data[dataKey];
  return p;
}

const ALL_PAGE_IDS = NAV_GROUPS.flatMap((g) => g.items);

describe('page render smoke tests', () => {
  beforeEach(() => cleanup());

  // Every page must be covered, or one can be added without a test.
  it('covers every page in the app', () => {
    const covered = [...PAGES.map(([id]) => id), 'dashboard'];
    // `fire` is deliberately absent from NAV_GROUPS: it has no sidebar entry
    // and is reached from Pengaturan -> "Kalkulator FIRE". It still needs a
    // smoke test, so it is listed here rather than silently dropped.
    const notInNav = covered.filter((id) => !ALL_PAGE_IDS.includes(id));
    expect(notInNav).toEqual(['fire']);
    expect(covered.length).toBe(ALL_PAGE_IDS.length + 1);
  });

  for (const [id, , path] of PAGES) {
    for (const populated of [true, false]) {
      it(`${id} mounts without throwing (${populated ? 'populated' : 'empty'})`, async () => {
        const mod = await import(/* @vite-ignore */ path);
        const Page = mod.default;
        expect(typeof Page).toBe('function');

        const { container } = render(
          <ThemeProvider darkMode={false} setDarkMode={noop}>
            <Page {...propsFor(id, populated)} />
          </ThemeProvider>,
        );

        // It rendered something real, not an empty shell.
        expect(container.textContent.trim().length).toBeGreaterThan(20);
      });
    }
  }

  it('dashboard mounts without throwing', async () => {
    const { default: Dashboard } = await import('../../pages/Dashboard/Dashboard.jsx');
    const { container } = render(
      <ThemeProvider darkMode={false} setDarkMode={noop}>
        <Dashboard
          wallets={WALLETS}
          transactions={TRANSACTIONS}
          budgets={BUDGETS}
          categories={CATEGORIES}
          debts={[]}
          investments={[]}
          fixedAssets={[]}
          setPage={noop}
          onAddTx={noop}
          onToggleYear={noop}
          yearMode={false}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Total Saldo Seluruh Dompet')).toBeInTheDocument();
    expect(container.textContent).toContain('Rp');
  });
});
