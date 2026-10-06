import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({ user: { uid: 'first' }, auth: { currentUser: { uid: 'first' } }, listeners: [] }));
vi.mock('../../config/firebase', () => ({ auth: state.auth, db: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(async () => ({ exists: () => false })), setDoc: vi.fn() }));
vi.mock('../../services/firestoreService', () => ({
  initUser: vi.fn(async () => {}),
  subscribeUserData: vi.fn((uid, handlers, error) => {
    const stop = vi.fn();
    state.listeners.push({ uid, handlers, error, stop });
    return stop;
  }),
  getWallets: vi.fn(async () => [{ id: 'stale' }]),
  getTransactions: vi.fn(async () => [{ id: 'stale' }]),
  getCategories: vi.fn(async () => [{ id: 'stale' }]),
  getBudgets: vi.fn(async () => ({})),
  getPreferences: vi.fn(async () => ({ page: 'tx' })),
  getRecurringItems: vi.fn(async () => []), getDebts: vi.fn(async () => []),
  getInvestments: vi.fn(async () => []), getFixedAssets: vi.fn(async () => []), getSubscriptions: vi.fn(async () => []),
  updatePreferences: vi.fn(), createTransaction: vi.fn(), updateTransaction: vi.fn(),
  updateTransactionCategory: vi.fn(), deleteTransaction: vi.fn(),
}));
vi.mock('../../pages/Dashboard/Dashboard', () => ({ default: props => <pre data-testid="data">{JSON.stringify(props)}</pre> }));
vi.mock('../../pages/Transactions/TransactionsPage', () => ({ default: props => <>
  <pre data-testid="data">{JSON.stringify(props)}</pre>
  <button onClick={() => props.onCreateTransaction({ amount: 2 })}>create</button>
  <button onClick={() => props.onUpdateTransaction('tx1', { ...props.transactions[0], categoryId: 'c2' })}>category</button>
  <button onClick={() => props.onDeleteTransaction('tx1')}>delete</button>
</> }));
import App from '../../App';
import * as api from '../../services/firestoreService';

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); state.listeners = [];
  state.user = { uid: 'first' }; state.auth.currentUser = state.user;
  api.getPreferences.mockResolvedValue({ page: 'tx' });
});
afterEach(cleanup);
const data = () => JSON.parse(screen.getByTestId('data').textContent);
async function snapshot(listener, overrides = {}) {
  await act(async () => {
    for (const [key, value] of Object.entries({ wallets: [{ id: 'w1', balance: -42 }], transactions: [{ id: 'tx1', categoryId: null }], categories: [], ...overrides })) listener.handlers[key](value);
  });
}

it('keeps snapshots authoritative when create/delete responses finish after newer snapshots', async () => {
  let resolveCreate;
  api.createTransaction.mockReturnValueOnce(new Promise(resolve => { resolveCreate = resolve; }));
  render(<App />);
  await waitFor(() => expect(state.listeners).toHaveLength(1));
  const listener = state.listeners[0];
  await snapshot(listener);
  await screen.findByText('create');
  fireEvent.click(screen.getByText('create'));
  await snapshot(listener, { transactions: [{ id: 'created', amount: 9 }, { id: 'external' }], wallets: [{ id: 'w1', balance: -99 }] });
  await act(async () => { resolveCreate({ id: 'created', amount: 2 }); });
  expect(data().transactions).toEqual([{ id: 'created', amount: 9 }, { id: 'external' }]);
  expect(data().wallets).toEqual([{ id: 'w1', balance: -99 }]);
  let resolveDelete;
  api.deleteTransaction.mockReturnValueOnce(new Promise(resolve => { resolveDelete = resolve; }));
  fireEvent.click(screen.getByText('delete'));
  await snapshot(listener, { transactions: [{ id: 'tx1', note: 'recreated' }] });
  await act(async () => { resolveDelete(); });
  expect(data().transactions).toEqual([{ id: 'tx1', note: 'recreated' }]);
  expect(api.getWallets).not.toHaveBeenCalled();
});

it('routes a category-only edit to metadata-only API, preserving snapshot balances and extras', async () => {
  render(<App />);
  await waitFor(() => expect(state.listeners).toHaveLength(1));
  const tx = { id: 'tx1', date: '2026-10-01', walletId: 'w1', type: 'expense', amount: 42, categoryId: null, note: 'mesh', tags: [], mesh: { canonical_event_id: 'event1' }, category_source: 'rule' };
  await snapshot(state.listeners[0], { transactions: [tx] });
  await screen.findByText('category');
  await act(async () => { fireEvent.click(screen.getByText('category')); });
  expect(api.updateTransactionCategory).toHaveBeenCalledWith('tx1', 'c2');
  expect(api.updateTransaction).not.toHaveBeenCalled();
  expect(api.getWallets).not.toHaveBeenCalled();
  expect(data().transactions).toEqual([tx]);
  expect(data().wallets[0].balance).toBe(-42);
});

it('requires fresh snapshots when the same UID logs back in', async () => {
  const view = render(<App />);
  await waitFor(() => expect(state.listeners).toHaveLength(1));
  await snapshot(state.listeners[0]);
  await screen.findByTestId('data');
  state.user = null; state.auth.currentUser = null; view.rerender(<App />);
  state.user = { uid: 'first' }; state.auth.currentUser = state.user; view.rerender(<App />);
  await waitFor(() => expect(state.listeners).toHaveLength(2));
  await act(async () => {});
  expect(screen.queryByTestId('data')).not.toBeInTheDocument();
  await snapshot(state.listeners[1], { transactions: [{ id: 'fresh' }] });
  expect(data().transactions).toEqual([{ id: 'fresh' }]);
});

it('cleans listeners on UID change/logout, ignores old snapshots and initial fetch completion', async () => {
  let resolvePrefs;
  api.getPreferences.mockReturnValueOnce(new Promise(resolve => { resolvePrefs = resolve; }));
  const view = render(<App />);
  await waitFor(() => expect(state.listeners).toHaveLength(1));
  const first = state.listeners[0];
  await snapshot(first);
  state.user = { uid: 'second' }; state.auth.currentUser = state.user;
  view.rerender(<App />);
  await waitFor(() => expect(state.listeners).toHaveLength(2));
  expect(first.stop).toHaveBeenCalledOnce();
  await snapshot(state.listeners[1], { transactions: [{ id: 'second-tx' }] });
  await waitFor(() => expect(data().transactions).toEqual([{ id: 'second-tx' }]));
  await act(async () => { resolvePrefs({ page: 'wallet' }); });
  await snapshot(first, { transactions: [{ id: 'late-first-tx' }] });
  expect(data().transactions).toEqual([{ id: 'second-tx' }]);
  expect(api.getWallets).not.toHaveBeenCalled();
  expect(api.getTransactions).not.toHaveBeenCalled();
  expect(api.getCategories).not.toHaveBeenCalled();
  state.user = null; state.auth.currentUser = null; view.rerender(<App />);
  expect(state.listeners[1].stop).toHaveBeenCalledOnce();
});
