import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { STORAGE_KEY } from '../../utils/constants';
vi.mock('../../config/firebase', () => ({ auth: null, db: null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('../../services/firestoreService', () => ({ subscribeUserData: vi.fn(), initUser: vi.fn(), createTransaction: vi.fn() }));
vi.mock('../../pages/Transactions/TransactionsPage', () => ({ default: props => <>
  <pre data-testid="data">{JSON.stringify(props)}</pre>
  <button onClick={() => props.onCreateTransaction({ walletId: 'w1', type: 'expense', amount: 3, categoryId: null })}>create local</button>
</> }));
import App from '../../App';
import * as api from '../../services/firestoreService';
afterEach(() => { cleanup(); localStorage.clear(); });
it('retains localStorage CRUD without listeners or cloud initialization', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ page: 'tx', wallets: [{ id: 'w1', balance: -42, creditLimit: 100 }], transactions: [], categories: [] }));
  render(<App />);
  await act(async () => { fireEvent.click(screen.getByText('create local')); });
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  expect(saved.transactions).toHaveLength(1);
  expect(saved.transactions[0]).toMatchObject({ walletId: 'w1', amount: 3, categoryId: null });
  expect(saved.wallets).toEqual([{ id: 'w1', balance: -42, creditLimit: 100 }]);
  expect(api.subscribeUserData).not.toHaveBeenCalled();
  expect(api.initUser).not.toHaveBeenCalled();
  expect(api.createTransaction).not.toHaveBeenCalled();
});
