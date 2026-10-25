// @vitest-environment node
import { describe, it, expect } from 'vitest';

import * as helpers from '../../utils/wishlistHelpers.js';
import * as validators from '../../services/wishlistValidator.js';
const stamp = '2026-10-12T00:00:00.000Z';
const item = (extra = {}) => ({ id: 'i1', groupId: 'g1', name: 'Monitor', price: 200, marketplaceName: '', productUrl: '', priority: 'medium', createdAt: stamp, updatedAt: stamp, ...extra });
const group = (extra = {}) => ({ id: 'g1', title: 'Setup', targetBudget: 1000, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp, items: [], ...extra });

describe('Wishlist domain', () => {
  it('requires a valid HTTP hostname rather than accepting empty DNS labels', () => {
    for (const productUrl of ['https://.', 'https://-shop.example/p', 'https://shop..example/p']) expect(validators.validateWishlistItem(item({ productUrl }))).toBeTypeOf('string');
    for (const productUrl of ['https://localhost/p', 'http://127.0.0.1/p', 'https://[::1]/p', 'https://toko.example./p']) expect(validators.validateWishlistItem(item({ productUrl }))).toBeNull();
  });
  it('rejects explicit null edits instead of silently retaining original required fields', () => {
    for (const data of [{ title: null }, { targetBudget: null }, { targetDate: null }]) expect(() => helpers.prepareWishlistGroup(data, group())).toThrow();
    for (const data of [{ name: null }, { price: null }, { priority: null }]) expect(() => helpers.prepareWishlistItem(data, 'g1', item())).toThrow();
  });
  it('rejects oversized UTF-8 embedded payloads while permitting many small items', () => {
    expect(validators.validateWishlistGroup(group({ items: Array.from({ length: 1000 }, (_, n) => item({ id: `i${n}` })) }))).toBeNull();
    const large = group({ items: Array.from({ length: 400 }, (_, n) => item({ id: `i${n}`, name: '界'.repeat(1000) })) });
    expect(validators.validateWishlistGroup(large)).toMatch(/ukuran|besar/i);
  });
  it('prepares item writes with medium default, trimmed references and immutable parent', () => {
    expect(helpers.prepareWishlistItem).toBeTypeOf('function');
    const created = helpers.prepareWishlistItem({ name: ' Monitor ', price: 200, marketplaceName: ' Shop ', productUrl: ' https://example.com/p ', walletId: 'w1' }, 'g1');
    expect(created).toMatchObject({ groupId: 'g1', name: 'Monitor', priority: 'medium', marketplaceName: 'Shop', productUrl: 'https://example.com/p' });
    expect(validators.validateWishlistItem(created)).toBeNull();
    expect(created).not.toHaveProperty('walletId');
    const edited = helpers.prepareWishlistItem({ price: 100 }, 'g1', item());
    expect(edited).toMatchObject({ id: 'i1', groupId: 'g1', createdAt: stamp, price: 100 });
    expect(() => helpers.prepareWishlistItem({ groupId: 'other' }, 'g1', item())).toThrow(/immutable|diubah/);
    expect(() => helpers.prepareWishlistItem({ id: 'other' }, 'g1', item())).toThrow(/immutable|diubah/);
    expect(() => helpers.prepareWishlistItem({ createdAt: 'bad' }, 'g1', item())).toThrow(/immutable|diubah/);
  });
  it('prepares normalized group writes and preserves identity and embedded items on metadata edits', () => {
    expect(helpers.prepareWishlistGroup).toBeTypeOf('function');
    const created = helpers.prepareWishlistGroup({ title: ' Setup ', targetBudget: 1000, targetDate: '2026-12-31', walletId: 'w1' });
    expect(created).toMatchObject({ title: 'Setup', items: [] });
    expect(validators.validateWishlistGroup(created)).toBeNull();
    expect(created).not.toHaveProperty('walletId');
    const original = group({ items: [item()] });
    const edited = helpers.prepareWishlistGroup({ title: ' Edited ', items: [], updatedAt: stamp }, original);
    expect(edited).toMatchObject({ id: 'g1', createdAt: stamp, title: 'Edited', items: [item()] });
    expect(edited.updatedAt).not.toBe(stamp);
    expect(original.title).toBe('Setup');
    expect(() => helpers.prepareWishlistGroup({ id: 'other' }, original)).toThrow(/immutable|diubah/);
    expect(() => helpers.prepareWishlistGroup({ createdAt: '2026-10-11T00:00:00.000Z' }, original)).toThrow(/immutable|diubah/);
    expect(() => helpers.prepareWishlistGroup({ title: ' ', targetBudget: 1, targetDate: '2026-12-31' })).toThrow();
  });
  it('labels targets by local calendar date and reevaluates across midnight', () => {
    expect(helpers.wishlistTargetLabel).toBeTypeOf('function');
    const morning = new Date(2026, 9, 12, 0, 1);
    expect(helpers.wishlistTargetLabel('2026-10-12', morning)).toBe('Target Hari Ini');
    expect(helpers.wishlistTargetLabel('2026-10-11', morning)).toBe('Lewat Target');
    expect(helpers.wishlistTargetLabel('2026-10-13', morning)).toBe('13 Oktober 2026');
    expect(helpers.wishlistTargetLabel('2026-10-12', new Date(2026, 9, 13, 0, 1))).toBe('Lewat Target');
    expect(() => helpers.wishlistTargetLabel('2026-02-29', morning)).toThrow();
  });
  it('sorts priority then chronological creation then ID without mutating input', () => {
    expect(helpers.sortWishlistItems).toBeTypeOf('function');
    const items = [item({ id: 'low', priority: 'low' }), item({ id: 'b', priority: 'high' }), item({ id: 'a', priority: 'high' }), item({ id: 'old', createdAt: '2026-10-11T00:00:00.000Z', priority: 'high' }), item({ id: 'medium' })];
    expect(helpers.sortWishlistItems(items).map(i => i.id)).toEqual(['old', 'a', 'b', 'medium', 'low']);
    expect(items[0].id).toBe('low');
  });
  it('summarizes empty, exact and over-budget groups with safe integer totals', () => {
    expect(helpers.summarizeWishlistGroup).toBeTypeOf('function');
    expect(helpers.summarizeWishlistGroup(group())).toEqual({ total: 0, remaining: 1000, over: 0 });
    expect(helpers.summarizeWishlistGroup(group({ items: [item({ price: 1000 })] }))).toEqual({ total: 1000, remaining: 0, over: 0 });
    expect(helpers.summarizeWishlistGroup(group({ items: [item({ price: 1200 })] }))).toEqual({ total: 1200, remaining: 0, over: 200 });
    expect(() => helpers.summarizeWishlistGroup(group({ items: [item({ price: Number.MAX_SAFE_INTEGER }), item({ id: 'i2' })] }))).toThrow(/safe integer/);
  });
  it('validates a complete group independent of financial records', () => {
    expect(validators.validateWishlistGroup).toBeTypeOf('function');
    expect(validators.validateWishlistGroup(group({ items: [item()] }))).toBeNull();
  });

  it.each([null, [], {}, group({ title: ' ' }), group({ title: 'x'.repeat(1001) }), group({ targetBudget: '1' }), group({ targetBudget: 0 }), group({ targetBudget: 1.1 }), group({ targetBudget: Infinity }), group({ targetBudget: Number.MAX_SAFE_INTEGER + 1 }), group({ targetDate: '2026-02-29' }), group({ targetDate: '2026-13-01' }), group({ targetDate: '26-01-01' }), group({ walletId: 'w1' }), group({ total: 1 }), group({ id: 'bad/id' }), group({ createdAt: 'yesterday' }), group({ items: {} }), group({ items: [item({ groupId: 'other' })] }), group({ items: [item(), item()] }), group({ items: [item({ price: Number.MAX_SAFE_INTEGER }), item({ id: 'i2', price: 1 })] })])('rejects invalid group: %j', value => {
    expect(validators.validateWishlistGroup(value)).toBeTypeOf('string');
  });

  it.each([null, [], {}, item({ name: ' ' }), item({ name: 'x'.repeat(1001) }), item({ price: '100' }), item({ price: 0 }), item({ price: -1 }), item({ price: 0.5 }), item({ price: NaN }), item({ price: Number.MAX_SAFE_INTEGER + 1 }), item({ priority: 'urgent' }), item({ marketplaceName: 4 }), item({ productUrl: 'javascript:alert(1)' }), item({ productUrl: 'data:text/plain,hi' }), item({ productUrl: 'https://' }), item({ productUrl: 'https://bad host' }), item({ transactionId: 't1' }), item({ updatedAt: '2026-02-30T00:00:00.000Z' })])('rejects invalid item: %j', value => {
    expect(validators.validateWishlistItem(value)).toBeTypeOf('string');
  });

  it('accepts leap dates, past targets, optional references and over-budget totals', () => {
    expect(validators.validateWishlistGroup(group({ targetDate: '2024-02-29', targetBudget: 1, items: [item({ productUrl: 'https://example.com/p?q=1' })] }))).toBeNull();
  });
});
