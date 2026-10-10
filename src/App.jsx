import { useState, useEffect, useCallback, useRef } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { useAuth } from './context/AuthContext';
import { auth as firebaseAuth, db as firebaseDb } from './config/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import Sidebar from './components/Sidebar/Sidebar';
import DataMigrator from './components/DataMigrator';
import Dashboard from './pages/Dashboard/Dashboard';
import WalletPage from './pages/Wallet/WalletPage';
import TransactionsPage from './pages/Transactions/TransactionsPage';
import BudgetPage from './pages/Budget/BudgetPage';
import RecurringPage from './pages/Recurring/RecurringPage';
import DebtPage from './pages/Debt/DebtPage';
import InvestmentPage from './pages/Investment/InvestmentPage';
import AssetPage from './pages/Asset/AssetPage';
import SubscriptionPage from './pages/Subscription/SubscriptionPage';
import ReportsPage from './pages/Reports/ReportsPage';
import SettingsPage from './pages/Settings/SettingsPage';
import FirePage from './pages/Fire/FirePage';
import HelpPage from './pages/Help/HelpPage';
import HelpChat from './components/HelpChat/HelpChat';
import Topbar from './components/Topbar/Topbar';
import TxFormModal from './pages/Transactions/TxFormModal';
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import ForgotPasswordPage from './pages/Auth/ForgotPasswordPage';
import { STORAGE_KEY } from './utils/constants';
import { WALLETS_INIT, TRANSACTIONS_INIT, BUDGETS_INIT, CATEGORIES } from './data/defaults';
import { buildDebtTransaction } from './utils/debtHelpers';
import { DEFAULT_FIRE_SETTINGS } from './utils/fireCalculator';
import { validateDebt, validatePayment } from './services/debtValidator';
import { buildInvestmentTransaction, computeTotalUnits } from './utils/investmentHelpers';
import { advanceDueDate, buildSubscriptionTransaction } from './utils/subscriptionHelpers';
import { validateInvestment, validateInvestmentTransaction, validateCurrentValue } from './services/investmentValidator';
import * as api from './services/firestoreService';
import { computeAppend } from './services/importService';
import { normalizeBackupData } from './utils/backupHelpers';
import { isCategoryOnlyChange } from './utils/transactionEdits';
import { buildWalletAdjustment } from './utils/walletAdjustment';
import { validateWallet } from './services/validator';
import './App.css';

// Detect if Firebase is configured — if not, run in local-only mode
const IS_LOCAL_MODE = !firebaseAuth;

/**
 * Pages that get the topbar's circular `+` launcher.
 *
 * Kept as an explicit allow-list rather than "every page except…", so adding a
 * page cannot silently grow a button whose behaviour the page does not own.
 * `tx` and `budget` are absent because both publish their own primary action
 * through `usePageActions`.
 */
const TOPBAR_FALLBACK_ADD_TX = new Set(['wallet', 'recurring', 'subscription', 'debt', 'invest', 'asset']);

/**
 * Content width per page id — see the comment in `renderPage`.
 * Deliberately keyed by the same ids as `NAV_GROUPS` in the Sidebar.
 */
const PAGE_MEASURE = {
  settings: 'pageWide',   // its cards go two-up via .cardCols
  help: 'pageMeasure',
  fire: 'pageMeasure',
  tx: 'pageWide',
  report: 'pageWide',
  wallet: 'pageWide',
  asset: 'pageWide',
  budget: 'pageWide',
  debt: 'pageWide',
  invest: 'pageWide',
  recurring: 'pageWide',
  subscription: 'pageWide',
};

function App() {
  const { user, loading: authLoading, login, register, logout, resetPassword } = useAuth();

  // Auth page navigation (login, register, forgot)
  const [authPage, setAuthPage] = useState('login');

  // Load persisted state from localStorage for local-only mode
  const loadLocalState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
  };
  const savedLocal = IS_LOCAL_MODE ? loadLocalState() : null;

  // App data state
  const [page, setPage] = useState(savedLocal?.page || 'dashboard');
  const [wallets, setWallets] = useState(savedLocal?.wallets || (IS_LOCAL_MODE ? WALLETS_INIT : []));
  const [transactions, setTransactions] = useState(savedLocal?.transactions || (IS_LOCAL_MODE ? TRANSACTIONS_INIT : []));
  const [budgets, setBudgets] = useState(savedLocal?.budgets || (IS_LOCAL_MODE ? BUDGETS_INIT : {}));
  const [categories, setCategories] = useState(savedLocal?.categories || (IS_LOCAL_MODE ? CATEGORIES : []));
  const [darkMode, setDarkMode] = useState(savedLocal?.darkMode || false);
  // Appearance presets from the design system: density and radius scale every
  // padding and corner in the app, so they belong next to darkMode rather
  // than inside the page modules.
  const [density, setDensity] = useState(savedLocal?.density || 'standard');
  const [radius, setRadius] = useState(savedLocal?.radius || 'soft');
  const [collapsed, setCollapsed] = useState(savedLocal?.collapsed || false);
  // Dashboard period switch (Bulan Ini / Tahun Ini), per the reference.
  const [yearMode, setYearMode] = useState(savedLocal?.yearMode || false);
  const [cycleStart, setCycleStart] = useState(savedLocal?.cycleStart || 1);
  const [salaryAdjust, setSalaryAdjust] = useState(savedLocal?.salaryAdjust || false);
  const [periodMode, setPeriodMode] = useState(savedLocal?.periodMode || 'month');
  const [customRanges, setCustomRanges] = useState(savedLocal?.customRanges || []);
  const [recurringItems, setRecurringItems] = useState(savedLocal?.recurringItems || []);
  const [debts, setDebts] = useState(savedLocal?.debts || []);
  const [investments, setInvestments] = useState(savedLocal?.investments || []);
  const [fixedAssets, setFixedAssets] = useState(savedLocal?.fixedAssets || []);
  const [subscriptions, setSubscriptions] = useState(savedLocal?.subscriptions || []);
  const [fireSettings, setFireSettings] = useState(savedLocal?.fireSettings || DEFAULT_FIRE_SETTINGS);

  // Loading & error states
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [toast, setToast] = useState('');

  // Migration state
  const [migrationChecked, setMigrationChecked] = useState(false);

  // Derived, not stored: once the user resolves the migration prompt
  // (`migrationChecked`) the prompt is done for the session.
  const showMigrator = Boolean(
    !IS_LOCAL_MODE && user && !authLoading && !migrationChecked
    && localStorage.getItem(STORAGE_KEY),
  );

  // Global "Add Transaction" modal state
  const [showAddTx, setShowAddTx] = useState(false);
  // Which type the global transaction modal opens on. 'expense' for the tab-bar
  // and FAB, 'transfer' for the Transfer quick action (see reference budgetx-app.html).
  const [addTxType, setAddTxType] = useState('expense');

  // In local-only mode, persist all state to localStorage
  useEffect(() => {
    if (!IS_LOCAL_MODE) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      page, wallets, transactions, budgets, categories, darkMode, density, radius, collapsed, yearMode, cycleStart, salaryAdjust, periodMode, customRanges, recurringItems, debts, investments, fixedAssets, subscriptions, fireSettings,
    }));
  }, [page, wallets, transactions, budgets, categories, darkMode, density, radius, collapsed, yearMode, cycleStart, salaryAdjust, periodMode, customRanges, recurringItems, debts, investments, fixedAssets, subscriptions, fireSettings]);

  // Show toast notification
  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }, []);

  const sessionRef = useRef(null);
  const fetchVersion = useRef(0);
  const [loadedUid, setLoadedUid] = useState(null);
  const [listenerRetry, setListenerRetry] = useState(0);
  const uid = user?.uid;

  // Only ancillary data is fetched; subscribed collections never accept stale reads.
  const fetchAllData = useCallback(async ({ initializeDefaults = true } = {}) => {
    const session = sessionRef.current;
    if (!session?.active) return;
    const version = ++fetchVersion.current;
    const current = () => session.active && sessionRef.current === session
      && firebaseAuth?.currentUser?.uid === session.uid && version === fetchVersion.current;
    session.fetched = false;
    setDataLoading(true);
    setDataError('');
    try {
      // Initialize default data for new users (no-op if already initialized)
      if (initializeDefaults) await api.initUser();

      if (!current()) return;
      const [budgetsData, prefsData, recurringData, debtsData, investmentsData, fixedAssetsData, subscriptionsData] = await Promise.all([
        api.getBudgets(),
        api.getPreferences(),
        api.getRecurringItems(),
        api.getDebts(),
        api.getInvestments(),
        api.getFixedAssets(),
        api.getSubscriptions(),
      ]);
      if (!current()) return;
      setRecurringItems(recurringData);
      setDebts(debtsData);
      setInvestments(investmentsData);
      setFixedAssets(fixedAssetsData);
      setSubscriptions(subscriptionsData);
      // budgets come as array from API, convert to object keyed by monthKey
      if (Array.isArray(budgetsData)) {
        const budgetMap = {};
        budgetsData.forEach((b) => {
          const key = b.id || b.monthKey;
          if (key) {
            const { id, monthKey, ...rest } = b;
            budgetMap[key] = rest;
          }
        });
        setBudgets(budgetMap);
      } else {
        setBudgets(budgetsData || {});
      }
      if (prefsData) {
        const prefs = normalizeBackupData({ preferences: prefsData }).preferences;
        setDarkMode(prefs.darkMode);
        setCycleStart(prefs.cycleStart);
        setSalaryAdjust(prefs.salaryAdjust);
        setPage(prefs.page);
        setPeriodMode(prefs.periodMode);
        setCustomRanges(prefs.customRanges);
        setDensity(prefs.density);
        setRadius(prefs.radius);
        setCollapsed(prefs.collapsed);
        setYearMode(prefs.yearMode);
      }
      // Load FIRE settings from Firestore
      try {
        if (firebaseDb) {
          const fireDocRef = doc(firebaseDb, 'users', session.uid, 'preferences', 'fire');
          const fireSnap = await getDoc(fireDocRef);
          if (!current()) return;
          setFireSettings(normalizeBackupData({
            fireSettings: fireSnap.exists() ? fireSnap.data() : undefined,
          }).fireSettings);
        }
      } catch { /* silent — fire settings are optional */ }
      if (current()) {
        session.fetched = true;
        session.ready();
      }
    } catch {
      if (!current()) return;
      setDataError('Gagal memuat data. Periksa koneksi Anda.');
      showToast('Gagal memuat data dari server.');
      setDataLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (IS_LOCAL_MODE || !uid || authLoading || showMigrator) return;
    const session = { uid, active: true, fetched: false, received: new Set() };
    sessionRef.current = session;
    const current = () => session.active && firebaseAuth?.currentUser?.uid === uid;
    session.ready = () => {
      if (current() && session.fetched && session.received.size === 3) {
        setLoadedUid(uid);
        setDataLoading(false);
      }
    };
    const handlers = Object.fromEntries([
      ['wallets', setWallets], ['transactions', setTransactions], ['categories', setCategories],
    ].map(([key, set]) => [key, records => {
      if (!current()) return;
      set(records);
      session.received.add(key);
      session.ready();
    }]));
    const onError = () => {
      if (!current()) return;
      setDataError('Gagal menyinkronkan data. Periksa koneksi Anda.');
      setDataLoading(false);
      showToast('Gagal menyinkronkan data dari server.');
    };
    let unsubscribe = () => {};
    try {
      unsubscribe = api.subscribeUserData(uid, handlers, onError);
      // Auth is an external system; spinner follows its initialization.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAllData();
    } catch { onError(); }
    return () => {
      session.active = false;
      unsubscribe();
    };
  }, [uid, authLoading, showMigrator, fetchAllData, showToast, listenerRetry]);

  // Save preferences to API when they change (debounced via user interaction)
  const savePreferences = useCallback(async (prefs) => {
    if (!user) return;
    try {
      await api.updatePreferences(prefs);
    } catch {
      // Silent fail for preferences
    }
  }, [user]);

  // Auto-persist preferences to Firestore whenever any preference value changes
  const prefsInitialized = !dataLoading && user && loadedUid === uid;
  useEffect(() => {
    if (!prefsInitialized || IS_LOCAL_MODE) return;
    // Debounce to batch rapid state changes (e.g., setPeriodMode + setCustomRanges in same handler)
    const timer = setTimeout(() => {
      savePreferences({ darkMode, cycleStart, salaryAdjust, page, periodMode, customRanges, density, radius, collapsed, yearMode });
    }, 300);
    return () => clearTimeout(timer);
  }, [darkMode, cycleStart, salaryAdjust, page, periodMode, customRanges, density, radius, collapsed, yearMode, prefsInitialized, savePreferences]);

  // Simple setters for preferences (no longer need individual persist wrappers for periodMode/customRanges)
  const handleSetDarkMode = useCallback((valOrFn) => {
    setDarkMode((prev) => typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn);
  }, []);

  const handleSetCycleStart = useCallback((valOrFn) => {
    setCycleStart((prev) => typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn);
  }, []);

  const handleSetSalaryAdjust = useCallback((valOrFn) => {
    setSalaryAdjust((prev) => typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn);
  }, []);

  const handleSetPeriodMode = useCallback((valOrFn) => {
    setPeriodMode((prev) => typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn);
  }, []);

  const handleSetCustomRanges = useCallback((valOrFn) => {
    setCustomRanges((prev) => typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn);
  }, []);

  // ── Auth pages (not authenticated) ─────────────────────────────────
  if (!IS_LOCAL_MODE && authLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', width: '100vw', background: 'var(--bg)',
      }}>
        <div style={{ textAlign: 'center', color: 'var(--text-4)' }}>
          <div style={{
            width: 40, height: 40, border: '3px solid var(--border)',
            borderTopColor: 'var(--blue)', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          <div style={{ fontSize: 14 }}>Memuat...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!IS_LOCAL_MODE && !user) {
    switch (authPage) {
      case 'register':
        return <RegisterPage onRegister={register} onNavigate={setAuthPage} />;
      case 'forgot':
        return <ForgotPasswordPage onResetPassword={resetPassword} onNavigate={setAuthPage} />;
      default:
        return <LoginPage onLogin={login} onNavigate={setAuthPage} />;
    }
  }

  // ── Migration prompt ───────────────────────────────────────────────
  if (showMigrator) {
    return (
      <ThemeProvider darkMode={darkMode} setDarkMode={handleSetDarkMode}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', width: '100vw', background: 'var(--bg)',
        }}>
          <DataMigrator
            onComplete={() => {
              setMigrationChecked(true);
            }}
          />
        </div>
      </ThemeProvider>
    );
  }

  // ── Data loading state ─────────────────────────────────────────────
  if (!IS_LOCAL_MODE && (dataLoading || (loadedUid !== uid && !dataError))) {
    return (
      <ThemeProvider darkMode={darkMode} setDarkMode={handleSetDarkMode}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', width: '100vw', background: 'var(--bg)',
        }}>
          <div style={{ textAlign: 'center', color: 'var(--text-4)' }}>
            <div style={{
              width: 40, height: 40, border: '3px solid var(--border)',
              borderTopColor: 'var(--blue)', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
            }} />
            <div style={{ fontSize: 14 }}>Memuat data...</div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </ThemeProvider>
    );
  }

  if (!IS_LOCAL_MODE && dataError && (loadedUid !== uid || wallets.length === 0)) {
    return (
      <ThemeProvider darkMode={darkMode} setDarkMode={handleSetDarkMode}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', width: '100vw', background: 'var(--bg)', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ color: 'var(--red-ink)', fontSize: 15 }}>{dataError}</div>
          <button
            onClick={() => setListenerRetry(retry => retry + 1)}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: 'var(--blue-ink)', color: 'var(--accent-on)', fontSize: 14,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Coba Lagi
          </button>
        </div>
      </ThemeProvider>
    );
  }

  // ── Helpers for API-backed state updates ───────────────────────────

  /** Create a wallet via API (or locally) and update local state */
  const handleCreateWallet = async (data) => {
    if (IS_LOCAL_MODE) {
      const created = { id: 'w' + Date.now(), ...data, balance: parseFloat(data.balance) || 0 };
      setWallets((ws) => [...ws, created]);
      return created;
    }
    try {
      const created = await api.createWallet(data);
      return created;
    } catch (err) {
      showToast(err.message || 'Gagal membuat dompet.');
      throw err;
    }
  };

  /** Update a wallet via API (or locally) and update local state */
  const handleUpdateWallet = async (id, data, adjustment) => {
    if (IS_LOCAL_MODE) {
      const error = validateWallet(data);
      if (error) throw new Error(error);
      const previous = wallets.find(w => w.id === id);
      if (!previous) throw new Error('Dompet tidak ditemukan.');
      const transaction = buildWalletAdjustment(previous, data, adjustment);
      const updated = { ...previous, ...data, id };
      // React batches both setters; persistence sees the wallet and audit together.
      setWallets(ws => ws.map(w => w.id === id ? updated : w));
      if (transaction) setTransactions(ts => [{ id: crypto.randomUUID(), ...transaction }, ...ts]);
      return updated;
    }
    try {
      const updated = await api.updateWallet(id, data, adjustment);
      return updated;
    } catch (err) {
      showToast(err.message || 'Gagal mengubah dompet.');
      throw err;
    }
  };

  /** Delete a wallet via API (or locally) and update local state */
  const handleDeleteWallet = async (id) => {
    if (IS_LOCAL_MODE) {
      setWallets((ws) => ws.filter((w) => w.id !== id));
      return;
    }
    try {
      await api.deleteWallet(id);
    } catch (err) {
      showToast(err.message || 'Gagal menghapus dompet.');
      throw err;
    }
  };

  /** Create a transaction via API (or locally) and update local state (including wallet balances) */
  const handleCreateTransaction = async (data) => {
    if (IS_LOCAL_MODE) {
      const created = { id: 'tx' + Date.now(), ...data, amount: parseFloat(data.amount) || 0 };
      setTransactions((ts) => [created, ...ts]);
      return created;
    }
    try {
      const created = await api.createTransaction(data);
      return created;
    } catch (err) {
      showToast(err.message || 'Gagal membuat transaksi.');
      throw err;
    }
  };

  /** Update a transaction via API (or locally) and update local state */
  const handleUpdateTransaction = async (id, data) => {
    if (data.type === 'adjustment' || transactions.find(tx => tx.id === id)?.type === 'adjustment') {
      throw new Error('Penyesuaian saldo tidak dapat diedit. Buat penyesuaian baru dari dompet.');
    }
    if (IS_LOCAL_MODE) {
      setTransactions((ts) => ts.map((t) => (t.id === id ? { ...t, ...data } : t)));
      return { id, ...data };
    }
    try {
      const previous = transactions.find(tx => tx.id === id);
      const updated = isCategoryOnlyChange(previous, data)
        ? await api.updateTransactionCategory(id, data.categoryId)
        : await api.updateTransaction(id, data);
      return updated;
    } catch (err) {
      showToast(err.message || 'Gagal mengubah transaksi.');
      throw err;
    }
  };

  /** Delete a transaction via API (or locally) and update local state */
  const handleDeleteTransaction = async (id) => {
    if (IS_LOCAL_MODE) {
      const previous = transactions.find(tx => tx.id === id);
      if (previous?.type === 'adjustment') {
        setWallets(ws => ws.map(w => w.id === previous.walletId ? { ...w, balance: w.balance - previous.amount } : w));
      }
      setTransactions((ts) => ts.filter((t) => t.id !== id));
      return;
    }
    try {
      await api.deleteTransaction(id);
    } catch (err) {
      showToast(err.message || 'Gagal menghapus transaksi.');
      throw err;
    }
  };

  /** Update budgets via API (or locally) and update local state */
  const handleSetBudgets = async (valOrFn) => {
    const newBudgets = typeof valOrFn === 'function' ? valOrFn(budgets) : valOrFn;
    setBudgets(newBudgets);
    if (IS_LOCAL_MODE) return;
    // Find which month keys changed and update them
    for (const [monthKey, data] of Object.entries(newBudgets)) {
      if (JSON.stringify(budgets[monthKey]) !== JSON.stringify(data)) {
        try {
          await api.updateBudget(monthKey, data);
        } catch (err) {
          showToast(err.message || 'Gagal menyimpan budget.');
        }
      }
    }
  };

  /** Create a category via API (or locally) and update local state */
  const handleCreateCategory = async (data) => {
    if (IS_LOCAL_MODE) {
      const created = { id: 'c_' + Date.now(), ...data };
      setCategories((cs) => [...cs, created]);
      return created;
    }
    try {
      const created = await api.createCategory(data);
      return created;
    } catch (err) {
      showToast(err.message || 'Gagal membuat kategori.');
      throw err;
    }
  };

  /** Update a category via API (or locally) and update local state */
  const handleUpdateCategory = async (id, data) => {
    if (IS_LOCAL_MODE) {
      setCategories((cs) => cs.map((c) => (c.id === id ? { ...c, ...data } : c)));
      return { id, ...data };
    }
    try {
      const updated = await api.updateCategory(id, data);
      return updated;
    } catch (err) {
      showToast(err.message || 'Gagal mengubah kategori.');
      throw err;
    }
  };

  /** Delete a category via API (or locally) and update local state */
  const handleDeleteCategory = async (id) => {
    if (IS_LOCAL_MODE) {
      setCategories((cs) => cs.filter((c) => c.id !== id));
      return;
    }
    try {
      await api.deleteCategory(id);
    } catch (err) {
      showToast(err.message || 'Gagal menghapus kategori.');
      throw err;
    }
  };

  // ── Recurring Items handlers ───────────────────────────────────────

  /** Create a recurring item via API (or locally) and update local state */
  const handleCreateRecurringItem = async (data) => {
    if (IS_LOCAL_MODE) {
      const created = { id: 'ri_' + Date.now(), ...data, isActive: true, createdAt: new Date().toISOString().slice(0, 10) };
      setRecurringItems((items) => [...items, created]);
      showToast('Item berkala berhasil ditambahkan.');
      return created;
    }
    try {
      const created = await api.createRecurringItem(data);
      setRecurringItems((items) => [...items, created]);
      showToast('Item berkala berhasil ditambahkan.');
      return created;
    } catch (err) {
      showToast(err.message || 'Gagal membuat item berkala.');
      throw err;
    }
  };

  /** Update a recurring item via API (or locally) and update local state */
  const handleUpdateRecurringItem = async (id, data) => {
    if (IS_LOCAL_MODE) {
      setRecurringItems((items) => items.map((i) => (i.id === id ? { ...i, ...data } : i)));
      return { id, ...data };
    }
    try {
      await api.updateRecurringItem(id, data);
      setRecurringItems((items) => items.map((i) => (i.id === id ? { ...i, ...data } : i)));
      return { id, ...data };
    } catch (err) {
      showToast(err.message || 'Gagal mengubah item berkala.');
      throw err;
    }
  };

  /** Delete a recurring item via API (or locally) and update local state */
  const handleDeleteRecurringItem = async (id) => {
    if (IS_LOCAL_MODE) {
      setRecurringItems((items) => items.filter((i) => i.id !== id));
      showToast('Item berkala berhasil dihapus.');
      return;
    }
    try {
      await api.deleteRecurringItem(id);
      setRecurringItems((items) => items.filter((i) => i.id !== id));
      showToast('Item berkala berhasil dihapus.');
    } catch (err) {
      showToast(err.message || 'Gagal menghapus item berkala.');
      throw err;
    }
  };

  /** Handle repurchase: update item dates + optionally create transaction */
  const handleRepurchaseItem = async (id, repurchaseData) => {
    const { purchaseDate, amount, walletId, createTransaction, nextEstimateDate } = repurchaseData;

    // Update the recurring item
    const updateData = {
      lastPurchaseDate: purchaseDate,
      nextEstimateDate,
      amount, // Update price if changed
    };
    await handleUpdateRecurringItem(id, updateData);

    // Optionally create a transaction
    if (createTransaction && walletId) {
      const item = recurringItems.find((i) => i.id === id);
      const txData = {
        date: purchaseDate,
        walletId,
        type: 'expense',
        categoryId: item?.categoryId || '',
        amount,
        note: `Beli ulang: ${item?.name || 'Item berkala'}`,
        tags: ['berkala', ...(item?.tags || [])],
      };
      await handleCreateTransaction(txData);
    }

    showToast('Pembelian ulang berhasil dicatat.');
  };

  // ── Debt handlers ──────────────────────────────────────────────────

  /** Create a debt record via API (or locally) and generate a transaction */
  const handleCreateDebt = async (data) => {
    const error = validateDebt(data);
    if (error) {
      showToast(error);
      throw new Error(error);
    }

    const today = new Date().toISOString().slice(0, 10);
    const debtData = {
      type: data.type,
      personName: data.personName.trim(),
      totalAmount: Number(data.totalAmount),
      remainingAmount: Number(data.totalAmount),
      walletId: data.walletId,
      dueDate: data.dueDate || '',
      description: data.description || '',
      status: 'active',
      payments: [],
      transactionId: '',
      createdAt: today,
      // Interest/annuity fields
      interestEnabled: data.interestEnabled || false,
      interestRate: data.interestRate || 0,
      tenorMonths: data.tenorMonths || 0,
      startDate: data.startDate || '',
      monthlyInstallment: data.monthlyInstallment || 0,
      // Note: schedule is NOT stored in Firestore — generated on-the-fly in UI
    };

    // Generate the associated transaction
    const txData = buildDebtTransaction('create', debtData, debtData.totalAmount, debtData.walletId);

    let createdTx;
    try {
      createdTx = await handleCreateTransaction(txData);
    } catch (err) {
      showToast('Gagal membuat transaksi utang/piutang.');
      throw err;
    }

    debtData.transactionId = createdTx?.id || '';

    if (IS_LOCAL_MODE) {
      const created = { id: 'debt_' + Date.now(), ...debtData };
      setDebts((ds) => [...ds, created]);
      showToast('Utang/piutang berhasil ditambahkan.');
      return created;
    }

    try {
      const created = await api.createDebt(debtData);
      setDebts((ds) => [...ds, created]);
      showToast('Utang/piutang berhasil ditambahkan.');
      return created;
    } catch (err) {
      showToast(err.message || 'Gagal membuat utang/piutang.');
      throw err;
    }
  };

  /** Update a debt record via API (or locally) */
  const handleUpdateDebt = async (id, data) => {
    if (IS_LOCAL_MODE) {
      setDebts((ds) => ds.map((d) => (d.id === id ? { ...d, ...data } : d)));
      showToast('Utang/piutang berhasil diubah.');
      return { id, ...data };
    }
    try {
      await api.updateDebt(id, data);
      setDebts((ds) => ds.map((d) => (d.id === id ? { ...d, ...data } : d)));
      showToast('Utang/piutang berhasil diubah.');
      return { id, ...data };
    } catch (err) {
      showToast(err.message || 'Gagal mengubah utang/piutang.');
      throw err;
    }
  };

  /** Delete a debt record via API (or locally) */
  const handleDeleteDebt = async (id) => {
    if (IS_LOCAL_MODE) {
      setDebts((ds) => ds.filter((d) => d.id !== id));
      showToast('Utang/piutang berhasil dihapus.');
      return;
    }
    try {
      await api.deleteDebt(id);
      setDebts((ds) => ds.filter((d) => d.id !== id));
      showToast('Utang/piutang berhasil dihapus.');
    } catch (err) {
      showToast(err.message || 'Gagal menghapus utang/piutang.');
      throw err;
    }
  };

  /** Record a payment against a debt record */
  const handleRecordPayment = async (debtId, paymentData) => {
    const debt = debts.find((d) => d.id === debtId);
    if (!debt) {
      showToast('Data utang/piutang tidak ditemukan.');
      return;
    }

    // For annuity payments, only the principal part reduces remainingAmount
    const isAnnuity = paymentData.isAnnuityPayment && (debt.interestEnabled || (debt.interestRate > 0 && debt.tenorMonths > 0));
    const principalReduction = isAnnuity ? paymentData.principalPart : paymentData.amount;

    // Validate: for non-annuity, use standard validation
    if (!isAnnuity) {
      const error = validatePayment(paymentData, debt.remainingAmount);
      if (error) {
        showToast(error);
        throw new Error(error);
      }
    }

    // Generate the payment transaction (full amount leaves wallet)
    const txData = buildDebtTransaction('payment', debt, paymentData.amount, paymentData.walletId || debt.walletId);
    txData.date = paymentData.date;

    // For annuity, add breakdown info to the note
    if (isAnnuity) {
      txData.note += ` (Pokok: ${paymentData.principalPart}, Bunga: ${paymentData.interestPart})`;
    }

    let createdTx;
    try {
      createdTx = await handleCreateTransaction(txData);
    } catch (err) {
      showToast('Gagal membuat transaksi pembayaran.');
      throw err;
    }

    // Apply payment to debt record — for annuity, only principal reduces remaining
    const paymentEntry = {
      amount: paymentData.amount, // Total paid (for history display)
      principalPart: isAnnuity ? paymentData.principalPart : paymentData.amount,
      interestPart: isAnnuity ? paymentData.interestPart : 0,
      date: paymentData.date,
      note: paymentData.note || '',
      walletId: paymentData.walletId,
      transactionId: createdTx?.id || '',
    };

    // Calculate new remaining (only principal reduces it)
    const newRemaining = Math.max(0, debt.remainingAmount - principalReduction);
    const newPayments = [...(debt.payments || []), paymentEntry];
    const newStatus = newRemaining <= 0 ? 'settled' : 'active';

    // Persist the updated debt
    const updateData = {
      remainingAmount: newRemaining,
      payments: newPayments,
      status: newStatus,
    };

    if (IS_LOCAL_MODE) {
      setDebts((ds) => ds.map((d) => (d.id === debtId ? { ...d, ...updateData } : d)));
      showToast('Pembayaran berhasil dicatat.');
      return;
    }

    try {
      await api.updateDebt(debtId, updateData);
      setDebts((ds) => ds.map((d) => (d.id === debtId ? { ...d, ...updateData } : d)));
      showToast('Pembayaran berhasil dicatat.');
    } catch (err) {
      showToast(err.message || 'Gagal mencatat pembayaran.');
      throw err;
    }
  };

  // ── Investment handlers ──────────────────────────────────────────────

  /** Create an investment record */
  const handleCreateInvestment = async (data) => {
    const error = validateInvestment(data);
    if (error) {
      showToast(error);
      throw new Error(error);
    }

    const today = new Date().toISOString().slice(0, 10);
    const investmentData = {
      ...data,
      currentValue: 0,
      transactions: [],
      createdAt: today,
      lastUpdated: today,
    };

    if (IS_LOCAL_MODE) {
      const created = { id: 'inv_' + Date.now(), ...investmentData };
      setInvestments((items) => [...items, created]);
      showToast('Investasi berhasil ditambahkan.');
      return created;
    }

    try {
      const created = await api.createInvestment(investmentData);
      setInvestments((items) => [...items, created]);
      showToast('Investasi berhasil ditambahkan.');
      return created;
    } catch (err) {
      showToast(err.message || 'Gagal membuat investasi.');
      throw err;
    }
  };

  /** Update an investment record */
  const handleUpdateInvestment = async (id, data) => {
    if (IS_LOCAL_MODE) {
      setInvestments((items) => items.map((i) => (i.id === id ? { ...i, ...data } : i)));
      showToast('Investasi berhasil diubah.');
      return { id, ...data };
    }
    try {
      await api.updateInvestment(id, data);
      setInvestments((items) => items.map((i) => (i.id === id ? { ...i, ...data } : i)));
      showToast('Investasi berhasil diubah.');
      return { id, ...data };
    } catch (err) {
      showToast(err.message || 'Gagal mengubah investasi.');
      throw err;
    }
  };

  /** Delete an investment record */
  const handleDeleteInvestment = async (id) => {
    if (IS_LOCAL_MODE) {
      setInvestments((items) => items.filter((i) => i.id !== id));
      showToast('Investasi berhasil dihapus.');
      return;
    }
    try {
      await api.deleteInvestment(id);
      setInvestments((items) => items.filter((i) => i.id !== id));
      showToast('Investasi berhasil dihapus.');
    } catch (err) {
      showToast(err.message || 'Gagal menghapus investasi.');
      throw err;
    }
  };

  /** Record a buy transaction for an investment */
  const handleRecordBuy = async (investmentId, txData) => {
    const investment = investments.find((i) => i.id === investmentId);
    if (!investment) {
      showToast('Data investasi tidak ditemukan.');
      return;
    }

    const error = validateInvestmentTransaction(txData, 'buy');
    if (error) {
      showToast(error);
      throw new Error(error);
    }

    // Generate wallet transaction
    const walletTxData = buildInvestmentTransaction('buy', investment, txData.totalAmount, txData.walletId);
    walletTxData.date = txData.date;

    let createdTx;
    try {
      createdTx = await handleCreateTransaction(walletTxData);
    } catch (err) {
      showToast('Gagal membuat transaksi pembelian.');
      throw err;
    }

    // Add investment transaction entry
    const invTx = {
      id: 'itx_' + Date.now(),
      type: 'buy',
      date: txData.date,
      units: txData.units,
      pricePerUnit: txData.pricePerUnit,
      totalAmount: txData.totalAmount,
      walletId: txData.walletId,
      note: txData.note || '',
      walletTxId: createdTx?.id || '',
    };

    const updatedTransactions = [...(investment.transactions || []), invTx];
    const updateData = {
      transactions: updatedTransactions,
      lastUpdated: new Date().toISOString().slice(0, 10),
    };

    if (IS_LOCAL_MODE) {
      setInvestments((items) => items.map((i) => (i.id === investmentId ? { ...i, ...updateData } : i)));
      showToast('Pembelian berhasil dicatat.');
      return;
    }

    try {
      await api.updateInvestment(investmentId, updateData);
      setInvestments((items) => items.map((i) => (i.id === investmentId ? { ...i, ...updateData } : i)));
      showToast('Pembelian berhasil dicatat.');
    } catch (err) {
      showToast(err.message || 'Gagal mencatat pembelian.');
      throw err;
    }
  };

  /** Record a sell transaction for an investment */
  const handleRecordSell = async (investmentId, txData) => {
    const investment = investments.find((i) => i.id === investmentId);
    if (!investment) {
      showToast('Data investasi tidak ditemukan.');
      return;
    }

    const maxUnits = computeTotalUnits(investment.transactions || []);
    const error = validateInvestmentTransaction(txData, 'sell', maxUnits);
    if (error) {
      showToast(error);
      throw new Error(error);
    }

    // Generate wallet transaction
    const walletTxData = buildInvestmentTransaction('sell', investment, txData.totalAmount, txData.walletId);
    walletTxData.date = txData.date;

    let createdTx;
    try {
      createdTx = await handleCreateTransaction(walletTxData);
    } catch (err) {
      showToast('Gagal membuat transaksi penjualan.');
      throw err;
    }

    // Add investment transaction entry
    const invTx = {
      id: 'itx_' + Date.now(),
      type: 'sell',
      date: txData.date,
      units: txData.units,
      pricePerUnit: txData.pricePerUnit,
      totalAmount: txData.totalAmount,
      walletId: txData.walletId,
      note: txData.note || '',
      walletTxId: createdTx?.id || '',
    };

    const updatedTransactions = [...(investment.transactions || []), invTx];
    const updateData = {
      transactions: updatedTransactions,
      lastUpdated: new Date().toISOString().slice(0, 10),
    };

    if (IS_LOCAL_MODE) {
      setInvestments((items) => items.map((i) => (i.id === investmentId ? { ...i, ...updateData } : i)));
      showToast('Penjualan berhasil dicatat.');
      return;
    }

    try {
      await api.updateInvestment(investmentId, updateData);
      setInvestments((items) => items.map((i) => (i.id === investmentId ? { ...i, ...updateData } : i)));
      showToast('Penjualan berhasil dicatat.');
    } catch (err) {
      showToast(err.message || 'Gagal mencatat penjualan.');
      throw err;
    }
  };

  /** Update current value of an investment */
  const handleUpdateInvestmentValue = async (investmentId, value) => {
    const error = validateCurrentValue(value);
    if (error) {
      showToast(error);
      throw new Error(error);
    }

    const updateData = {
      currentValue: value,
      lastUpdated: new Date().toISOString().slice(0, 10),
    };

    if (IS_LOCAL_MODE) {
      setInvestments((items) => items.map((i) => (i.id === investmentId ? { ...i, ...updateData } : i)));
      showToast('Nilai investasi berhasil diperbarui.');
      return;
    }

    try {
      await api.updateInvestment(investmentId, updateData);
      setInvestments((items) => items.map((i) => (i.id === investmentId ? { ...i, ...updateData } : i)));
      showToast('Nilai investasi berhasil diperbarui.');
    } catch (err) {
      showToast(err.message || 'Gagal memperbarui nilai investasi.');
      throw err;
    }
  };

  // ── Subscription handlers ────────────────────────────────────────

  /** Create a subscription record */
  const handleCreateSubscription = async (data) => {
    if (IS_LOCAL_MODE) {
      const created = { id: 'sub_' + Date.now(), ...data, createdAt: new Date().toISOString().slice(0, 10), lastPaidDate: '' };
      setSubscriptions((items) => [...items, created]);
      showToast('Langganan berhasil ditambahkan.');
      return created;
    }
    try {
      const created = await api.createSubscription(data);
      setSubscriptions((items) => [...items, created]);
      showToast('Langganan berhasil ditambahkan.');
      return created;
    } catch (err) {
      showToast(err.message || 'Gagal membuat langganan.');
      throw err;
    }
  };

  /** Update a subscription record */
  const handleUpdateSubscription = async (id, data) => {
    if (IS_LOCAL_MODE) {
      setSubscriptions((items) => items.map((i) => (i.id === id ? { ...i, ...data } : i)));
      showToast('Langganan berhasil diubah.');
      return { id, ...data };
    }
    try {
      await api.updateSubscription(id, data);
      setSubscriptions((items) => items.map((i) => (i.id === id ? { ...i, ...data } : i)));
      showToast('Langganan berhasil diubah.');
      return { id, ...data };
    } catch (err) {
      showToast(err.message || 'Gagal mengubah langganan.');
      throw err;
    }
  };

  /** Delete a subscription record */
  const handleDeleteSubscription = async (id) => {
    if (IS_LOCAL_MODE) {
      setSubscriptions((items) => items.filter((i) => i.id !== id));
      showToast('Langganan berhasil dihapus.');
      return;
    }
    try {
      await api.deleteSubscription(id);
      setSubscriptions((items) => items.filter((i) => i.id !== id));
      showToast('Langganan berhasil dihapus.');
    } catch (err) {
      showToast(err.message || 'Gagal menghapus langganan.');
      throw err;
    }
  };

  /** Pay a subscription: create expense transaction + advance due date */
  const handlePaySubscription = async (id, payData) => {
    const subscription = subscriptions.find((s) => s.id === id);
    if (!subscription) {
      showToast('Langganan tidak ditemukan.');
      return;
    }

    // Build and create the expense transaction
    const txData = buildSubscriptionTransaction(subscription, payData.date, payData.walletId);
    try {
      await handleCreateTransaction(txData);
    } catch (err) {
      showToast('Gagal membuat transaksi pembayaran.');
      throw err;
    }

    // Update subscription: advance due date + record last paid
    const updateData = { lastPaidDate: payData.date };
    if (payData.advanceDueDate) {
      updateData.nextDueDate = advanceDueDate(subscription.nextDueDate, subscription.billingCycle);
    }

    await handleUpdateSubscription(id, updateData);
    showToast('Pembayaran langganan berhasil dicatat.');
  };

  // ── Fixed Asset handlers ───────────────────────────────────────────

  /** Create a fixed asset record */
  const handleCreateFixedAsset = async (data) => {
    if (IS_LOCAL_MODE) {
      const created = { id: 'fa_' + Date.now(), ...data, createdAt: new Date().toISOString().slice(0, 10) };
      setFixedAssets((items) => [...items, created]);
      showToast('Aset tetap berhasil ditambahkan.');
      return created;
    }
    try {
      const created = await api.createFixedAsset(data);
      setFixedAssets((items) => [...items, created]);
      showToast('Aset tetap berhasil ditambahkan.');
      return created;
    } catch (err) {
      showToast(err.message || 'Gagal membuat aset tetap.');
      throw err;
    }
  };

  /** Update a fixed asset record */
  const handleUpdateFixedAsset = async (id, data) => {
    if (IS_LOCAL_MODE) {
      setFixedAssets((items) => items.map((i) => (i.id === id ? { ...i, ...data } : i)));
      showToast('Aset tetap berhasil diubah.');
      return { id, ...data };
    }
    try {
      await api.updateFixedAsset(id, data);
      setFixedAssets((items) => items.map((i) => (i.id === id ? { ...i, ...data } : i)));
      showToast('Aset tetap berhasil diubah.');
      return { id, ...data };
    } catch (err) {
      showToast(err.message || 'Gagal mengubah aset tetap.');
      throw err;
    }
  };

  /** Delete a fixed asset record */
  const handleDeleteFixedAsset = async (id) => {
    if (IS_LOCAL_MODE) {
      setFixedAssets((items) => items.filter((i) => i.id !== id));
      showToast('Aset tetap berhasil dihapus.');
      return;
    }
    try {
      await api.deleteFixedAsset(id);
      setFixedAssets((items) => items.filter((i) => i.id !== id));
      showToast('Aset tetap berhasil dihapus.');
    } catch (err) {
      showToast(err.message || 'Gagal menghapus aset tetap.');
      throw err;
    }
  };

  /** Reset all user data, reload defaults, and navigate to dashboard */
  const handleResetData = async () => {
    await api.resetUserData();
    await fetchAllData();
    setPage('dashboard');
    showToast('Data berhasil direset.');
  };

  /** Save FIRE Calculator settings */
  const handleSaveFireSettings = (settings) => {
    setFireSettings(settings);
    // Persist to Firestore if authenticated
    if (!IS_LOCAL_MODE && user && firebaseDb) {
      try {
        const uid = user.uid;
        const fireDocRef = doc(firebaseDb, 'users', uid, 'preferences', 'fire');
        setDoc(fireDocRef, settings).catch(() => {});
      } catch { /* silent */ }
    }
  };

  /**
   * Apply imported data in the specified mode.
   * @param {Object} importData - Validated data from import file
   * @param {'replace' | 'append'} mode
   * @returns {Promise<{ added?: number, skipped?: number }>}
   */
  const handleImportData = async (importData, mode) => {
    // Handle CSV transaction import (has _csvImport marker)
    if (importData._csvImport) {
      const { transactions: csvTransactions, newCategories } = importData;
      const categoriesCreated = (newCategories || []).length;

      // Compute balance effects for each wallet from the imported transactions
      const balanceEffects = {}; // walletId → net balance change
      for (const tx of (csvTransactions || [])) {
        const amt = tx.amount || 0;
        if (tx.type === 'income' || tx.type === 'adjustment') {
          balanceEffects[tx.walletId] = (balanceEffects[tx.walletId] || 0) + amt;
        } else if (tx.type === 'expense') {
          balanceEffects[tx.walletId] = (balanceEffects[tx.walletId] || 0) - amt;
        } else if (tx.type === 'transfer') {
          balanceEffects[tx.walletId] = (balanceEffects[tx.walletId] || 0) - amt;
          if (tx.toWalletId) {
            balanceEffects[tx.toWalletId] = (balanceEffects[tx.toWalletId] || 0) + amt;
          }
        }
      }

      if (IS_LOCAL_MODE) {
        const snapshot = {
          transactions: [...transactions],
          categories: [...categories],
          wallets: [...wallets],
        };
        try {
          // Add new categories first
          if (newCategories && newCategories.length > 0) {
            setCategories((cs) => [...cs, ...newCategories]);
          }
          // Add transactions
          if (csvTransactions && csvTransactions.length > 0) {
            setTransactions((ts) => [...ts, ...csvTransactions]);
          }
          // Update wallet balances
          setWallets((ws) => ws.map((w) => {
            const effect = balanceEffects[w.id];
            if (effect) return { ...w, balance: w.balance + effect };
            return w;
          }));
          return { added: csvTransactions.length, skipped: 0, categoriesCreated };
        } catch (err) {
          setTransactions(snapshot.transactions);
          setCategories(snapshot.categories);
          setWallets(snapshot.wallets);
          throw err;
        }
      } else {
        try {
          // Import records and their balance effects atomically, without inventing
          // extra wallet-adjustment transactions or overwriting live balances.
          await api.importCSVData({ transactions: csvTransactions || [], newCategories: newCategories || [] });
          await fetchAllData();
          return { added: csvTransactions.length, skipped: 0, categoriesCreated };
        } catch (err) {
          await fetchAllData();
          throw err;
        }
      }
    }

    if (mode === 'replace') {
      const data = normalizeBackupData(importData);
      if (IS_LOCAL_MODE) {
        // Backup wallets already contain their final balances; do not replay transactions.
        setWallets(data.wallets);
        setTransactions(data.transactions);
        setBudgets(data.budgets);
        setCategories(data.categories);
        setRecurringItems(data.recurringItems);
        setSubscriptions(data.subscriptions);
        setDebts(data.debts);
        setInvestments(data.investments);
        setFixedAssets(data.fixedAssets);
        setFireSettings(data.fireSettings);
        const prefs = data.preferences;
        setDarkMode(prefs.darkMode);
        setCycleStart(prefs.cycleStart);
        setSalaryAdjust(prefs.salaryAdjust);
        setPage(prefs.page);
        setPeriodMode(prefs.periodMode);
        setCustomRanges(prefs.customRanges);
        setDensity(prefs.density);
        setRadius(prefs.radius);
        setCollapsed(prefs.collapsed);
        setYearMode(prefs.yearMode);
        return { added: 0, skipped: 0 };
      } else {
        // Suspend preference auto-save while replacing cloud data.
        setDataLoading(true);
        try {
          await api.resetUserData({ initializeDefaults: false });
          await api.migrateData(data);
          await fetchAllData({ initializeDefaults: false });
          return { added: 0, skipped: 0 };
        } catch (err) {
          await fetchAllData({ initializeDefaults: false });
          throw err;
        } finally {
          setDataLoading(false);
        }
      }
    } else {
      // Append mode
      const existingData = { wallets, transactions, budgets, categories, recurringItems, subscriptions, debts, investments, fixedAssets };
      const { toAdd, counts } = computeAppend(importData, existingData);

      if (IS_LOCAL_MODE) {
        setWallets((ws) => [...ws, ...toAdd.wallets]);
        setTransactions((ts) => [...ts, ...toAdd.transactions]);
        setBudgets((bs) => ({ ...bs, ...toAdd.budgets }));
        setCategories((cs) => [...cs, ...toAdd.categories]);
        setRecurringItems((items) => [...items, ...(toAdd.recurringItems || [])]);
        setSubscriptions((items) => [...items, ...(toAdd.subscriptions || [])]);
        setDebts((items) => [...items, ...(toAdd.debts || [])]);
        setInvestments((items) => [...items, ...(toAdd.investments || [])]);
        setFixedAssets((items) => [...items, ...(toAdd.fixedAssets || [])]);
        return counts;
      } else {
        // Authenticated mode: migrate only new items, then refresh
        try {
          await api.migrateData(toAdd);
          await fetchAllData();
          return counts;
        } catch (err) {
          await fetchAllData();
          throw err;
        }
      }
    }
  };

  // Cloud children cannot replay balances or overwrite newer SDK snapshots.
  const apiSetWallets = value => { if (IS_LOCAL_MODE) setWallets(value); };
  const apiSetTransactions = value => { if (IS_LOCAL_MODE) setTransactions(value); };
  const apiSetCategories = value => { if (IS_LOCAL_MODE) setCategories(value); };

  /** Callback passed to Dashboard to open the global add-transaction modal */
  const onAddTx = (type = 'expense') => {
    setAddTxType(type);
    setShowAddTx(true);
  };

  /** Render the active page based on `page` state */
  /**
   * Per-page content width.
   *
   * The revamp dropped the old `.pageMeasure` / `.pageMeasureTight` classes, so
   * every page inherited the single container width. That was invisible at
   * 1180px but wrong once the container grows on a large display: the Settings
   * form measured 1510px from label to input, and a transaction row stretched
   * to 1560px, which puts the note and the amount at opposite ends of the
   * screen. Three widths, chosen by what the page is made of:
   *
   *   (none)  dashboard — it has its own two-column grid and wants the room
   *   wide   data tables and lists, which benefit from horizontal space
   *   narrow forms and prose, which need a short line
   */
  const measure = PAGE_MEASURE[page] || '';

  function renderPage() {
    switch (page) {
      case 'dashboard':
        return (
          <Dashboard
            wallets={wallets}
            transactions={transactions}
            budgets={budgets}
            setPage={setPage}
            onAddTx={onAddTx}
            categories={categories}
            recurringItems={recurringItems}
            debts={debts}
            investments={investments}
            fixedAssets={fixedAssets}
            subscriptions={subscriptions}
            yearMode={yearMode}
            onToggleYear={setYearMode}
          />
        );
      case 'wallet':
        return (
          <WalletPage
            wallets={wallets}
            setWallets={apiSetWallets}
            transactions={transactions}
            setTransactions={apiSetTransactions}
            onCreateWallet={handleCreateWallet}
            onUpdateWallet={handleUpdateWallet}
            onDeleteWallet={handleDeleteWallet}
            onCreateTransaction={handleCreateTransaction}
          />
        );
      case 'tx':
        return (
          <TransactionsPage
            wallets={wallets}
            setWallets={apiSetWallets}
            transactions={transactions}
            setTransactions={apiSetTransactions}
            categories={categories}
            onCreateTransaction={handleCreateTransaction}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
          />
        );
      case 'budget':
        return (
          <BudgetPage
            budgets={budgets}
            setBudgets={handleSetBudgets}
            transactions={transactions}
            categories={categories}
            setCategories={apiSetCategories}
            cycleStart={cycleStart}
            setCycleStart={handleSetCycleStart}
            salaryAdjust={salaryAdjust}
            setSalaryAdjust={handleSetSalaryAdjust}
            periodMode={periodMode}
            setPeriodMode={handleSetPeriodMode}
            customRanges={customRanges}
            setCustomRanges={handleSetCustomRanges}
            onCreateCategory={handleCreateCategory}
            onUpdateCategory={handleUpdateCategory}
            onDeleteCategory={handleDeleteCategory}
            recurringItems={recurringItems}
          />
        );
      case 'recurring':
        return (
          <RecurringPage
            recurringItems={recurringItems}
            categories={categories}
            wallets={wallets}
            onCreateItem={handleCreateRecurringItem}
            onUpdateItem={handleUpdateRecurringItem}
            onDeleteItem={handleDeleteRecurringItem}
            onRepurchase={handleRepurchaseItem}
          />
        );
      case 'subscription':
        return (
          <SubscriptionPage
            subscriptions={subscriptions}
            wallets={wallets}
            onCreateSubscription={handleCreateSubscription}
            onUpdateSubscription={handleUpdateSubscription}
            onDeleteSubscription={handleDeleteSubscription}
            onPaySubscription={handlePaySubscription}
          />
        );
      case 'debt':
        return (
          <DebtPage
            debts={debts}
            wallets={wallets}
            onCreateDebt={handleCreateDebt}
            onUpdateDebt={handleUpdateDebt}
            onDeleteDebt={handleDeleteDebt}
            onRecordPayment={handleRecordPayment}
          />
        );
      case 'invest':
        return (
          <InvestmentPage
            investments={investments}
            wallets={wallets}
            onCreateInvestment={handleCreateInvestment}
            onUpdateInvestment={handleUpdateInvestment}
            onDeleteInvestment={handleDeleteInvestment}
            onRecordBuy={handleRecordBuy}
            onRecordSell={handleRecordSell}
            onUpdateValue={handleUpdateInvestmentValue}
          />
        );
      case 'asset':
        return (
          <AssetPage
            wallets={wallets}
            debts={debts}
            investments={investments}
            transactions={transactions}
            fixedAssets={fixedAssets}
            onCreateFixedAsset={handleCreateFixedAsset}
            onUpdateFixedAsset={handleUpdateFixedAsset}
            onDeleteFixedAsset={handleDeleteFixedAsset}
          />
        );
      case 'report':
        return (
          <ReportsPage
            transactions={transactions}
            budgets={budgets}
            cycleStart={cycleStart}
            setCycleStart={handleSetCycleStart}
            salaryAdjust={salaryAdjust}
            categories={categories}
            recurringItems={recurringItems}
          />
        );
      case 'fire':
        return (
          <FirePage
            transactions={transactions}
            investments={investments}
            setPage={setPage}
            onSaveFireSettings={handleSaveFireSettings}
            fireSettings={fireSettings}
          />
        );
      case 'settings':
        return (
          <SettingsPage
            onResetData={handleResetData}
            wallets={wallets}
            transactions={transactions}
            budgets={budgets}
            categories={categories}
            recurringItems={recurringItems}
            subscriptions={subscriptions}
            debts={debts}
            investments={investments}
            fixedAssets={fixedAssets}
            fireSettings={fireSettings}
            preferences={{ darkMode, cycleStart, salaryAdjust, page, periodMode, customRanges, density, radius, collapsed, yearMode }}
            onImportData={handleImportData}
            showToast={showToast}
            onCreateCategory={handleCreateCategory}
            onUpdateCategory={handleUpdateCategory}
            onDeleteCategory={handleDeleteCategory}
            appearance={{
              darkMode,
              setDarkMode: handleSetDarkMode,
              density,
              setDensity,
              radius,
              setRadius,
            }}
            setPage={setPage}
          />
        );
      case 'help':
        return <HelpPage setPage={setPage} />;
      default:
        return (
          <Dashboard
            wallets={wallets}
            transactions={transactions}
            budgets={budgets}
            setPage={setPage}
            onAddTx={onAddTx}
            categories={categories}
          />
        );
    }
  }

  return (
    <ThemeProvider
      darkMode={darkMode}
      setDarkMode={handleSetDarkMode}
      density={density}
      radius={radius}
      collapsed={collapsed}
    >
      <div className="appShell">
        <Sidebar
          page={page}
          setPage={setPage}
          darkMode={darkMode}
          setDarkMode={handleSetDarkMode}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          user={user}
          onLogout={logout}
          onAddTx={onAddTx}
        />
        <main className="appMain">
          {/* The circular `+` is a fallback for pages that do not declare their
              own primary action. Transactions and Budget do (via
              `usePageActions`), so passing `onAddTx` unconditionally put a
              second, icon-only way to do the same thing right beside the first
              — and offered a "new transaction" button on pages with no
              transaction UI at all. */}
          <Topbar
            page={page}
            onAddTx={TOPBAR_FALLBACK_ADD_TX.has(page) ? onAddTx : undefined}
            user={user}
          />
          <div className="appScroll">
            <div className={`container${measure ? ` ${measure}` : ''}`}>{renderPage()}</div>
          </div>
        </main>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="toastHost">
          <div className="toast" role="status">
            {toast}
          </div>
        </div>
      )}

      {/* Global Add Transaction modal */}
      {showAddTx && (
        <TxFormModal
          wallets={wallets}
          categories={categories}
          presetType={addTxType}
          onClose={() => setShowAddTx(false)}
          onSave={async (data) => {
            try {
              await handleCreateTransaction(data);
              setShowAddTx(false);
            } catch {
              // Error already shown via toast
            }
          }}
        />
      )}

      {/* Help Chat floating widget */}
      <HelpChat />
    </ThemeProvider>
  );
}

export default App;
