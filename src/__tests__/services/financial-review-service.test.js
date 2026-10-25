// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
const mock = vi.hoisted(() => ({ auth: { currentUser: { uid: 'owner' } }, db: {}, stop: vi.fn(), store: new Map(), tx: { get: vi.fn(), set: vi.fn() } }));
vi.mock('../../config/firebase', () => ({ db: mock.db, auth: mock.auth }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
  doc: vi.fn((_db, ...parts) => ({ path: parts.join('/'), id: parts.at(-1) })),
  onSnapshot: vi.fn(() => mock.stop), runTransaction: vi.fn(),
}));
import { subscribeFinancialReviews, submitFinancialReviewDecision } from '../../services/financialReviewService.js';
import * as sdk from 'firebase/firestore';

beforeEach(() => {
  vi.clearAllMocks();
  mock.auth.currentUser = { uid: 'owner' };
  mock.store.clear();
  mock.tx.get.mockImplementation(async ref => ({ exists: () => mock.store.has(ref.path), data: () => mock.store.get(ref.path) }));
  mock.tx.set.mockImplementation((ref, data) => mock.store.set(ref.path, data));
  sdk.runTransaction.mockImplementation(async (_db, fn) => fn(mock.tx));
});

const review = (extra = {}) => ({ schemaVersion: 1, id: 'a'.repeat(64), version: 'b'.repeat(16), kind: 'receipt', state: 'pending', choices: [{ action: 'income', source: 'EXTERNAL', destination: 'BANK' }], ...extra });
const reviewPath = `users/owner/financialReviews/${review().id}`;
const decisionPath = `users/owner/financialReviewDecisions/${review().id}--${review().version}`;

const snapshot = (metadata = {}, data = {}) => ({
  metadata, docs: [{ id: 'a'.repeat(64), data: () => ({ ...data }) }],
});

describe('financial review decision submission (mocked transactions)', () => {
  it.each([
    { version: 'c'.repeat(16) }, { id: 'd'.repeat(64) }, { state: 'posted' },
    { state: 'approved' }, { kind: 'delivery' }, { choices: [] },
  ])('rejects stale identity, state or changed choices against fresh mirror: %j', extra => {
    mock.store.set(reviewPath, review(extra));
    return expect(submitFinancialReviewDecision(review(), review().choices[0])).rejects.toThrow();
  });

  it('rejects a missing mirror without writes', async () => {
    await expect(submitFinancialReviewDecision(review(), review().choices[0])).rejects.toThrow();
    expect(mock.tx.set).not.toHaveBeenCalled();
  });

  it('does not replace identical decisions or their timestamps, including after processing', async () => {
    mock.store.set(reviewPath, review());
    const decision = await submitFinancialReviewDecision(review(), review().choices[0]);
    mock.tx.set.mockClear();
    mock.store.set(reviewPath, review({ state: 'posted' }));
    expect(await submitFinancialReviewDecision(review(), review().choices[0])).toEqual(decision);
    expect(mock.tx.set).not.toHaveBeenCalled();
    expect(mock.store.get(decisionPath)).toEqual(decision);
  });

  it('rejects conflicting decisions without overwriting history', async () => {
    mock.store.set(reviewPath, review());
    const existing = { schemaVersion: 1, uid: 'owner', reviewId: review().id, version: review().version, action: 'reject', source: null, destination: null, createdAt: '2026-10-25T00:00:00.000Z' };
    mock.store.set(decisionPath, existing);
    await expect(submitFinancialReviewDecision(review(), review().choices[0])).rejects.toThrow(/keputusan|konfirmasi/i);
    expect(mock.tx.set).not.toHaveBeenCalled();
    expect(mock.store.get(decisionPath)).toEqual(existing);
  });

  it.each([0, 1, 2])('rechecks authentication before transaction, after mirror read and after decision read (stage %i)', async stage => {
    mock.store.set(reviewPath, review());
    if (stage === 0) {
      sdk.runTransaction.mockImplementationOnce(async (_db, fn) => {
        mock.auth.currentUser = { uid: 'other' };
        return fn(mock.tx);
      });
    } else {
      const get = mock.tx.get.getMockImplementation();
      let count = 0;
      mock.tx.get.mockImplementation(async ref => {
        const result = await get(ref);
        if (++count === stage) mock.auth.currentUser = { uid: 'other' };
        return result;
      });
    }
    await expect(submitFinancialReviewDecision(review(), review().choices[0])).rejects.toThrow(/Sesi/);
    expect(mock.tx.set).not.toHaveBeenCalled();
  });

  it('does not report success to the next account after transaction completion', async () => {
    mock.store.set(reviewPath, review());
    sdk.runTransaction.mockImplementationOnce(async (_db, fn) => {
      const result = await fn(mock.tx);
      mock.auth.currentUser = { uid: 'other' };
      return result;
    });
    await expect(submitFinancialReviewDecision(review(), review().choices[0])).rejects.toThrow(/Sesi/);
  });

  it('rejects invalid input and unauthenticated local mode before any Firestore transaction', async () => {
    await expect(submitFinancialReviewDecision(review({ id: '../bad' }), review().choices[0])).rejects.toThrow();
    mock.auth.currentUser = null;
    await expect(submitFinancialReviewDecision(review(), review().choices[0])).rejects.toThrow();
    expect(sdk.runTransaction).not.toHaveBeenCalled();
  });
  it('revalidates new mirror state on SDK transaction retries and does not recreate a decision', async () => {
    mock.store.set(reviewPath, review());
    sdk.runTransaction.mockImplementationOnce(async (_db, fn) => {
      const result = await fn(mock.tx);
      mock.tx.set.mockClear();
      // Simulate another tab's committed identical intent observed on retry.
      return fn(mock.tx).then(retried => {
        expect(retried).toEqual(result);
        expect(mock.tx.set).not.toHaveBeenCalled();
        return retried;
      });
    });
    await expect(submitFinancialReviewDecision(review(), review().choices[0])).resolves.toMatchObject(review().choices[0]);
  });

  it.each(['reject'])('records nonfinancial %s for blocked receipts without effects', async action => {
    const blocked = review({ state: 'blocked', choices: [] });
    mock.store.set(reviewPath, blocked);
    await expect(submitFinancialReviewDecision(blocked, { action })).resolves.toMatchObject({ action, source: null, destination: null });
    expect(mock.tx.set).toHaveBeenCalledTimes(1);
    expect(mock.tx.set.mock.calls[0][0].path).toBe(decisionPath);
    expect(mock.store.get(reviewPath)).toEqual(blocked);
  });

  it('rejects a newly prepared blocked receipt instead of accepting a stale retry', async () => {
    mock.store.set(reviewPath, review({ state: 'blocked', event_id: 'already-prepared' }));
    await expect(submitFinancialReviewDecision(review({ state: 'blocked' }), { action: 'retry' })).rejects.toThrow();
    expect(mock.tx.set).not.toHaveBeenCalled();
  });

  it('propagates SDK errors without any optimistic decision write', async () => {
    sdk.runTransaction.mockRejectedValueOnce(new Error('unavailable'));
    await expect(submitFinancialReviewDecision(review(), review().choices[0])).rejects.toThrow('unavailable');
    expect(mock.tx.set).not.toHaveBeenCalled();
  });

  it('atomically reads mirror and deterministic decision, writes only a strict decision intent', async () => {
    mock.store.set(reviewPath, review());
    const result = await submitFinancialReviewDecision(review(), { ...review().choices[0], amount: 9000 });
    const expected = { schemaVersion: 1, uid: 'owner', reviewId: review().id, version: review().version, ...review().choices[0], createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) };
    expect(result).toEqual(expected);
    expect(mock.store.get(decisionPath)).toEqual(expected);
    expect(mock.tx.get.mock.calls.map(([ref]) => ref.path)).toEqual([reviewPath, decisionPath]);
    expect(mock.tx.set).toHaveBeenCalledTimes(1);
    expect(mock.tx.set.mock.calls[0][0].path).toBe(decisionPath);
    expect(mock.store.get(reviewPath)).toEqual(review());
  });
});

describe('financial review listener (mocked SDK, no network)', () => {
  it('reports server-to-cache-to-server readiness without publishing cached facts', () => {
    const onData = vi.fn(), onSync = vi.fn();
    subscribeFinancialReviews('owner', onData, undefined, onSync);
    const reviewsNext = sdk.onSnapshot.mock.calls[0][2];
    const decisionsNext = sdk.onSnapshot.mock.calls[1][1];
    const decisionSnap = { docs: [] };
    reviewsNext(snapshot({ fromCache: false, hasPendingWrites: false }));
    decisionsNext(decisionSnap);
    expect(onSync).toHaveBeenLastCalledWith(true);
    expect(onData).toHaveBeenCalledTimes(1);
    reviewsNext(snapshot({ fromCache: true, hasPendingWrites: false }));
    expect(onSync).toHaveBeenLastCalledWith(false);
    expect(onData).toHaveBeenCalledTimes(1);
    reviewsNext(snapshot({ fromCache: false, hasPendingWrites: false }));
    expect(onSync).toHaveBeenLastCalledWith(true);
    expect(onData).toHaveBeenCalledTimes(2);
  });

  it('subscribes only to the authenticated UID with metadata changes and server-confirmed data', () => {
    const onData = vi.fn();
    const stop = subscribeFinancialReviews('owner', onData);
    expect(sdk.onSnapshot).toHaveBeenCalledWith({ path: 'users/owner/financialReviews' }, { includeMetadataChanges: true }, expect.any(Function), expect.any(Function));
    expect(sdk.onSnapshot).toHaveBeenCalledWith({ path: 'users/owner/financialReviewDecisions' }, expect.any(Function), expect.any(Function));
    const reviewsNext = sdk.onSnapshot.mock.calls[0][2];
    const decisionsNext = sdk.onSnapshot.mock.calls[1][1];
    reviewsNext(snapshot({ fromCache: true }));
    reviewsNext(snapshot({ fromCache: false, hasPendingWrites: true }));
    reviewsNext(snapshot());
    expect(onData).not.toHaveBeenCalled();
    // reviews ready but decisions not yet fired
    reviewsNext(snapshot({ fromCache: false, hasPendingWrites: false }, { id: 'spoof' }));
    expect(onData).not.toHaveBeenCalled();
    decisionsNext({ docs: [] });
    expect(onData).toHaveBeenCalledWith([expect.objectContaining({ id: 'a'.repeat(64) })]);
    stop();
    expect(mock.stop).toHaveBeenCalledTimes(2);
    reviewsNext(snapshot({ fromCache: false, hasPendingWrites: false }));
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it('overlays webDecisionAccepted from decisions collection after refresh', () => {
    const onData = vi.fn();
    subscribeFinancialReviews('owner', onData);
    const id = 'a'.repeat(64), version = 'b'.repeat(16);
    const decisionId = `${id}--${version}`;
    const reviewsNext = sdk.onSnapshot.mock.calls[0][2];
    const decisionsNext = sdk.onSnapshot.mock.calls[1][1];
    reviewsNext({ metadata: { fromCache: false, hasPendingWrites: false }, docs: [{ id, data: () => ({ id, version, webDecisionAccepted: false }) }] });
    decisionsNext({ docs: [{ id: decisionId }] });
    expect(onData).toHaveBeenCalledWith([expect.objectContaining({ id, webDecisionAccepted: true })]);
  });

  it('falls back to mirror-only when decisions subscription errors', () => {
    const onData = vi.fn();
    subscribeFinancialReviews('owner', onData);
    const reviewsNext = sdk.onSnapshot.mock.calls[0][2];
    const decisionsError = sdk.onSnapshot.mock.calls[1][2];
    reviewsNext(snapshot({ fromCache: false, hasPendingWrites: false }));
    expect(onData).not.toHaveBeenCalled();
    decisionsError(new Error('permission-denied'));
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it('suppresses late data/errors after auth changes or unsubscribe and forwards active errors', () => {
    const onData = vi.fn(), onError = vi.fn();
    const stop = subscribeFinancialReviews('owner', onData, onError);
    const [, , , error] = sdk.onSnapshot.mock.calls[0];
    const reviewsNext = sdk.onSnapshot.mock.calls[0][2];
    const failure = new Error('permission-denied');
    error(failure);
    expect(onError).toHaveBeenCalledWith(failure);
    mock.auth.currentUser = { uid: 'other' };
    reviewsNext(snapshot({ fromCache: false, hasPendingWrites: false })); error(failure);
    expect(onData).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    stop();
    mock.auth.currentUser = { uid: 'owner' }; error(failure);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthenticated, foreign, and malformed user ids before attaching listeners', () => {
    for (const uid of ['', 'other', '../bad', null]) expect(() => subscribeFinancialReviews(uid, vi.fn())).toThrow();
    mock.auth.currentUser = null;
    expect(() => subscribeFinancialReviews('owner', vi.fn())).toThrow();
    expect(sdk.onSnapshot).not.toHaveBeenCalled();
  });
});
