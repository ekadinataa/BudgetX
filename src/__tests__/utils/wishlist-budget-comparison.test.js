import { expect, it } from 'vitest';
import * as helpers from '../../utils/wishlistHelpers';
const stamp = '2026-10-01T00:00:00.000Z';
const group = price => ({ id: 'g1', title: 'Ruang Kerja', targetBudget: 1000000, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp, items: price ? [{ id: 'i1', groupId: 'g1', name: 'Item', price, marketplaceName: '', productUrl: '', priority: 'medium', createdAt: stamp, updatedAt: stamp }] : [] });
it.each([[0, 0], [100000, 10], [1000000, 100], [2000000, 100]])('derives a clamped nonfinancial comparison for total %i', (price, percent) => {
  expect(helpers.wishlistBudgetComparison).toBeTypeOf('function');
  const source = group(price), before = structuredClone(source);
  expect(helpers.wishlistBudgetComparison(source)).toEqual({ ...helpers.summarizeWishlistGroup(source), percent });
  expect(source).toEqual(before);
});
