/** Only category changed: never replay balances or overwrite unrelated mesh fields. */
export function isCategoryOnlyChange(previous, data) {
  if (!previous || !Object.hasOwn(data, 'categoryId')) return false;
  const normalize = (key, value) => key === 'tags' ? (value || [])
    : key === 'amount' ? Number(value) : (value ?? '');
  return ['date', 'walletId', 'type', 'amount', 'note', 'tags', 'toWalletId'].every(key =>
    !Object.hasOwn(data, key) || JSON.stringify(normalize(key, data[key])) === JSON.stringify(normalize(key, previous[key])));
}
