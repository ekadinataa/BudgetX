"""Private project+UID destination approvals with case/whitespace-only lookup.

Literal destinations and seed rows are retained; no fuzzy matching or network.
"""
import csv
import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path


# Transfer describes destination purpose only; it never changes transaction type.
CATEGORY_SECTIONS = {
    'Makanan & Minuman': 'needs', 'Transfer': 'needs', 'Belanja': 'wants',
    'Transportasi': 'needs', 'Kesehatan': 'needs', 'Digital': 'wants',
    'Keuangan': 'needs', 'Jasa': 'needs', 'Rekreasi & Perjalanan': 'wants',
    'Tagihan & Pemerintah': 'needs', 'Pendidikan & Anak': 'needs',
    'Organisasi & Donasi': 'wants',
}


def _text(value, name, optional=False):
    if optional and value is None:
        return ''
    if not isinstance(value, str) or (not optional and not value.strip()) or '\x00' in value:
        raise ValueError(f'invalid {name}')
    return value  # Preserve the original literal independently of the lookup key.


def normalize_destination(destination):
    """Case/whitespace lookup only; never use this for ownership resolution."""
    return ' '.join(_text(destination, 'destination').split()).casefold()


def extract_destination(parsed):
    """Read scoped merchant/biller fields, then literal endpoint; never scan mail."""
    if not isinstance(parsed, dict):
        return None
    identity = parsed.get('destination_identity')
    # Per-card policy must never collapse BRIZZI into its generic product label.
    if isinstance(identity, str) and identity.startswith('BRIZZI • '):
        return identity
    raw = parsed.get('raw_fields')
    if isinstance(raw, dict):
        labelled = raw.get('labelled_fields')
        fields = [raw] + ([labelled] if isinstance(labelled, dict) else [])
        for name in ('nama merchant', 'merchant', 'merchant/biller', 'biller', 'institusi'):
            for group in fields:
                for key, value in group.items():
                    if isinstance(key, str) and key.casefold() == name and isinstance(value, str) and value.strip():
                        return value
    return identity if isinstance(identity, str) and identity.strip() else None


def resolve_whitelist_category(record, tx_type, catalog):
    """Resolve an approved label to one exact current, type-compatible catalog ID."""
    if not isinstance(record, dict) or tx_type not in ('expense', 'income'):
        return None, None
    sections = {'income'} if tx_type == 'income' else {'needs', 'wants', 'savings', 'expense'}
    matches = {c['id'] for c in catalog if isinstance(c, dict)
               and isinstance(c.get('id'), str) and c['id'] and '/' not in c['id']
               and c.get('name') == record.get('category') and c.get('section') in sections}
    if len(matches) == 1:
        return matches.pop(), 'whitelist_' + record['source']
    return None, None


class DestinationWhitelist:
    def __init__(self, path, scope):
        self.path = Path(path)
        if not self.path.is_absolute():
            raise ValueError('whitelist path must be absolute')
        if not isinstance(scope, str) or scope.count(':') != 1 or not all(scope.split(':')):
            raise ValueError('scope must be project_id:uid')
        self.scope = scope
        self.db = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        if self.path.parent.stat().st_mode & 0o077:
            raise ValueError('whitelist directory must have private permissions')
        # Create privately before SQLite opens it; reject symlink targets.
        fd = os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            os.fchmod(fd, 0o600)
        finally:
            os.close(fd)
        try:
            self.db = sqlite3.connect(self.path, timeout=30, isolation_level=None)
            self.db.row_factory = sqlite3.Row
            self.db.execute('PRAGMA journal_mode=WAL')
            self.db.execute('PRAGMA synchronous=FULL')
            self.db.executescript('''
                CREATE TABLE IF NOT EXISTS destination_approvals(
                    scope TEXT, normalized_key TEXT, destination TEXT, category TEXT NOT NULL, tag TEXT NOT NULL,
                    source TEXT NOT NULL, verification_status TEXT NOT NULL,
                    origin_rows TEXT NOT NULL, confidence REAL, reason TEXT,
                    PRIMARY KEY(scope,normalized_key));
                CREATE TABLE IF NOT EXISTS destination_queue(
                    scope TEXT, normalized_key TEXT, destination TEXT, state TEXT NOT NULL,
                    provider TEXT, context TEXT NOT NULL, category TEXT, tag TEXT,
                    confidence REAL, reason TEXT, PRIMARY KEY(scope,normalized_key));
                CREATE TABLE IF NOT EXISTS destination_observations(
                    scope TEXT, normalized_key TEXT, destination TEXT, provider TEXT, event_id TEXT,
                    PRIMARY KEY(scope,normalized_key,provider,event_id));
            ''')
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *exc):
        if self.db is not None:
            self.db.close()
            self.db = None

    @contextmanager
    def _write(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.execute('COMMIT')
        except BaseException:
            self.db.execute('ROLLBACK')
            raise

    def _record(self, row):
        if row is None:
            return None
        record = dict(row)
        record.pop('scope')
        record.pop('normalized_key')
        record['origin_rows'] = json.loads(record['origin_rows'])
        record['row_ids'] = [r['row_id'] for r in record['origin_rows']]
        return record

    def lookup(self, destination):
        _text(destination, 'destination')
        return self._record(self.db.execute(
            'SELECT * FROM destination_approvals WHERE scope=? AND normalized_key=?',
            (self.scope, normalize_destination(destination))).fetchone())

    def records(self):
        return [self._record(r) for r in self.db.execute(
            'SELECT * FROM destination_approvals WHERE scope=? ORDER BY destination', (self.scope,))]

    def observe(self, destination, provider=None, event_id=None, context=None):
        """Queue missing destinations; first context wins, event links accumulate."""
        key = normalize_destination(destination)
        if provider is not None:
            _text(provider, 'provider')
        if event_id is not None:
            _text(event_id, 'event_id')
        safe_context = {k: v for k, v in (context or {}).items()
                        if k in {'event_type', 'transaction_type', 'destination_wallet', 'currency'}
                        and isinstance(v, str) and len(v) <= 200} if isinstance(context, dict) else {}
        with self._write():
            if self.lookup(destination):
                return False
            inserted = self.db.execute(
                "INSERT OR IGNORE INTO destination_queue VALUES(?,?,?,'pending',?,?,NULL,NULL,NULL,NULL)",
                (self.scope, key, destination, provider, json.dumps(safe_context))).rowcount
            self.db.execute('INSERT OR IGNORE INTO destination_observations VALUES(?,?,?,?,?)',
                            (self.scope, key, destination, provider or '', event_id or ''))
        return bool(inserted)

    def pending(self):
        result = []
        for row in self.db.execute("SELECT * FROM destination_queue WHERE scope=? AND state IN ('pending','admin_pending') ORDER BY rowid", (self.scope,)):
            item = dict(row)
            key = item.pop('normalized_key')
            item.pop('scope')
            item['context'] = json.loads(item['context'])
            observations = [dict(r) for r in self.db.execute(
                'SELECT destination,provider,event_id FROM destination_observations WHERE scope=? AND normalized_key=? ORDER BY rowid', (self.scope, key))]
            item['event_ids'] = list(dict.fromkeys(r['event_id'] for r in observations if r['event_id']))
            item['observations'] = observations
            result.append(item)
        return result

    def decide(self, destination, category, tag, source='admin', confidence=None, reason=None):
        """Approve admin or valid >=.9 model decisions; ambiguity stays admin_pending.

        Return the approved record, or None when review is required. An LLM may
        never replace an existing approval (especially an admin import/decision).
        """
        key = normalize_destination(destination)
        if source not in ('admin', 'llm'):
            raise ValueError('source must be admin or llm')
        tag = _text(tag, 'tag', optional=True)
        if reason is not None:
            _text(reason, 'reason')
        numeric = type(confidence) in (int, float) and 0 <= confidence <= 1
        valid_category = isinstance(category, str) and category in CATEGORY_SECTIONS
        accepted = valid_category and (source == 'admin' or numeric and confidence >= 0.9)
        if source == 'admin' and not valid_category:
            raise ValueError('invalid category')
        with self._write():
            existing = self.lookup(destination)
            if source == 'llm' and existing:
                return existing
            if not accepted:
                self.db.execute("INSERT OR IGNORE INTO destination_queue VALUES(?,?,?,'pending',NULL,'{}',NULL,NULL,NULL,NULL)",
                                (self.scope, key, destination))
                self.db.execute("UPDATE destination_queue SET state='admin_pending',category=?,tag=?,confidence=?,reason=? WHERE scope=? AND normalized_key=?",
                                (category if isinstance(category, str) else None, tag, confidence if numeric else None, reason, self.scope, key))
                return None
            origin = json.dumps(existing['origin_rows'], ensure_ascii=False) if existing else '[]'
            literal = existing['destination'] if existing else destination
            self.db.execute('''INSERT INTO destination_approvals VALUES(?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(scope,normalized_key) DO UPDATE SET
                category=excluded.category,tag=excluded.tag,source=excluded.source,
                verification_status=excluded.verification_status,confidence=excluded.confidence,reason=excluded.reason''',
                (self.scope, key, literal, category, tag, source, 'by admin' if source == 'admin' else 'high-confidence llm',
                 origin, confidence if numeric else None, reason))
            self.db.execute("UPDATE destination_queue SET state='approved',category=?,tag=?,confidence=?,reason=? WHERE scope=? AND normalized_key=?",
                            (category, tag, confidence if numeric else None, reason, self.scope, key))
            return self.lookup(destination)

    def import_csv(self, path):
        """Validate the entire upload, then atomically insert admin-authoritative rows."""
        grouped = {}
        with open(path, newline='', encoding='utf-8-sig') as source:
            reader = csv.DictReader(source)
            required = {'row_id', 'destination', 'category', 'subcategory', 'verification_status'}
            if not reader.fieldnames or not required.issubset(reader.fieldnames):
                raise ValueError('missing CSV columns')
            for row in reader:
                destination = _text(row.get('destination'), 'destination')
                category = _text(row.get('category'), 'category')
                tag = _text(row.get('subcategory'), 'subcategory', optional=True)
                _text(row.get('row_id'), 'row_id')
                _text(row.get('verification_status'), 'verification_status')
                if category not in CATEGORY_SECTIONS:
                    raise ValueError('invalid category')
                key = normalize_destination(destination)
                if key in grouped and grouped[key][:2] != (category, tag):
                    raise ValueError('conflicting duplicate destination')
                grouped.setdefault(key, (category, tag, []))[2].append(dict(row))
        with self._write():
            for key, (category, tag, rows) in grouped.items():
                self.db.execute('''INSERT INTO destination_approvals VALUES(?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(scope,normalized_key) DO UPDATE SET
                    category=excluded.category, tag=excluded.tag, source=excluded.source,
                    verification_status=excluded.verification_status, origin_rows=excluded.origin_rows,
                    confidence=NULL, reason=NULL''',
                    (self.scope, key, rows[0]['destination'], category, tag, 'admin', rows[0]['verification_status'],
                     json.dumps(rows, ensure_ascii=False), None, None))
                self.db.execute("UPDATE destination_queue SET state='approved',category=?,tag=?,confidence=NULL,reason=NULL WHERE scope=? AND normalized_key=?",
                                (category, tag, self.scope, key))
        return {'rows': sum(len(v[2]) for v in grouped.values()), 'destinations': len(grouped)}
