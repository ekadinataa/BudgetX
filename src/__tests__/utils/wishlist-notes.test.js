// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validateWishlistItem, validateWishlistGroup, WISHLIST_ITEM_FIELDS } from '../../services/wishlistValidator.js';
import { prepareWishlistItem } from '../../utils/wishlistHelpers.js';

const stamp = '2026-10-12T00:00:00.000Z';
const item = (extra = {}) => ({ id: 'i1', groupId: 'g1', name: 'Monitor', price: 200, priority: 'medium', createdAt: stamp, updatedAt: stamp, ...extra });
const legacy = (extra = {}) => item({ marketplaceName: 'Shop', productUrl: 'https://example.com/p?q=1', ...extra });
const group = items => ({ id: 'g1', title: 'Setup', targetBudget: 1000, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp, items });

describe('Wishlist optional notes', () => {
  it('prepares canonical new input with trimmed multiline notes and no legacy fields', () => {
    const created = prepareWishlistItem({ name: ' Monitor ', price: 200, priority: 'high', notes: '  Ukuran 27 inci\n  Panel IPS\n\nBandingkan harga  ' }, 'g1');
    expect(created).toMatchObject({ name: 'Monitor', price: 200, priority: 'high', notes: 'Ukuran 27 inci\n  Panel IPS\n\nBandingkan harga' });
    expect(created).not.toHaveProperty('marketplaceName');
    expect(created).not.toHaveProperty('productUrl');
    expect(validateWishlistItem(created)).toBeNull();
  });

  it('updates notes while retaining normalized legacy references and immutable metadata', () => {
    const original = legacy({ marketplaceName: '  Shop  ', productUrl: '  https://example.com/p?q=1  ', notes: 'Lama' });
    const updated = prepareWishlistItem({ notes: ' Baru\n  rincian ' }, 'g1', original);
    expect(updated).toMatchObject({ id: 'i1', groupId: 'g1', createdAt: stamp, marketplaceName: 'Shop', productUrl: 'https://example.com/p?q=1', notes: 'Baru\n  rincian' });
    expect(original.notes).toBe('Lama');
    expect(original.marketplaceName).toBe('  Shop  ');
  });

  it('retains original notes on a partial update that omits notes', () => {
    expect(prepareWishlistItem({ price: 300 }, 'g1', legacy({ notes: 'Lama\n  rincian' })).notes).toBe('Lama\n  rincian');
  });

  it('clears original notes with an explicit empty string', () => {
    expect(prepareWishlistItem({ notes: '' }, 'g1', legacy({ notes: 'Lama' })).notes).toBe('');
  });

  it('does not add notes to untouched legacy API input or convert legacy references', () => {
    expect(prepareWishlistItem({ price: 300 }, 'g1', legacy())).not.toHaveProperty('notes');
    expect(prepareWishlistItem({ name: 'Monitor', price: 200, marketplaceName: 'Shop', productUrl: 'https://example.com/p' }, 'g1')).not.toHaveProperty('notes');
    expect(prepareWishlistItem({ name: 'Monitor', price: 200 }, 'g1')).not.toHaveProperty('notes');
  });

  it.each([null, undefined, 42, true, [], {}, 'x'.repeat(1001), ' '.repeat(1001)])('rejects malformed notes before creation or update: %j', notes => {
    expect(() => prepareWishlistItem({ name: 'Monitor', price: 200, notes }, 'g1')).toThrow(/catatan|1000/i);
    expect(() => prepareWishlistItem({ notes }, 'g1', legacy({ notes: 'Lama' }))).toThrow(/catatan|1000/i);
  });

  it('normalizes whitespace-only legacy references to their existing empty representation', () => {
    const created = prepareWishlistItem({ name: 'Monitor', price: 200, notes: '', marketplaceName: '  ', productUrl: '  ' }, 'g1');
    expect(created).toMatchObject({ notes: '', marketplaceName: '', productUrl: '' });
  });

  it.each(['marketplaceName', 'productUrl'])('rejects malformed legacy %s during notes edits instead of silently retaining it', field => {
    for (const value of [null, undefined, 42, false, [], {}, ' '.repeat(1001)]) {
      expect(() => prepareWishlistItem({ notes: 'Baru', [field]: value }, 'g1', legacy())).toThrow(/referensi|1000/i);
    }
  });

  it('prepares a maximum-length note without truncation', () => {
    expect(prepareWishlistItem({ name: 'Monitor', price: 200, notes: '界'.repeat(1000) }, 'g1').notes).toBe('界'.repeat(1000));
  });
  it('accepts canonical persisted items without unused legacy references', () => {
    expect(validateWishlistItem(item({ notes: 'Panel IPS' }))).toBeNull();
    expect(validateWishlistItem(item())).toBeNull();
    expect(validateWishlistGroup(group([item({ notes: '' })]))).toBeNull();
  });

  it('allows either legacy reference independently when the other is absent', () => {
    expect(validateWishlistItem(item({ marketplaceName: 'Shop' }))).toBeNull();
    expect(validateWishlistItem(item({ productUrl: 'http://example.com/p' }))).toBeNull();
  });

  it.each(['marketplaceName', 'productUrl'])('rejects present invalid legacy %s types and lengths', field => {
    for (const value of [null, undefined, 42, false, [], {}, 'x'.repeat(1001)]) {
      expect(validateWishlistItem(item({ [field]: value }))).toMatch(/referensi|1000/i);
    }
  });

  it.each(['javascript:alert(1)', 'data:text/plain,hi', 'file:///secret', 'ftp://example.com/p', 'https://', 'https://.', 'https://-shop.example/p', 'https://shop..example/p', 'https://bad host/p'])('rejects unsafe legacy URL without marketplaceName: %s', productUrl => {
    expect(validateWishlistItem(item({ productUrl }))).toMatch(/http|URL/i);
  });
  it('retains immutable item guards during notes edits', () => {
    for (const data of [{ id: 'other' }, { groupId: 'other' }, { createdAt: '2026-10-11T00:00:00.000Z' }]) {
      expect(() => prepareWishlistItem({ ...data, notes: 'Baru' }, 'g1', legacy())).toThrow(/immutable|diubah/i);
    }
  });

  it.each(['walletId', 'transactionId', 'balance', 'total', 'note', 'unexpected'])('rejects persisted unknown field %s even with valid notes', field => {
    expect(validateWishlistItem(item({ notes: 'Valid', [field]: 1 }))).toMatch(/field.*diizinkan/i);
    expect(validateWishlistGroup(group([item({ notes: 'Valid', [field]: 1 })]))).toMatch(/field.*diizinkan/i);
  });

  it('keeps financial input outside prepared notes records', () => {
    const created = prepareWishlistItem({ name: 'Monitor', price: 200, notes: 'Valid', walletId: 'w1', transactionId: 'tx1', balance: 100 }, 'g1');
    for (const field of ['walletId', 'transactionId', 'balance']) expect(created).not.toHaveProperty(field);
  });

  it('counts notes in the exact 900000-byte UTF-8 parent size boundary', () => {
    const value = group(Array.from({ length: 300 }, (_, n) => item({ id: `i${n}`, notes: '' })));
    const size = () => new TextEncoder().encode(JSON.stringify(value)).byteLength;
    let remaining = 900_000 - size();
    for (const entry of value.items) {
      const count = Math.min(1000, Math.floor(remaining / 3));
      entry.notes = '界'.repeat(count);
      remaining -= count * 3;
    }
    value.items.at(-1).notes += 'a'.repeat(remaining);
    expect(size()).toBe(900_000);
    expect(JSON.stringify(value).length).toBeLessThan(900_000);
    expect(validateWishlistGroup(value)).toBeNull();
    value.items.at(-1).notes += 'a';
    expect(size()).toBe(900_001);
    expect(value.items.at(-1).notes.length).toBeLessThanOrEqual(1000);
    expect(validateWishlistGroup(value)).toMatch(/ukuran|besar/i);
  });

  it('accepts notes in the persisted allowlist with legacy references', () => {
    expect(WISHLIST_ITEM_FIELDS).toContain('notes');
    expect(validateWishlistItem(legacy({ notes: 'Ukuran 27 inci\nPanel IPS' }))).toBeNull();
    expect(validateWishlistGroup(group([legacy({ notes: '' })]))).toBeNull();
  });

  it('accepts exactly 1000 note characters', () => {
    expect(validateWishlistItem(legacy({ notes: '界'.repeat(1000) }))).toBeNull();
  });

  it.each([null, undefined, 42, true, [], {}, 'x'.repeat(1001)])('rejects present malformed notes: %j', notes => {
    expect(validateWishlistItem(legacy({ notes }))).toMatch(/catatan|1000/i);
  });
});
