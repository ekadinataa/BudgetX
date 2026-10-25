// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildReviewDecision, reviewDecisionId, reviewActionLabel, reviewReasonLabel } from '../../utils/financialReview.js';

const review = (extra = {}) => ({
  schemaVersion: 1, id: 'a'.repeat(64), version: 'b'.repeat(16), kind: 'receipt', state: 'pending',
  amount: 15000, fee: 0, currency: 'IDR', occurredAt: '2026-10-25T00:00:00.000Z',
  provider: 'bank', reason: 'ambiguous_wallet', error: null, source: null, destination: null,
  choices: [{ action: 'income', source: 'EXTERNAL', destination: 'BANK_MAIN' }],
  walletOptions: [{ key: 'BANK_MAIN', walletId: 'w1', name: 'Bank Utama' }], updatedAt: '2026-10-25T00:00:00.000Z', ...extra,
});

describe('financial review decisions', () => {
  it('uses a validated deterministic immutable id per version', () => {
    expect(reviewDecisionId(review())).toBe(`${review().id}--${review().version}`);
    expect(() => reviewDecisionId(review({ id: '../x' }))).toThrow();
    expect(() => reviewDecisionId(null)).toThrow();
  });

  it('labels registry choices in Indonesian without confusing registry keys with wallet ids', () => {
    const wallets = review().walletOptions;
    expect(reviewActionLabel(review().choices[0], wallets)).toBe('Pemasukan: Eksternal → Bank Utama');
    expect(reviewActionLabel({ action: 'expense', source: 'BANK_MAIN', destination: 'EXTERNAL' }, wallets)).toBe('Pengeluaran: Bank Utama → Eksternal');
    expect(reviewActionLabel({ action: 'transfer', source: 'BANK_MAIN', destination: 'CASH' }, wallets)).toBe('Transfer: Bank Utama → CASH');
    expect(reviewActionLabel({ action: 'reject' })).toBe('Tolak');
    expect(reviewActionLabel({ action: 'retry' })).toBe('Tindakan tidak dikenal');
    expect(reviewActionLabel(null)).toBe('Tindakan tidak dikenal');
    expect(reviewActionLabel({ action: 'toString' })).toBe('Tindakan tidak dikenal');
    expect(reviewReasonLabel('ambiguous_wallet')).toBe('Dompet belum dapat ditentukan');
    expect(reviewReasonLabel('future_internal_reason')).toBe('Perlu diperiksa');
    expect(reviewReasonLabel(null)).toBe('Perlu diperiksa');
  });

  it('rejects malformed endpoints even if a malformed mirror includes that choice', () => {
    for (const source of [null, '', 42, 'x'.repeat(1001)]) {
      const choice = { action: 'income', source, destination: 'BANK_MAIN' };
      expect(() => buildReviewDecision(review({ choices: [choice] }), choice)).toThrow();
    }
  });
  it('returns only the exact server-proposed financial choice and review identity', () => {
    const current = review();
    const input = { ...current.choices[0], amount: 999999, uid: 'intruder' };
    expect(buildReviewDecision(current, input)).toEqual({ reviewId: current.id, version: current.version, ...current.choices[0] });
    expect(input.amount).toBe(999999);
  });

  it.each([
    { id: 'A'.repeat(64) }, { id: 'a'.repeat(63) }, { id: '../bad' }, { version: 'B'.repeat(16) },
    { version: 'b'.repeat(15) }, { kind: 'delivery' }, { state: 'posted' }, { state: 'approved' },
    { state: 'prepared' }, { state: 'rejected' }, { state: 'resolved' }, { schemaVersion: 2 },
  ])('rejects malformed identity or a non-actionable receipt: %j', extra => {
    expect(() => buildReviewDecision(review(extra), review().choices[0])).toThrow();
  });

  it.each([
    { action: 'income', source: 'EXTERNAL', destination: 'w1' },
    { action: 'income', source: 'BANK_MAIN', destination: 'BANK_MAIN' },
    { action: 'transfer', source: 'EXTERNAL', destination: 'BANK_MAIN' },
    { action: 'approve', source: 'EXTERNAL', destination: 'BANK_MAIN' },
    { action: 'income', source: null, destination: 'BANK_MAIN' }, null,
  ])('rejects a choice not present exactly in the current proposal: %j', input => {
    expect(() => buildReviewDecision(review(), input)).toThrow();
  });

  it('allows reject with null endpoints only; never approves blocked receipts', () => {
    for (const state of ['pending', 'blocked']) {
      const action = 'reject';
      expect(buildReviewDecision(review({ state }), { action })).toEqual({ reviewId: review().id, version: review().version, action, source: null, destination: null });
      expect(() => buildReviewDecision(review({ state }), { action, source: 'BANK_MAIN' })).toThrow();
      expect(() => buildReviewDecision(review({ state }), { action, destination: 'BANK_MAIN' })).toThrow();
    }
    expect(() => buildReviewDecision(review({ state: 'blocked' }), review().choices[0])).toThrow();
    expect(() => buildReviewDecision(review({ state: 'blocked', event_id: 'already-prepared' }), { action: 'reject' })).toThrow();
  });

  it.each(['pending', 'blocked', 'approved', 'prepared', 'posted', 'rejected', 'resolved', 'unknown'])(
    'refuses retry in %s even when a forged mirror proposes it', state => {
      for (const choice of [{ action: 'retry' }, { action: 'retry', source: null, destination: null },
        { action: 'retry', source: 'BANK_MAIN', destination: 'CASH' }]) {
        expect(() => buildReviewDecision(review({ state, choices: [choice] }), choice)).toThrow();
      }
    },
  );

  it.each(['pending', 'blocked'])('refuses all new decisions on an accepted %s revision', state => {
    for (const choice of [{ action: 'reject' }, review().choices[0]]) {
      expect(() => buildReviewDecision(review({ state, webDecisionAccepted: true }), choice)).toThrow();
    }
  });
});
