import { validateWishlistGroup, validateWishlistItem, isWishlistDate } from '../services/wishlistValidator.js';

export function prepareWishlistItem(data, groupId, original = null) {
  immutable(data, original, ['id', 'groupId', 'createdAt']);
  if ((data.groupId !== undefined && data.groupId !== groupId) || (original && original.groupId !== groupId)) throw new Error('groupId wishlist tidak boleh diubah (immutable)');
  const now = new Date().toISOString();
  const item = {
    id: original?.id ?? data.id ?? crypto.randomUUID(), groupId,
    name: trimmed(data.name !== undefined ? data.name : original?.name),
    price: data.price !== undefined ? data.price : original?.price,
    priority: data.priority !== undefined ? data.priority : original?.priority ?? 'medium',
    createdAt: original?.createdAt ?? now, updatedAt: now,
  };
  for (const field of ['notes', 'marketplaceName', 'productUrl']) {
    if (!Object.hasOwn(data, field) && !(original && Object.hasOwn(original, field))) continue;
    const value = Object.hasOwn(data, field) ? data[field] : original[field];
    // Reject malformed/oversized raw input before normalization can hide it.
    if (typeof value !== 'string' || value.length > 1000) {
      throw new Error(field === 'notes' ? 'Catatan maksimal 1000 karakter dan harus berupa teks' : 'Referensi marketplace maksimal 1000 karakter');
    }
    item[field] = trimmed(value);
  }
  const error = validateWishlistItem(item);
  if (error) throw new Error(error);
  return item;
}

function immutable(data, original, fields) {
  for (const field of fields) {
    if (original && data[field] !== undefined && data[field] !== original[field]) throw new Error(`${field} wishlist tidak boleh diubah (immutable)`);
  }
}
const trimmed = value => typeof value === 'string' ? value.trim() : value;

/** Metadata editor: items are preserved on updates; use item operations to change them. */
export function prepareWishlistGroup(data, original = null) {
  immutable(data, original, ['id', 'createdAt']);
  const now = new Date().toISOString();
  const group = {
    id: original?.id ?? data.id ?? crypto.randomUUID(),
    title: trimmed(data.title !== undefined ? data.title : original?.title),
    targetBudget: data.targetBudget !== undefined ? data.targetBudget : original?.targetBudget,
    targetDate: data.targetDate !== undefined ? data.targetDate : original?.targetDate,
    createdAt: original?.createdAt ?? now,
    updatedAt: now,
    items: original?.items.map(item => ({ ...item })) ?? [],
  };
  const error = validateWishlistGroup(group);
  if (error) throw new Error(error);
  return group;
}

export function wishlistTargetLabel(targetDate, now = new Date()) {
  if (!isWishlistDate(targetDate)) throw new Error('Tanggal target tidak valid');
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (targetDate < today) return 'Lewat Target';
  if (targetDate === today) return 'Target Hari Ini';
  const [year, month, day] = targetDate.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function sortWishlistItems(items) {
  const rank = { high: 0, medium: 1, low: 2 };
  return [...items].sort((a, b) => rank[a.priority] - rank[b.priority] || compare(a.createdAt, b.createdAt) || compare(a.id, b.id));
}

export function summarizeWishlistGroup(group) {
  const error = validateWishlistGroup(group);
  if (error) throw new Error(error);
  const total = group.items.reduce((sum, item) => sum + item.price, 0);
  return { total, remaining: Math.max(group.targetBudget - total, 0), over: Math.max(total - group.targetBudget, 0) };
}

/** Comparison of estimated prices to the group's budget, not savings progress. */
export function wishlistBudgetComparison(group) {
  const summary = summarizeWishlistGroup(group);
  return { ...summary, percent: Math.min(100, Math.max(0, summary.total / group.targetBudget * 100)) };
}

/** Derived overview only: BigInt keeps totals across valid groups exact; never persisted. */
export function summarizeWishlistGroups(groups) {
  return groups.reduce((summary, group) => ({
    count: summary.count + 1,
    targetBudget: summary.targetBudget + BigInt(group.targetBudget),
    total: summary.total + BigInt(summarizeWishlistGroup(group).total),
  }), { count: 0, targetBudget: 0n, total: 0n });
}
