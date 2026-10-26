"""Conservative deterministic categories; no body scans, state or fixed IDs."""
import re


SCOPED_FIELDS = {'merchant', 'nama merchant', 'merchant/biller', 'institusi',
                 'lokasi', 'lokasi merchant', 'merchant location', 'merchant_location',
                 'product', 'produk', 'transaction_subtype', 'jenis transaksi'}
CATEGORY_NAMES = {
    'Utilitas': {'utilitas', 'utilities', 'tagihan & utilitas'},
    'Kesehatan': {'kesehatan', 'health', 'healthcare'},
    'Belanja Bulanan': {'belanja bulanan', 'groceries'},
    'Transport': {'transport', 'transportasi', 'transportation'},
}


def resolve_category(parsed, tx_type, catalog):
    """Return (current catalog ID, 'rule'), otherwise (None, None)."""
    if tx_type != 'expense' or not isinstance(parsed, dict) or not isinstance(catalog, (list, tuple)):
        return None, None
    raw = parsed.get('raw_fields') or {}
    if not isinstance(raw, dict):
        return None, None
    labelled = raw.get('labelled_fields') or {}
    if not isinstance(labelled, dict):
        return None, None
    evidence = [value for fields in (raw, labelled) for key, value in fields.items()
                if isinstance(key, str) and key.casefold() in SCOPED_FIELDS
                and isinstance(value, str)]
    if parsed.get('event_type') == 'qris_payment' and isinstance(raw.get('To'), str):
        evidence.append(raw['To'])  # Jago QRIS recipient is merchant; transfers are not.
    note = parsed.get('note') or ''
    if not isinstance(note, str):
        return None, None
    electricity = (parsed.get('event_type') == 'electricity_payment'
                   or any(re.search(r'\bpln\b|\btoken\s+listrik\b', value, re.I)
                          for value in evidence)
                   or re.fullmatch(r'\s*(?:pembelian|pembayaran|isi ulang)\s+(?:token\s+)?(?:pln|listrik)(?:\s+berhasil)?\s*', note, re.I))
    healthcare = (any(re.search(r'\bbpjs\s+kesehatan\b|\bapotek\b', value, re.I)
                      for value in evidence)
                  or re.fullmatch(r'\s*pembayaran\s+bpjs\s+kesehatan(?:\s+berhasil)?\s*', note, re.I))
    groceries = any(re.search(r'\b(?:indomaret|alfamart|supermarket)\b', value, re.I)
                    for value in evidence)
    transport = any(re.search(r'\bspbu\b|^\s*shell\b', value, re.I)
                    for value in evidence)
    if any(re.search(r'\bbpjs\s+ketenagakerjaan\b', value, re.I)
           for value in evidence + [note]):
        return None, None
    targets = {name for name, matched in [('Utilitas', electricity), ('Kesehatan', healthcare),
               ('Belanja Bulanan', groceries), ('Transport', transport)] if matched}
    if len(targets) == 1:
        target = targets.pop()
        matches = {c['id'] for c in catalog
                   if isinstance(c, dict) and isinstance(c.get('name'), str)
                   and isinstance(c.get('id'), str) and c['id'].strip()
                   and ' '.join(c['name'].casefold().split()) in CATEGORY_NAMES[target]
                   and c.get('section') in ('needs', 'wants', 'savings')}
        if len(matches) == 1:
            return matches.pop(), 'rule'
    return None, None
