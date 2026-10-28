import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({ user: { uid: 'mock-deposito-user' }, listeners: [], props: null }));
const investment = { id: 'deposit', name: 'Deposito Uji', assetType: 'deposito', principal: 10000000, depositDate: '2026-10-01', interestRate: 0, currentValue: 0, transactions: [] };
vi.mock('../../config/firebase', () => ({ auth: { currentUser: state.user }, db: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(async () => ({ exists: () => false })), setDoc: vi.fn() }));
vi.mock('../../pages/Investment/InvestmentPage', () => ({ default: props => { state.props = props; return <div>Investasi uji</div>; } }));
vi.mock('../../services/firestoreService', () => ({
  initUser: vi.fn(async () => {}),
  subscribeWishlistGroups: vi.fn((uid, onData) => { onData([]); return vi.fn(); }),
  subscribeUserData: vi.fn((uid, handlers) => { state.listeners.push(handlers); return vi.fn(); }),
  getBudgets: vi.fn(async () => ({})), getPreferences: vi.fn(async () => ({ page: 'invest' })),
  getRecurringItems: vi.fn(async () => []), getDebts: vi.fn(async () => []), getInvestments: vi.fn(),
  getFixedAssets: vi.fn(async () => []), getSubscriptions: vi.fn(async () => []), updatePreferences: vi.fn(),
  createTransaction: vi.fn(async data => ({ id: 'wallet-tx', ...data })), updateInvestment: vi.fn(async () => {}),
}));
import App from '../../App';
import * as api from '../../services/firestoreService';

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); state.listeners = []; state.props = null;
  api.getInvestments.mockResolvedValue([structuredClone(investment)]);
});
afterEach(cleanup);
async function open() {
  render(<App />);
  await waitFor(() => expect(state.listeners).toHaveLength(1));
  await act(async () => {
    state.listeners[0].wallets([{ id: 'bank', name: 'Bank Uji', type: 'bank', balance: 10000000 }]);
    state.listeners[0].transactions([]); state.listeners[0].categories([]);
  });
  await waitFor(() => expect(state.props?.investments).toHaveLength(1));
}

it('rejects a backdated redemption before creating a cloud wallet transaction', async () => {
  await open();
  await act(async () => {
    await expect(state.props.onRecordSell('deposit', { units: 1, pricePerUnit: 10000000, totalAmount: 10000000, walletId: 'bank', date: '2026-09-30' })).rejects.toThrow(/Unit jual melebihi posisi/);
  });
  expect(api.createTransaction).not.toHaveBeenCalled();
  expect(api.updateInvestment).not.toHaveBeenCalled();
  expect(state.props.investments[0]).toEqual(investment);
});

it('accepts a valid same-day redemption and closes the opening holding', async () => {
  await open();
  await act(async () => {
    await state.props.onRecordSell('deposit', { units: 1, pricePerUnit: 10000000, totalAmount: 10000000, walletId: 'bank', date: '2026-10-01' });
  });
  expect(api.createTransaction).toHaveBeenCalledOnce();
  expect(api.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: 'income', amount: 10000000, date: '2026-10-01', walletId: 'bank' }));
  expect(api.updateInvestment).toHaveBeenCalledOnce();
  expect(state.props.investments[0].transactions).toHaveLength(1);
});

it('rejects asset type changes at the App cloud boundary before any service write', async () => {
  await open();
  await act(async () => {
    await expect(state.props.onUpdateInvestment('deposit', { assetType: 'saham' })).rejects.toThrow(/Jenis aset tidak boleh diubah/);
  });
  expect(api.updateInvestment).not.toHaveBeenCalled();
  expect(api.createTransaction).not.toHaveBeenCalled();
  expect(state.props.investments[0]).toEqual(investment);
});
