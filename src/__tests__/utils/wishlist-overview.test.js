import { expect, it } from 'vitest';
import * as helpers from '../../utils/wishlistHelpers';
const stamp = '2026-10-01T00:00:00.000Z';
const group = (id, targetBudget, price) => ({ id, title: id, targetBudget, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp, items: price ? [{ id: `${id}-item`, groupId: id, name: 'Item', price, marketplaceName: '', productUrl: '', priority: 'medium', createdAt: stamp, updatedAt: stamp }] : [] });

it('summarizes all Wishlist groups for the reference overview without mutating their records', () => {
  expect(helpers.summarizeWishlistGroups).toBeTypeOf('function');
  const groups = [group('g1', 1000000, 100000), group('g2', 2000000, 250000)];
  const before = structuredClone(groups);
  expect(helpers.summarizeWishlistGroups(groups)).toEqual({ count: 2, targetBudget: 3000000n, total: 350000n });
  expect(helpers.summarizeWishlistGroups([])).toEqual({ count: 0, targetBudget: 0n, total: 0n });
  expect(groups).toEqual(before);
});

it('keeps cross-group totals exact even when the aggregate exceeds the per-group safe integer limit', () => {
  const max = Number.MAX_SAFE_INTEGER;
  const groups = [group('g1', max, max), group('g2', max, max), group('g3', 1, 1)];
  expect(helpers.summarizeWishlistGroups(groups)).toEqual({ count: 3, targetBudget: BigInt(max) * 2n + 1n, total: BigInt(max) * 2n + 1n });
});
