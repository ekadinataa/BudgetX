import { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
const mock = vi.hoisted(() => ({ user: { uid: 'owner' }, listeners: [], auth: { currentUser: { uid: 'owner' } } }));
vi.mock('../../services/financialReviewService', () => ({
  subscribeFinancialReviews: vi.fn((uid, onData, onError, onSync) => { const stop = vi.fn(); mock.listeners.push({ uid, onData, onError, onSync, stop }); return stop; }),
  submitFinancialReviewDecision: vi.fn(async () => ({})),
}));
vi.mock('../../config/firebase', () => ({ auth: mock.auth, db: null }));
import { useFinancialReviews, LOCAL_REVIEW_KEY } from '../../hooks/useFinancialReviews';
import * as service from '../../services/financialReviewService';
let queue;
function Harness({ uid = 'owner', localMode = false, enabled = true }) {
  const value = useFinancialReviews({ uid, localMode, enabled });
  useEffect(() => { queue = value; });
  return <><pre data-testid="queue">{JSON.stringify(value)}</pre><button onClick={value.onRetry}>Retry</button></>;
}
const review = { schemaVersion: 1, id: 'a'.repeat(64), version: 'b'.repeat(16), state: 'pending', kind: 'receipt', amount: 100, fee: 0, currency: 'IDR', choices: [{ action: 'expense', source: 'BANK', destination: 'EXTERNAL' }], event_id: null };
const choice = review.choices[0];
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mock.listeners = []; mock.auth.currentUser = { uid: 'owner' }; });
afterEach(cleanup);
it('loads reviews independently and never invents posted state after accepting a cloud decision', async () => {
  render(<Harness />);
  expect(queue.loading).toBe(true);
  await act(async () => mock.listeners[0].onData([review]));
  expect(queue.reviews).toEqual([review]);
  await act(async () => queue.onDecision(review, choice));
  expect(service.submitFinancialReviewDecision).toHaveBeenCalledWith(review, choice);
  expect(queue.reviews[0].state).toBe('pending');
});
it('revokes readiness on server-to-cache transition and recovers only from server data', async () => {
  render(<Harness />);
  await act(async () => mock.listeners[0].onData([review]));
  expect(queue.loading).toBe(false);
  await act(async () => mock.listeners[0].onSync?.(false));
  expect(queue.loading).toBe(true);
  await expect(queue.onDecision(review, choice)).rejects.toThrow(/sinkronisasi/);
  expect(service.submitFinancialReviewDecision).not.toHaveBeenCalled();
  await act(async () => { mock.listeners[0].onSync?.(true); mock.listeners[0].onData([review]); });
  expect(queue.loading).toBe(false);
  await act(async () => queue.onDecision(review, choice));
  expect(service.submitFinancialReviewDecision).toHaveBeenCalledOnce();
});
it('clears account data and ignores stale callbacks and submissions after UID switch', async () => {
  const view = render(<Harness />);
  const first = mock.listeners[0];
  await act(async () => first.onData([review]));
  const oldSubmit = queue.onDecision;
  mock.auth.currentUser = { uid: 'other' }; view.rerender(<Harness uid="other" />);
  expect(queue.reviews).toEqual([]);
  expect(first.stop).toHaveBeenCalledOnce();
  await act(async () => { first.onData([review]); first.onError(new Error('late')); });
  expect(queue.reviews).toEqual([]);
  await expect(oldSubmit(review, choice)).rejects.toThrow(/Sesi|sinkronisasi/);
  expect(service.submitFinancialReviewDecision).not.toHaveBeenCalled();
});
it('shows failures, retries only review listener, and blocks decisions until server data', async () => {
  render(<Harness />);
  await expect(queue.onDecision(review, choice)).rejects.toThrow(/sinkronisasi/);
  await act(async () => mock.listeners[0].onError(new Error('offline')));
  expect(queue.error).toMatch(/Gagal/);
  fireEvent.click(screen.getByText('Retry'));
  await waitFor(() => expect(mock.listeners).toHaveLength(2));
  expect(mock.listeners[0].stop).toHaveBeenCalledOnce();
  await act(async () => mock.listeners[1].onData([]));
  expect(queue.error).toBe(''); expect(queue.loading).toBe(false);
});
it('local approval persists a simulation decision without touching balances or cloud', async () => {
  const money = JSON.stringify({ wallets: [{ id: 'w1', balance: 1000 }], transactions: [] });
  localStorage.setItem('budgetku_state', money);
  localStorage.setItem(LOCAL_REVIEW_KEY, JSON.stringify({ reviews: [review], decisions: {} }));
  render(<Harness uid={null} localMode />);
  await act(async () => queue.onDecision(review, choice));
  expect(queue.reviews[0].state).toBe('approved');
  expect(JSON.parse(localStorage.getItem(LOCAL_REVIEW_KEY)).reviews[0].state).toBe('approved');
  expect(localStorage.getItem('budgetku_state')).toBe(money);
  expect(service.submitFinancialReviewDecision).not.toHaveBeenCalled();
  expect(service.subscribeFinancialReviews).not.toHaveBeenCalled();
  await act(async () => queue.onDecision(review, choice));
  await expect(queue.onDecision(review, { action: 'reject', source: null, destination: null })).rejects.toThrow(/berbeda/);
});
