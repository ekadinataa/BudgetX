import { useEffect } from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
const mock = vi.hoisted(() => ({ user: { uid: 'owner' }, auth: { currentUser: { uid: 'owner' } }, reviews: [], financial: [], props: null }));
vi.mock('../../config/firebase', () => ({ auth: mock.auth, db: null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mock.user, loading: false }) }));
vi.mock('../../services/financialReviewService', () => ({
  subscribeFinancialReviews: vi.fn((uid, onData, onError, onSync) => { const stop = vi.fn(); mock.reviews.push({ uid, onData, onError, onSync, stop }); return stop; }),
  submitFinancialReviewDecision: vi.fn(async () => ({})),
}));
vi.mock('../../services/firestoreService', () => ({
  initUser: vi.fn(async () => {}),
  subscribeUserData: vi.fn((uid, handlers) => {
    const stop = vi.fn(); mock.financial.push({ uid, handlers, stop });
    handlers.wallets([{ id: uid + '-wallet', name: 'Bank', balance: 1000 }]);
    handlers.transactions([{ id: uid + '-tx', date: '2026-10-01', amount: 100, type: 'income', note: '' }]);
    handlers.categories([]); return stop;
  }),
  subscribeWishlistGroups: vi.fn((uid, onData) => { onData([]); return vi.fn(); }),
  getBudgets: vi.fn(async () => ({})), getPreferences: vi.fn(async () => ({ page: 'tx' })),
  getRecurringItems: vi.fn(async () => []), getDebts: vi.fn(async () => []), getInvestments: vi.fn(async () => []),
  getFixedAssets: vi.fn(async () => []), getSubscriptions: vi.fn(async () => []), updatePreferences: vi.fn(),
}));
vi.mock('../../pages/Transactions/TransactionsPage', () => ({ default: function Captured(props) {
  useEffect(() => { mock.props = props; });
  return <pre data-testid="transaction-page">{JSON.stringify({ wallets: props.wallets, transactions: props.transactions, reviews: props.reviewQueue.reviews, error: props.reviewQueue.error })}</pre>;
} }));
import App from '../../App';
import * as service from '../../services/financialReviewService';
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mock.user = { uid: 'owner' }; mock.auth.currentUser = mock.user; mock.reviews = []; mock.financial = []; mock.props = null; });
afterEach(cleanup);
const review = { schemaVersion: 1, id: 'a'.repeat(64), version: 'b'.repeat(16), kind: 'receipt', state: 'pending', amount: 10, fee: 0, choices: [{ action: 'expense', source: 'bank', destination: 'EXTERNAL' }] };
it('App review failures leave financial snapshots intact and retries only the review listener', async () => {
  render(<App />); await screen.findByTestId('transaction-page');
  const before = { wallets: mock.props.wallets, transactions: mock.props.transactions };
  await act(async () => mock.reviews[0].onData([review]));
  await act(async () => mock.reviews[0].onError(new Error('offline')));
  expect(mock.props.reviewQueue.error).toMatch(/Gagal/);
  expect(mock.props.wallets).toEqual(before.wallets); expect(mock.props.transactions).toEqual(before.transactions);
  await act(async () => mock.props.reviewQueue.onRetry());
  expect(mock.reviews).toHaveLength(2); expect(mock.financial).toHaveLength(1);
  expect(mock.reviews[0].stop).toHaveBeenCalledOnce();
  await act(async () => mock.reviews[1].onData([review]));
  await act(async () => mock.props.reviewQueue.onDecision(review, review.choices[0]));
  expect(service.submitFinancialReviewDecision).toHaveBeenCalledOnce();
  expect(mock.props.wallets).toEqual(before.wallets); expect(mock.props.transactions).toEqual(before.transactions);
  expect(mock.props.reviewQueue.reviews[0].state).toBe('pending');
});
it('App drops old-UID review callbacks on account switch and logout without leaking old money', async () => {
  const view = render(<App />); await screen.findByTestId('transaction-page');
  const first = mock.reviews[0];
  await act(async () => first.onData([review]));
  const oldSubmit = mock.props.reviewQueue.onDecision;
  mock.user = { uid: 'other' }; mock.auth.currentUser = mock.user;
  view.rerender(<App />);
  await waitFor(() => expect(mock.reviews).toHaveLength(2));
  await screen.findByTestId('transaction-page');
  expect(first.stop).toHaveBeenCalledOnce();
  await act(async () => first.onData([review]));
  expect(mock.props.reviewQueue.reviews).toEqual([]);
  expect(mock.props.wallets[0].id).toBe('other-wallet');
  await expect(oldSubmit(review, review.choices[0])).rejects.toThrow(/Sesi/);
  const second = mock.reviews[1];
  mock.user = null; mock.auth.currentUser = null; view.rerender(<App />);
  await waitFor(() => expect(second.stop).toHaveBeenCalledOnce());
  expect(screen.queryByTestId('transaction-page')).not.toBeInTheDocument();
  await act(async () => { first.onData([review]); second.onData([review]); });
  expect(screen.queryByTestId('transaction-page')).not.toBeInTheDocument();
  expect(service.submitFinancialReviewDecision).not.toHaveBeenCalled();
});
