// @vitest-environment node
// Source-contract tests only: these do not claim to execute the Firestore Rules engine.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');
const source = rules.replace(/\/\/[^\n]*/g, '');

function blockAfter(marker) {
  const start = source.indexOf(marker);
  expect(start, `Missing rule: ${marker}`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', start + marker.length);
  let depth = 1, end = open + 1;
  for (; depth && end < source.length; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  return source.slice(open + 1, end - 1);
}

describe('financial review restrictive rules source contract', () => {
  it('excludes reserved collection trees from the generic owner grant while retaining other owner data', () => {
    const generic = blockAfter('match /users/{userId}/{collectionId}/{document=**}');
    expect(generic).toMatch(/allow read, write: if isOwner\(userId\)/);
    expect(generic).toContain("collectionId != 'financialReviews'");
    expect(generic).toContain("collectionId != 'financialReviewDecisions'");
    expect(source).not.toContain('match /users/{userId}/{document=**}');
    expect(source).toContain('request.auth != null && request.auth.uid == userId');
    expect(blockAfter('match /users/{userId} ')).toContain('allow read, write: if isOwner(userId)');
    expect(blockAfter('match /{document=**}')).toContain('allow read, write: if false');
  });

  it('makes mirrors owner-readable but denies all browser writes and decisions update/delete', () => {
    const mirror = blockAfter('match /users/{userId}/financialReviews/{reviewId}');
    expect(mirror).toContain('allow read: if isOwner(userId)');
    expect(mirror).toContain('allow write: if false');
    const decisions = blockAfter('match /users/{userId}/financialReviewDecisions/{decisionId}');
    expect(decisions).toContain('allow read: if isOwner(userId)');
    expect(decisions).toContain('allow create: if isOwner(userId) && validReviewDecision(userId, decisionId)');
    expect(decisions).toContain('allow update, delete: if false');
  });

  it('binds the exact typed allowlisted create payload to UID, deterministic ID and current receipt mirror', () => {
    const validation = blockAfter('function validReviewDecision(userId, decisionId)');
    const fields = "['schemaVersion', 'uid', 'reviewId', 'version', 'action', 'source', 'destination', 'createdAt']";
    expect(validation).toContain(`data.keys().hasOnly(${fields})`);
    expect(validation).toContain(`data.keys().hasAll(${fields})`);
    for (const condition of [
      'data.schemaVersion is int', 'data.schemaVersion == 1', 'data.uid is string', 'data.uid == userId',
      'data.reviewId is string', "data.reviewId.matches('^[a-f0-9]{64}$')",
      'data.version is string', "data.version.matches('^[a-f0-9]{16}$')",
      "decisionId == data.reviewId + '--' + data.version", 'data.action is string', 'data.createdAt is string',
      'mirror.schemaVersion == 1', 'mirror.id == data.reviewId', 'mirror.version == data.version', "mirror.kind == 'receipt'",
      'get(/databases/$(database)/documents/users/$(userId)/financialReviews/$(data.reviewId)).data',
    ]) expect(validation).toContain(condition);
  });

  it('forbids retry and accepted-revision changes, permits reject only with null endpoints and financial choices while pending', () => {
    const validation = blockAfter('function validReviewDecision(userId, decisionId)');
    for (const condition of [
      "mirror.state == 'pending'", "mirror.state == 'blocked'", "mirror.get('event_id', null) == null",
      "data.action == 'reject'", 'data.source == null && data.destination == null',
      "mirror.get('webDecisionAccepted', false) == false",
      "data.action in ['income', 'expense', 'transfer']", 'data.source is string', 'data.destination is string',
      'mirror.choices is list', "mirror.choices.hasAny([{'action': data.action, 'source': data.source, 'destination': data.destination}])",
    ]) expect(validation).toContain(condition);
    expect(validation).not.toContain("'retry'");
  });
});
