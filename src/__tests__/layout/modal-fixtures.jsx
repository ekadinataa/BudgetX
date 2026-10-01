/* Browser-only visual fixtures. Callbacks are recorded, never persisted. */
import { createRoot } from 'react-dom/client';
import { WALLETS_INIT, CATEGORIES, BUDGETS_INIT } from '../../data/defaults';
import TxFormModal from '../../pages/Transactions/TxFormModal';
import WalletFormModal from '../../pages/Wallet/WalletFormModal';
import TransferModal from '../../pages/Wallet/TransferModal';
import IncomeModal from '../../pages/Budget/IncomeModal';
import SectionEditModal from '../../pages/Budget/SectionEditModal';
import PeriodModal from '../../pages/Budget/PeriodModal';
import PeriodTransitionModal from '../../pages/Budget/PeriodTransitionModal';
import RecurringFormModal from '../../pages/Recurring/RecurringFormModal';
import RepurchaseModal from '../../pages/Recurring/RepurchaseModal';
import SubscriptionFormModal from '../../pages/Subscription/SubscriptionFormModal';
import PayModal from '../../pages/Subscription/PayModal';
import DebtFormModal from '../../pages/Debt/DebtFormModal';
import PaymentModal from '../../pages/Debt/PaymentModal';
import InvestmentFormModal from '../../pages/Investment/InvestmentFormModal';
import BuyModal from '../../pages/Investment/BuyModal';
import SellModal from '../../pages/Investment/SellModal';
import UpdateValueModal from '../../pages/Investment/UpdateValueModal';
import FixedAssetFormModal from '../../pages/Asset/FixedAssetFormModal';
import CycleSettingModal from '../../pages/Reports/CycleSettingModal';
import ImportConfirmModal from '../../pages/Settings/ImportConfirmModal';
import ResetConfirmModal from '../../pages/Settings/ResetConfirmModal';
import LoginPage from '../../pages/Auth/LoginPage';
import RegisterPage from '../../pages/Auth/RegisterPage';
import ForgotPasswordPage from '../../pages/Auth/ForgotPasswordPage';

let root;
const today = new Date().toISOString().slice(0, 10);
const investment = { id: 'visual-investment', name: 'Reksa Dana', assetType: 'reksadana', currentValuePerUnit: 2500, transactions: [{ id: 'visual-buy', type: 'buy', date: today, units: 1000, pricePerUnit: 2000, totalAmount: 2000000 }] };
const item = { id: 'visual-recurring', name: 'Perawatan wajah', amount: 250000, durationDays: 30, categoryId: 'c4', purchaseDate: today, isActive: true };
const debt = { id: 'visual-debt', type: 'utang', personName: 'Kredit Mobil', totalAmount: 50000000, remainingAmount: 30000000, interestEnabled: true, interestRate: 6, tenorMonths: 24, startDate: today, dueDate: today, payments: [] };
const subscription = { id: 'visual-sub', name: 'Netflix', amount: 186000, billingCycle: 'monthly', nextDueDate: today, isActive: true, walletId: 'w1' };

export function mountModalFixture(kind) {
  root?.unmount();
  document.getElementById('visual-modal-fixture')?.remove();
  const host = document.createElement('div');
  host.id = 'visual-modal-fixture';
  document.body.append(host);
  root = createRoot(host);
  window.__visualEvents = [];
  const record = name => async (...args) => { window.__visualEvents.push({ name, args }); return { id: 'visual-created' }; };
  const common = { onClose: record('close'), onSave: record('save'), onConfirm: record('confirm'), onDelete: record('delete'), wallets: WALLETS_INIT, categories: CATEGORIES };
  const budget = Object.values(BUDGETS_INIT)[0];
  const cases = {
    login: <LoginPage onLogin={record('login')} onNavigate={record('navigate')} />,
    register: <RegisterPage onRegister={record('register')} onNavigate={record('navigate')} />,
    forgot: <ForgotPasswordPage onResetPassword={record('reset-password')} onNavigate={record('navigate')} />,
    transaction: <TxFormModal {...common} />,
    wallet: <WalletFormModal {...common} title="Tambah Dompet" />,
    transfer: <TransferModal {...common} />,
    income: <IncomeModal {...common} current={12000000} />,
    allocation: <SectionEditModal {...common} section="needs" data={budget.sections.needs} setCategories={() => {}} onCreateCategory={record('category-create')} onUpdateCategory={record('category-update')} />,
    'allocation-empty': <SectionEditModal {...common} section="wants" data={{ total: 0, cats: [] }} setCategories={() => {}} />,
    period: <PeriodModal {...common} currentMode="month" currentCycleStart={25} currentSalaryAdjust={false} />,
    transition: <PeriodTransitionModal {...common} previousPeriod={{ id: 'visual-period', name: 'Periode sebelumnya', start: '2026-09-01', end: '2026-09-30' }} onCreatePeriod={record('period-create')} />,
    recurring: <RecurringFormModal {...common} />,
    repurchase: <RepurchaseModal {...common} item={item} />,
    subscription: <SubscriptionFormModal {...common} />,
    pay: <PayModal {...common} subscription={subscription} />,
    debt: <DebtFormModal {...common} />,
    payment: <PaymentModal {...common} debt={debt} />,
    investment: <InvestmentFormModal {...common} />,
    buy: <BuyModal {...common} investment={investment} />,
    sell: <SellModal {...common} investment={investment} />,
    value: <UpdateValueModal {...common} investment={investment} />,
    asset: <FixedAssetFormModal {...common} />,
    cycle: <CycleSettingModal {...common} current={25} />,
    import: <ImportConfirmModal {...common} importSummary={{ wallets: 6, transactions: 35, budgets: 1, categories: 18 }} />,
    reset: <ResetConfirmModal {...common} />,
  };
  if (['login', 'register', 'forgot'].includes(kind)) {
    Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '2000', overflow: 'auto' });
  }
  if (!cases[kind]) throw new Error(`Unknown modal fixture: ${kind}`);
  root.render(cases[kind]);
}
