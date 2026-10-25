// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { BACKUP_ARRAY_KEYS, BACKUP_EXTRA_KEYS, BACKUP_COLLECTION_LABELS, normalizeBackupData, summarizeBackupData } from '../../utils/backupHelpers.js';
import { buildBudgetXJson, buildCsvStrings, buildCsvZip } from '../../services/exportService.js';
import { parseAndValidate, parseCsvZip, validateEntities, computeAppend } from '../../services/importService.js';
const stamp = '2026-10-12T00:00:00.000Z';
const item = (extra = {}) => ({ id: 'i1', groupId: 'g1', name: 'Monitor', price: 200, marketplaceName: 'Shop', productUrl: 'https://example.com/p', priority: 'high', createdAt: stamp, updatedAt: stamp, ...extra });
const group = (extra = {}) => ({ id: 'g1', title: 'Setup', targetBudget: 1000, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp, items: [item()], ...extra });
const data = groups => normalizeBackupData({ wishlistGroups: groups });

describe('Wishlist backup infrastructure', () => {
  it('appends whole groups by ID without reparenting or merging children of skipped groups', () => {
    const existing = data([group()]);
    const incoming = data([group({ items: [item({ id: 'different' })] }), group({ id: 'g2', items: [item({ id: 'i2', groupId: 'g2' })] })]);
    const result = computeAppend(incoming, existing);
    expect(result.counts).toEqual({ added: 1, skipped: 1 });
    expect(result.toAdd.wishlistGroups).toEqual([incoming.wishlistGroups[1]]);
    expect(existing.wishlistGroups[0].items).toEqual([item()]);
    expect(computeAppend(existing, existing).toAdd.wishlistGroups).toEqual([]);
  });
  it('rejects conflicting item identities in another existing group before returning append writes', () => {
    const existing = data([group()]);
    const incoming = data([group({ id: 'g2', items: [item({ groupId: 'g2' })] })]);
    expect(() => computeAppend(incoming, existing)).toThrow(/ID item|konflik/i);
    expect(() => computeAppend(data([group({ items: [item({ groupId: 'orphan' })] })]), existing)).toThrow();
  });
  it('validates the wishlist title and embedded relations instead of generic name/amount fallback', () => {
    expect(validateEntities(data([group()]))).toEqual({ valid: true });
    expect(validateEntities(data([]))).toEqual({ valid: true });
    expect(validateEntities({ wallets: [], transactions: [], categories: [], budgets: {} })).toEqual({ valid: true });
  });
  it.each([
    [group({ items: [item({ groupId: 'missing' })] })],
    [group({ items: [item(), item()] })],
    [group(), group({ id: 'g1', items: [] })],
    [group(), group({ id: 'g2', items: [item({ groupId: 'g2' })] })],
    [group({ targetBudget: '100' })], [group({ targetDate: '2026-02-29' })],
    [group({ items: [item({ productUrl: 'file:///secret' })] })],
    [group({ items: [item({ createdAt: 'not-a-time' })] })], [group({ updatedAt: '2026-02-30T00:00:00.000Z' })],
    [group({ items: [item({ price: Number.MAX_SAFE_INTEGER }), item({ id: 'i2', price: 1 })] })],
    [group({ walletId: 'w1' })], [group({ items: [item({ walletId: 'w1' })] })],
  ].map(groups => [groups]))('rejects malformed wishlist backup before mutation: %j', groups => {
    expect(validateEntities(data(groups)).valid).toBe(false);
  });
  it('registers Wishlist in complete snapshots, summary and legacy empty defaults', () => {
    expect(BACKUP_ARRAY_KEYS).toContain('wishlistGroups');
    expect(BACKUP_EXTRA_KEYS).toContain('wishlistGroups');
    expect(BACKUP_COLLECTION_LABELS.wishlistGroups).toBe('wishlist');
    expect(normalizeBackupData({}).wishlistGroups).toEqual([]);
    const full = data([group()]);
    expect(summarizeBackupData(full).wishlistGroups).toBe(1);
    expect(parseAndValidate(JSON.stringify(buildBudgetXJson(full))).data.wishlistGroups).toEqual([group()]);
    expect(parseCsvZip(buildCsvZip(buildCsvStrings(full), full)).wishlistGroups).toEqual([group()]);
  });
});
