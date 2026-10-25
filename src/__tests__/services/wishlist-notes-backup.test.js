// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mock = vi.hoisted(() => ({
  store: new Map(),
  auth: { currentUser: { uid: 'wishlist-notes-owner' } },
  tx: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  batch: { set: vi.fn(), delete: vi.fn(), update: vi.fn(), commit: vi.fn() },
}));
vi.mock('../../config/firebase', () => ({ db: {}, auth: mock.auth }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
  doc: vi.fn((_db, ...parts) => ({ path: parts.join('/'), id: parts.at(-1) })),
  runTransaction: vi.fn(async (_db, fn) => fn(mock.tx)),
  onSnapshot: vi.fn(), getDocs: vi.fn(), getDoc: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), setDoc: vi.fn(),
  writeBatch: vi.fn(() => mock.batch), increment: vi.fn(), query: vi.fn(ref => ref), where: vi.fn(), limit: vi.fn(),
}));

import * as api from '../../services/firestoreService.js';
import * as sdk from 'firebase/firestore';
import { buildBudgetXJson, buildCsvStrings, buildCsvZip } from '../../services/exportService.js';
import { parseAndValidate, parseCsvZip, validateEntities, computeAppend } from '../../services/importService.js';
import { normalizeBackupData } from '../../utils/backupHelpers.js';
import { prepareWishlistItem } from '../../utils/wishlistHelpers.js';

const stamp = '2026-10-12T00:00:00.000Z';
const item = (extra = {}) => ({ id: 'i1', groupId: 'g1', name: 'Monitor', price: 200, priority: 'medium', createdAt: stamp, updatedAt: stamp, ...extra });
const legacy = (extra = {}) => item({ marketplaceName: '  Toko lama  ', productUrl: 'https://EXAMPLE.com/p?q=1&warna=biru#detail', ...extra });
const group = items => ({ id: 'g1', title: 'Setup', targetBudget: 1000, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp, items });
const snapshot = items => normalizeBackupData({ wishlistGroups: [group(items)] });
const path = 'users/wishlist-notes-owner/wishlistGroups/g1';
const formats = [
  ['JSON', source => parseAndValidate(JSON.stringify(buildBudgetXJson(source))).data],
  ['ZIP', source => parseCsvZip(buildCsvZip(buildCsvStrings(source), source))],
];

beforeEach(() => {
  vi.clearAllMocks();
  mock.store.clear();
  mock.tx.get.mockImplementation(async ref => ({ exists: () => mock.store.has(ref.path), data: () => mock.store.get(ref.path) }));
  mock.tx.set.mockImplementation((ref, data) => mock.store.set(ref.path, data));
  mock.batch.set.mockImplementation((ref, data) => mock.store.set(ref.path, data));
  mock.batch.commit.mockResolvedValue();
});

function expectNoWrites() {
  expect(mock.tx.set).not.toHaveBeenCalled();
  expect(mock.tx.delete).not.toHaveBeenCalled();
  expect(mock.batch.set).not.toHaveBeenCalled();
  expect(mock.batch.update).not.toHaveBeenCalled();
  expect(mock.batch.delete).not.toHaveBeenCalled();
  expect(mock.batch.commit).not.toHaveBeenCalled();
  for (const method of ['increment', 'addDoc', 'setDoc', 'updateDoc', 'deleteDoc']) expect(sdk[method]).not.toHaveBeenCalled();
}

describe.each(formats)('Wishlist notes %s backup (Firebase mocked)', (_format, roundtrip) => {
  it('roundtrips canonical new notes into an actual restore without adding legacy fields', async () => {
    const created = prepareWishlistItem({ name: 'Monitor', price: 200, priority: 'high', notes: ' Ukuran 27 inci\n  Panel IPS\n\nHarga, "diskon" 界 ' }, 'g1');
    const source = snapshot([created]);
    const restored = roundtrip(source);
    expect(restored.wishlistGroups).toEqual(source.wishlistGroups);
    expect(restored.wishlistGroups[0].items[0].notes).toBe('Ukuran 27 inci\n  Panel IPS\n\nHarga, "diskon" 界');
    expect(restored.wishlistGroups[0].items[0]).not.toHaveProperty('marketplaceName');
    expect(restored.wishlistGroups[0].items[0]).not.toHaveProperty('productUrl');
    expect(validateEntities(restored)).toEqual({ valid: true });
    await api.migrateData(restored);
    const { id, ...stored } = source.wishlistGroups[0];
    expect(mock.batch.set).toHaveBeenCalledWith({ path, id }, stored);
    expect(mock.store.get(path)).toEqual(stored);
    expect(mock.batch.update).not.toHaveBeenCalled();
    expect(sdk.increment).not.toHaveBeenCalled();
    expect(mock.batch.set.mock.calls.every(([ref]) => ref.path.includes('/wishlistGroups/') || ref.path.includes('/preferences/'))).toBe(true);
  });

  it('preserves old backup references verbatim without inserting or converting notes', async () => {
    const source = snapshot([legacy()]);
    const before = JSON.stringify(source);
    const restored = roundtrip(source);
    expect(validateEntities(restored)).toEqual({ valid: true });
    expect(restored.wishlistGroups).toEqual(source.wishlistGroups);
    expect(restored.wishlistGroups[0].items[0]).not.toHaveProperty('notes');
    await api.migrateData(restored);
    expect(mock.store.get(path).items).toEqual([legacy()]);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('preserves explicit empty notes and the maximum-length Unicode note', () => {
    const source = snapshot([item({ notes: '' }), item({ id: 'i2', notes: '界'.repeat(1000) })]);
    const restored = roundtrip(source);
    expect(restored.wishlistGroups).toEqual(source.wishlistGroups);
    expect(validateEntities(restored)).toEqual({ valid: true });
  });

  it.each([
    ['null', null], ['number', 42], ['boolean', false], ['array', []], ['object', {}], ['1001 chars', 'x'.repeat(1001)],
  ])('rejects malformed %s notes before either restore mode writes', async (_label, notes) => {
    const source = snapshot([legacy({ notes })]);
    const restored = roundtrip(source);
    expect(validateEntities(restored).valid).toBe(false);
    expect(() => computeAppend(restored, normalizeBackupData({}))).toThrow(/catatan|1000/i);
    await expect(api.migrateData(restored)).rejects.toThrow(/catatan|1000/i);
    await expect(api.migrateData(restored, { appendWishlist: true })).rejects.toThrow(/catatan|1000/i);
    expect(sdk.getDoc).not.toHaveBeenCalled();
    expect(sdk.writeBatch).not.toHaveBeenCalled();
    expect(sdk.runTransaction).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each(['javascript:alert(1)', 'data:text/plain,hi', 'file:///secret', 'https://shop..example/p'])('still rejects unsafe old URLs alongside valid notes: %s', productUrl => {
    const restored = roundtrip(snapshot([legacy({ notes: 'Valid', productUrl })]));
    expect(validateEntities(restored).valid).toBe(false);
    expect(() => computeAppend(restored, normalizeBackupData({}))).toThrow(/URL|http/i);
  });

  it('rejects unknown financial fields in imported notes records', async () => {
    const restored = roundtrip(snapshot([item({ notes: 'Valid', walletId: 'w1' })]));
    expect(validateEntities(restored).valid).toBe(false);
    await expect(api.migrateData(restored)).rejects.toThrow(/field.*diizinkan/i);
    expectNoWrites();
  });
});

describe('Wishlist notes mutation prewrite guards (Firebase mocked)', () => {
  it.each([
    ['null', null], ['undefined', undefined], ['number', 42], ['array', []], ['object', {}], ['1001 chars', 'x'.repeat(1001)], ['1001 spaces', ' '.repeat(1001)],
  ])('rejects malformed %s notes on create and update without any write', async (_label, notes) => {
    const original = group([legacy({ notes: 'Lama' })]);
    mock.store.set(path, original);
    await expect(api.createWishlistItem('g1', { name: 'Chair', price: 300, notes })).rejects.toThrow(/catatan|1000/i);
    await expect(api.updateWishlistItem('g1', 'i1', { notes })).rejects.toThrow(/catatan|1000/i);
    expect(mock.store.get(path)).toEqual(original);
    expectNoWrites();
  });

  it('creates notes, updates them, preserves them when omitted, and clears them explicitly', async () => {
    mock.store.set(path, group([legacy()]));
    const created = await api.createWishlistItem('g1', { name: 'Chair', price: 300, priority: 'low', notes: ' Awal\n  rincian ' });
    expect(created.notes).toBe('Awal\n  rincian');
    expect(created).not.toHaveProperty('marketplaceName');
    expect(created).not.toHaveProperty('productUrl');
    expect(mock.store.get(path).items).toEqual([legacy(), created]);
    const edited = await api.updateWishlistItem('g1', 'i1', { notes: ' Baru\n  rincian ' });
    expect(edited).toMatchObject({ notes: 'Baru\n  rincian', marketplaceName: 'Toko lama', productUrl: legacy().productUrl, createdAt: stamp });
    expect((await api.updateWishlistItem('g1', 'i1', { price: 400 })).notes).toBe('Baru\n  rincian');
    expect((await api.updateWishlistItem('g1', 'i1', { notes: '' })).notes).toBe('');
    expect(mock.store.get(path).items[1]).toEqual(created);
    expect(mock.tx.set.mock.calls.every(([ref]) => ref.path === path)).toBe(true);
    expect(mock.batch.set).not.toHaveBeenCalled();
    expect(sdk.increment).not.toHaveBeenCalled();
  });
});
