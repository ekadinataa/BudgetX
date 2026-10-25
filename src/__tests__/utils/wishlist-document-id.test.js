// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validateWishlistGroup, validateWishlistGroups, validateWishlistItem } from '../../services/wishlistValidator.js';
import { parseAndValidate, validateEntities } from '../../services/importService.js';
import { buildBudgetXJson } from '../../services/exportService.js';
import { normalizeBackupData } from '../../utils/backupHelpers.js';

const stamp = '2026-10-12T00:00:00.000Z';
const item = (id, groupId) => ({ id, groupId, name: 'Monitor', price: 200, notes: 'Cek ukuran\nPilih warna', priority: 'medium', createdAt: stamp, updatedAt: stamp });
const group = (id, items = []) => ({ id, title: 'Setup', targetBudget: 1000, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp, items });

describe('Wishlist group document IDs versus embedded item IDs', () => {
  it('rejects group IDs exceeding 1500 UTF-8 bytes before accepting backup data', () => {
    const invalid = group('界'.repeat(501));
    expect(validateWishlistGroup(invalid)).toMatch(/ID.*wishlist/i);
    expect(validateWishlistGroups([invalid])).toMatch(/ID.*wishlist/i);
    const parsed = parseAndValidate(JSON.stringify(buildBudgetXJson(normalizeBackupData({ wishlistGroups: [invalid] }))));
    expect(validateEntities(parsed.data).valid).toBe(false);
  });

  it.each([
    ['1500 UTF-8 bytes', '界'.repeat(500)],
    ['1000 ASCII characters', 'a'.repeat(1000)],
  ])('accepts group IDs at the %s boundary with matching embedded parent references', (_label, id) => {
    const valid = group(id, [item('i1', id)]);
    expect(validateWishlistGroup(valid)).toBeNull();
    const data = normalizeBackupData({ wishlistGroups: [valid] });
    expect(parseAndValidate(JSON.stringify(buildBudgetXJson(data))).data.wishlistGroups).toEqual([valid]);
  });

  it.each([
    ['1001 ASCII characters', 'a'.repeat(1001)],
    ['slash', 'bad/id'], ['dot', '.'], ['dotdot', '..'], ['empty', ''], ['blank', ' '],
  ])('retains the existing group ID rejection for %s', (_label, id) => {
    expect(validateWishlistGroup(group(id))).toMatch(/ID.*wishlist/i);
  });

  it.each(['__reserved__', '__a\nb__', '____'])('rejects reserved group document ID %j before accepting backup data', id => {
    const invalid = group(id);
    expect(validateWishlistGroup(invalid)).toMatch(/ID.*wishlist/i);
    expect(validateWishlistGroups([invalid])).toMatch(/ID.*wishlist/i);
    const parsed = parseAndValidate(JSON.stringify(buildBudgetXJson(normalizeBackupData({ wishlistGroups: [invalid] }))));
    expect(validateEntities(parsed.data).valid).toBe(false);
  });

  it.each(['__reserved__', '__a\nb__', '____'])('preserves reserved-looking embedded item ID %j', id => {
    const embedded = item(id, 'g1');
    expect(validateWishlistItem(embedded)).toBeNull();
    const valid = group('g1', [embedded]);
    expect(validateWishlistGroup(valid)).toBeNull();
    const data = normalizeBackupData({ wishlistGroups: [valid] });
    expect(parseAndValidate(JSON.stringify(buildBudgetXJson(data))).data.wishlistGroups).toEqual([valid]);
  });

  it('preserves embedded item IDs exceeding the document byte limit', () => {
    const embedded = item('界'.repeat(501), 'g1');
    expect(validateWishlistItem(embedded)).toBeNull();
    const valid = group('g1', [embedded]);
    expect(validateWishlistGroup(valid)).toBeNull();
    const data = normalizeBackupData({ wishlistGroups: [valid] });
    expect(parseAndValidate(JSON.stringify(buildBudgetXJson(data))).data.wishlistGroups).toEqual([valid]);
  });
});
