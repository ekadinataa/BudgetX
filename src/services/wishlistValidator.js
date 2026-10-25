/** Wishlist validation is deliberately independent of wallets and transactions. */
export const WISHLIST_GROUP_FIELDS = ['id', 'title', 'targetBudget', 'targetDate', 'createdAt', 'updatedAt', 'items'];
export const WISHLIST_ITEM_FIELDS = ['id', 'groupId', 'name', 'price', 'notes', 'marketplaceName', 'productUrl', 'priority', 'createdAt', 'updatedAt'];
const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = value => typeof value === 'string' && value.length <= 1000;
const id = value => text(value) && value.trim() !== '' && !value.includes('/') && value !== '.' && value !== '..';
const groupDocumentId = value => id(value) && new TextEncoder().encode(value).byteLength <= 1500 && !/^__[\s\S]*__$/.test(value);
const positiveMoney = value => Number.isSafeInteger(value) && value > 0;

export function isWishlistDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function metadata(value, fields) {
  if (Object.keys(value).some(key => !fields.includes(key))) return 'Field wishlist tidak diizinkan';
  if (!id(value.id)) return 'ID wishlist tidak valid';
  if (!timestamp(value.createdAt) || !timestamp(value.updatedAt)) return 'Timestamp wishlist tidak valid';
  return null;
}

export function validateWishlistItem(item) {
  if (!isRecord(item)) return 'Item wishlist tidak valid';
  const error = metadata(item, WISHLIST_ITEM_FIELDS);
  if (error) return error;
  if (!id(item.groupId)) return 'ID kelompok wishlist tidak valid';
  if (!text(item.name) || !item.name.trim()) return 'Nama item wajib diisi, maksimal 1000 karakter';
  if (!positiveMoney(item.price)) return 'Harga harus rupiah bulat positif dalam rentang safe integer';
  if (!['high', 'medium', 'low'].includes(item.priority)) return 'Prioritas wishlist tidak valid';
  if (Object.hasOwn(item, 'notes') && !text(item.notes)) return 'Catatan maksimal 1000 karakter dan harus berupa teks';
  if (['marketplaceName', 'productUrl'].some(field => Object.hasOwn(item, field) && !text(item[field]))) return 'Referensi marketplace maksimal 1000 karakter';
  if (item.productUrl) {
    try {
      const url = new URL(item.productUrl);
      const host = url.hostname.replace(/\.$/, '');
      const validHost = host.startsWith('[') || (host.length <= 253 && host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)));
      if (!['http:', 'https:'].includes(url.protocol) || !validHost) return 'Link produk harus URL http/https yang valid';
    } catch {
      return 'Link produk harus URL http/https yang valid';
    }
  }
  return null;
}

export function validateWishlistGroup(group) {
  if (!isRecord(group)) return 'Wishlist tidak valid';
  if (!groupDocumentId(group.id)) return 'ID kelompok wishlist tidak valid';
  const error = metadata(group, WISHLIST_GROUP_FIELDS);
  if (error) return error;
  if (!text(group.title) || !group.title.trim()) return 'Judul wajib diisi, maksimal 1000 karakter';
  if (!positiveMoney(group.targetBudget)) return 'Target anggaran harus rupiah bulat positif dalam rentang safe integer';
  if (!isWishlistDate(group.targetDate)) return 'Tanggal target tidak valid';
  if (!Array.isArray(group.items)) return 'Item wishlist harus berupa daftar';
  const ids = new Set();
  let total = 0;
  for (const item of group.items) {
    const itemError = validateWishlistItem(item);
    if (itemError) return itemError;
    if (item.groupId !== group.id) return 'Relasi kelompok item wishlist tidak valid';
    if (ids.has(item.id)) return 'ID item wishlist duplikat';
    ids.add(item.id);
    if (item.price > Number.MAX_SAFE_INTEGER - total) return 'Total harga melebihi rentang safe integer';
    total += item.price;
  }
  // Leave headroom for Firestore field/document overhead below its 1 MiB limit.
  if (new TextEncoder().encode(JSON.stringify(group)).byteLength > 900_000) return 'Ukuran wishlist terlalu besar. Pisahkan item ke wishlist lain.';
  return null;
}

/** Validate a snapshot's complete embedded relations before any restore writes. */
export function validateWishlistGroups(groups) {
  if (!Array.isArray(groups)) return 'Wishlist harus berupa daftar';
  const groupIds = new Set();
  const itemIds = new Set();
  for (const group of groups) {
    const error = validateWishlistGroup(group);
    if (error) return error;
    if (groupIds.has(group.id)) return 'ID duplikat kelompok wishlist';
    groupIds.add(group.id);
    for (const item of group.items) {
      if (itemIds.has(item.id)) return 'ID item wishlist duplikat antar kelompok';
      itemIds.add(item.id);
    }
  }
  return null;
}
