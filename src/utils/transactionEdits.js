/** Only category changed: never replay balances or overwrite unrelated mesh fields. */
export function isCategoryOnlyChange(previous, data) {
  if (!previous || !Object.hasOwn(data, 'categoryId')) return false;
  const normalize = (key, value) => key === 'tags' ? (value || [])
    : key === 'amount' ? Number(value) : (value ?? '');
  const financialFields = ['amount', 'walletId', 'toWalletId', 'type'];
  // ponytail: financial fields always compared - partial update cannot bypass
  if (!financialFields.every(key =>
    JSON.stringify(normalize(key, data[key])) === JSON.stringify(normalize(key, previous[key])))) return false;
  return ['date', 'note', 'tags'].every(key =>
    !Object.hasOwn(data, key) || JSON.stringify(normalize(key, data[key])) === JSON.stringify(normalize(key, previous[key])));
}
