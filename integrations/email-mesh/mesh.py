#!/usr/bin/env python3
"""Deterministic, scoped Gmail evidence ledger. No model calls."""
import argparse
import fcntl
import hashlib
import importlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

PROJECT = 'budgetku-app-v1'
UID = 'VCqdnx9zvJVrZQSNp6gyGm6Zzhr2'
EMAIL = 'demo@budgetx.id'
UTC = timezone.utc
JAKARTA = ZoneInfo('Asia/Jakarta')
_UNSET_APPROVAL = object()


def dumps(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


def digest(value):
    return hashlib.sha256(dumps(value).encode()).hexdigest()


def instant(value):
    if isinstance(value, datetime):
        result = value
    else:
        try:
            result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        except ValueError:
            result = parsedate_to_datetime(str(value))
    if result.tzinfo is None:
        raise ValueError('timezone required')
    return result.astimezone(UTC)


def event_kind(p):
    kind = p.get('event_type')
    if kind in ('transfer_in', 'transfer_out', 'ewallet_topup', 'electronic_money_topup', 'credit_repayment', 'repayment'):
        return 'transfer'
    if kind in ('credit_purchase', 'card_purchase', 'qris_payment', 'electricity_payment', 'data_payment', 'airtime_payment', 'tax_payment', 'partner_payment', 'merchant_payment', 'virtual_account_payment', 'bill_payment', 'purchase'):
        return 'expense'
    if kind == 'authorization_hold':
        return 'hold'
    return kind


def validate_config(c):
    if (c.get('project_id'), c.get('uid'), c.get('email')) != (PROJECT, UID, EMAIL):
        raise ValueError('only verified demo target is allowed')
    if c.get('account_id') != 'akun-1':
        raise ValueError('only akun-1 is authorized')
    instant(c['checkpoint_at'])
    for key in ('db_path', 'token_path', 'client_secret_path', 'firebase_admin_path',
                'archive_path', 'raw_archive_dir', 'harvest_dir', 'destination_whitelist_path'):
        if key in c and not Path(c[key]).is_absolute():
            raise ValueError(f'{key} must be absolute')
    if c.get('destination_whitelist_path') and Path(c['destination_whitelist_path']).resolve() == Path(c['db_path']).resolve():
        raise ValueError('whitelist database must be separate from financial ledger')
    if not c.get('mailbox_email') or not c.get('sender_allowlist'):
        raise ValueError('mailbox_email and exact sender_allowlist required')
    if any('shopee' in sender.lower() for sender in c['sender_allowlist']):
        raise ValueError('Shopee sender excluded')
    wallets = c['registry']['wallets']
    ids = [w['id'] for w in wallets.values()]
    if len(ids) != len(set(ids)) or any(not x or '/' in x for x in ids):
        raise ValueError('wallet IDs must be unique document IDs')
    if any(v not in wallets for v in c['registry'].get('aliases', {}).values()):
        raise ValueError('alias targets must be registered')


SCHEMA = '''
CREATE TABLE IF NOT EXISTS mailbox(account TEXT PRIMARY KEY,email TEXT NOT NULL,cursor TEXT,last_success TEXT);
CREATE TABLE IF NOT EXISTS evidence(account TEXT,message TEXT,raw TEXT NOT NULL,archive INTEGER NOT NULL,PRIMARY KEY(account,message));
CREATE TABLE IF NOT EXISTS candidates(scope TEXT,account TEXT,message TEXT,parsed TEXT,reason TEXT,event_id TEXT,PRIMARY KEY(scope,account,message));
CREATE TABLE IF NOT EXISTS events(scope TEXT,id TEXT,provider TEXT,reference TEXT,facility TEXT,signature TEXT,at REAL,parsed TEXT,state TEXT,PRIMARY KEY(scope,id));
CREATE INDEX IF NOT EXISTS event_match ON events(scope,signature,at);
CREATE INDEX IF NOT EXISTS event_reference ON events(scope,provider,reference,facility);
CREATE TABLE IF NOT EXISTS event_evidence(scope TEXT,event_id TEXT,account TEXT,message TEXT,PRIMARY KEY(scope,event_id,account,message));
CREATE TABLE IF NOT EXISTS movements(scope TEXT,event_id TEXT,wallet TEXT,field TEXT,delta INTEGER,PRIMARY KEY(scope,event_id,wallet,field));
CREATE TABLE IF NOT EXISTS checkpoints(scope TEXT PRIMARY KEY,at TEXT,registry TEXT);
CREATE TABLE IF NOT EXISTS outbox(scope TEXT,event_id TEXT,payload TEXT,state TEXT,attempts INTEGER DEFAULT 0,next_attempt REAL DEFAULT 0,error TEXT,PRIMARY KEY(scope,event_id));
CREATE TABLE IF NOT EXISTS job_runs(id INTEGER PRIMARY KEY,scope TEXT,started TEXT,finished TEXT,status TEXT,detail TEXT);
CREATE TABLE IF NOT EXISTS registry(scope TEXT PRIMARY KEY,body TEXT);
CREATE TABLE IF NOT EXISTS aliases(scope TEXT,identity TEXT,wallet TEXT,PRIMARY KEY(scope,identity));
CREATE TABLE IF NOT EXISTS category_cache(scope TEXT,id TEXT,body TEXT,PRIMARY KEY(scope,id));
CREATE INDEX IF NOT EXISTS pending_candidates ON candidates(scope,reason);
CREATE INDEX IF NOT EXISTS retry_outbox ON outbox(scope,state,next_attempt);
CREATE INDEX IF NOT EXISTS event_window ON events(scope,at);
CREATE TABLE IF NOT EXISTS archive_imports(scope TEXT,path TEXT,completed TEXT,PRIMARY KEY(scope,path));
CREATE TABLE IF NOT EXISTS holds(scope TEXT,event_id TEXT,provider TEXT,reference TEXT,facility TEXT,source TEXT,amount INTEGER,final_id TEXT,PRIMARY KEY(scope,event_id));
'''


class MessageUnavailable(Exception):
    """A whole Gmail message is unavailable at a specific fetch stage."""
    def __init__(self, stage):
        super().__init__(stage)
        self.stage = stage


def read_message(messages, mid, stage, **kwargs):
    """Only whole-message 404s are skippable; all other failures propagate."""
    try:
        return messages.get(userId='me', id=mid, format=stage, **kwargs).execute()
    except Exception as exc:
        if getattr(getattr(exc, 'resp', None), 'status', None) == 404:
            raise MessageUnavailable(stage) from exc
        raise


class Engine:
    def __init__(self, config, parser=None, now=None):
        validate_config(config)
        self.config = config
        self.scope = config['project_id'] + ':' + config['uid']
        self.account = config['account_id']
        self.now = now or (lambda: datetime.now(UTC))
        self.parser = parser
        self.db = None
        self.lock = None
        self.whitelist = None

    def __enter__(self):
        path = Path(self.config['db_path'])
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.lock = open(str(path) + '.lock', 'a')
        os.chmod(str(path) + '.lock', 0o600)
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.db = sqlite3.connect(path)
            os.chmod(path, 0o600)
            self.db.row_factory = sqlite3.Row
            self.db.execute('PRAGMA journal_mode=WAL')
            self.db.execute('PRAGMA synchronous=FULL')
            self.db.executescript(SCHEMA)
            with self.db:
                old = self.db.execute('SELECT at,registry FROM checkpoints WHERE scope=?', (self.scope,)).fetchone()
                checkpoint = instant(self.config['checkpoint_at']).isoformat()
                if old and (old['at'] != checkpoint or old['registry'] != dumps(self.config['registry'])):
                    raise ValueError('checkpoint/registry changed: explicit reconciliation required')
                self.db.execute('INSERT OR IGNORE INTO checkpoints VALUES(?,?,?)',
                                (self.scope, checkpoint, dumps(self.config['registry'])))
                self.db.execute('INSERT OR REPLACE INTO registry VALUES(?,?)', (self.scope, dumps(self.config['registry'])))
                for identity, wallet in self.config['registry'].get('aliases', {}).items():
                    self.db.execute('INSERT OR REPLACE INTO aliases VALUES(?,?,?)', (self.scope, identity, wallet))
                for cat in self.config.get('categories', []):
                    self.db.execute('INSERT OR REPLACE INTO category_cache VALUES(?,?,?)', (self.scope, cat['id'], dumps(cat)))
            if self.config.get('destination_whitelist_path'):
                from destination_whitelist import DestinationWhitelist
                self.whitelist = DestinationWhitelist(self.config['destination_whitelist_path'], self.scope)
                self.whitelist.__enter__()
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *exc):
        if self.whitelist is not None:
            self.whitelist.__exit__(*exc)
            self.whitelist = None
        if self.db:
            self.db.close()
            self.db = None
        if self.lock:
            self.lock.close()
            self.lock = None

    def status(self):
        result = {}
        for name in ('events', 'movements', 'candidates'):
            result[name] = self.db.execute(f'SELECT count(*) FROM {name} WHERE scope=?', (self.scope,)).fetchone()[0]
        result['evidence'] = self.db.execute('SELECT count(*) FROM evidence WHERE account=?', (self.account,)).fetchone()[0]
        result['outbox_pending'] = self.db.execute("SELECT count(*) FROM outbox WHERE scope=? AND state!='sent'", (self.scope,)).fetchone()[0]
        mailbox = self.db.execute('SELECT * FROM mailbox WHERE account=?', (self.account,)).fetchone()
        result['mailbox'] = dict(mailbox) if mailbox else None
        result['quarantined'] = self.db.execute("SELECT count(*) FROM candidates WHERE scope=? AND reason NOT IN ('ready','archive','pre_checkpoint','not_transaction')", (self.scope,)).fetchone()[0]
        return result

    def ingest(self, rows, archive=False):
        with self.db:
            for row in rows:
                self._ingest(row, archive)

    def _ingest(self, row, archive=False):
        account, mid = row['account_id'], row['gmail_message_id']
        if account != self.account:
            raise ValueError('wrong evidence account')
        self.db.execute('INSERT OR IGNORE INTO evidence VALUES(?,?,?,?)', (account, mid, dumps(row), int(archive)))
        if self.db.execute('SELECT 1 FROM candidates WHERE scope=? AND account=? AND message=?', (self.scope, account, mid)).fetchone():
            return
        if archive:
            self.db.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?)', (self.scope, account, mid, None, 'archive', None))
            return
        parser = self.parser
        if parser is None:
            try:
                parser = importlib.import_module('mesh_parser').parse_email
            except (ModuleNotFoundError, AttributeError):
                parser = None
        try:
            p = parser(row, self.config['registry']) if parser else {}
            reason = self.reason(p) if parser else 'parser_missing'
        except Exception as exc:
            p, reason = {}, 'parser_error:' + type(exc).__name__
        eid = None
        if reason == 'ready':
            signature = digest([event_kind(p), p['status'], p['source_wallet'], p['destination_wallet'],
                                p['amount'], p['currency'], p.get('fee_paid'), p.get('total_debit'), p.get('total_credit')])
            provider = row.get('provider') or p.get('provenance', {}).get('provider')
            if not provider:
                reason = 'provider_missing'
            else:
                facility, ref = p.get('facility') or '', p.get('reference') or ''
                at = instant(p['notification_at']).timestamp()
                if not ref and self.db.execute('SELECT 1 FROM events WHERE scope=? AND provider=? AND facility=? AND signature=? AND at BETWEEN ? AND ?',
                                              (self.scope, provider, facility, signature, at - 120, at + 120)).fetchone():
                    self.db.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?)',
                                    (self.scope, account, mid, dumps(p), 'reference_missing_duplicate_uncertain', None))
                    return
                peers = self.db.execute('SELECT * FROM events WHERE scope=? AND provider=? AND reference=? AND facility=?',
                                        (self.scope, provider, ref, facility)).fetchall() if ref else []
                if event_kind(p) == 'hold' and any(event_kind(json.loads(x['parsed'])) != 'hold' for x in peers):
                    self.db.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?)',
                                    (self.scope, account, mid, dumps(p), 'late_hold_after_final', None))
                    return
                peers = [x for x in peers if event_kind(json.loads(x['parsed'])) == event_kind(p)]
                # Keep stored signatures stable; external identity disagreement is not a merge.
                external_sides = [side for side in ('source', 'destination') if p[side + '_wallet'] == 'EXTERNAL']
                def external_identity(parsed, side):
                    return ' '.join(str(parsed.get(side + '_identity') or '').split()).casefold()
                identity_conflict = any(
                    external_identity(json.loads(peer['parsed']), side) != external_identity(p, side)
                    for peer in peers for side in external_sides)
                if peers and (identity_conflict or any(x['signature'] != signature for x in peers)):
                    reason = 'reference_conflict'
                else:
                    matches = peers
                    if not matches and p['source_wallet'] not in ('EXTERNAL', 'UNRESOLVED') and p['destination_wallet'] not in ('EXTERNAL', 'UNRESOLVED'):
                        at = instant(p['notification_at']).timestamp()
                        matches = self.db.execute('SELECT * FROM events WHERE scope=? AND signature=? AND provider!=? AND at BETWEEN ? AND ?',
                                                  (self.scope, signature, provider, at - 120, at + 120)).fetchall()
                    if not matches and event_kind(p) == 'transfer' and p['source_wallet'] in self.config['registry']['wallets'] and p['destination_wallet'] in self.config['registry']['wallets']:
                        at = instant(p['notification_at']).timestamp()
                        nearby = self.db.execute('SELECT parsed FROM events WHERE scope=? AND provider!=? AND at BETWEEN ? AND ?',
                                                 (self.scope, provider, at - 120, at + 120)).fetchall()
                        for candidate in nearby:
                            other = json.loads(candidate['parsed'])
                            if event_kind(other) == 'transfer' and all(other.get(k) == p.get(k) for k in ('source_wallet', 'destination_wallet', 'currency', 'amount')):
                                self.db.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?)',
                                                (self.scope, account, mid, dumps(p), 'cross_provider_effect_uncertain', None))
                                return
                    if len(matches) > 1:
                        reason = 'ambiguous_match'
                    elif matches:
                        eid = matches[0]['id']
                    else:
                        eid = digest([self.scope, provider, ref, facility, signature, None if ref else [account, mid]])
                        payload = self.plan(p, eid, provider=provider)
                        if event_kind(p) != 'hold' and not ref and self.db.execute('SELECT 1 FROM holds WHERE scope=? AND source=? AND final_id IS NULL', (self.scope, p['source_wallet'])).fetchone():
                            self.db.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?)',
                                            (self.scope, account, mid, dumps(p), 'hold_link_uncertain', None))
                            return
                        if event_kind(p) == 'hold':
                            self.db.execute('INSERT INTO holds VALUES(?,?,?,?,?,?,?,?)',
                                            (self.scope, eid, provider, ref, facility, p['source_wallet'], p['amount'], None))
                        elif ref:
                            holds = self.db.execute('SELECT * FROM holds WHERE scope=? AND provider=? AND reference=? AND facility=? AND final_id IS NULL',
                                                    (self.scope, provider, ref, facility)).fetchall()
                            if holds:
                                if len(holds) != 1 or holds[0]['source'] != p['source_wallet'] or holds[0]['amount'] != p['amount']:
                                    self.db.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?)',
                                                    (self.scope, account, mid, dumps(p), 'hold_link_uncertain', None))
                                    return
                                hold = holds[0]
                                payload['movements'].append(dict(wallet=self.config['registry']['wallets'][hold['source']]['id'],
                                                                 field='heldAmount', delta=-hold['amount']))
                                payload['release_hold'] = hold['event_id']
                                self.db.execute('UPDATE holds SET final_id=? WHERE scope=? AND event_id=?', (eid, self.scope, hold['event_id']))
                        self.db.execute('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?)',
                                        (self.scope, eid, provider, ref, facility, signature, instant(p['notification_at']).timestamp(), dumps(p), 'ready'))
                        for movement in payload['movements']:
                            self.db.execute('INSERT INTO movements VALUES(?,?,?,?,?)',
                                            (self.scope, eid, movement['wallet'], movement['field'], movement['delta']))
                        self.db.execute('INSERT INTO outbox(scope,event_id,payload,state) VALUES(?,?,?,?)',
                                        (self.scope, eid, dumps(payload), 'pending'))
                    if eid:
                        self.db.execute('INSERT OR IGNORE INTO event_evidence VALUES(?,?,?,?)', (self.scope, eid, account, mid))
                        self.db.execute("UPDATE outbox SET state='pending',next_attempt=0 WHERE scope=? AND event_id=?", (self.scope, eid))
        self.db.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?)', (self.scope, account, mid, dumps(p), reason, eid))

    def verify_mailbox(self, gmail):
        profile = gmail.users().getProfile(userId='me').execute()
        if profile.get('emailAddress', '').casefold() != self.config['mailbox_email'].casefold():
            raise ValueError('Gmail mailbox identity mismatch')
        return profile

    def bootstrap(self, gmail):
        profile = self.verify_mailbox(gmail)
        # Commit cursor BEFORE archive work. Crash/restart cannot lose intervening mail.
        with self.db:
            self.db.execute('INSERT OR IGNORE INTO mailbox VALUES(?,?,?,?)',
                            (self.account, profile['emailAddress'], str(profile['historyId']), self.now().isoformat()))
        archive = self.config.get('archive_path')
        if not archive or self.db.execute('SELECT 1 FROM archive_imports WHERE scope=? AND path=?', (self.scope, archive)).fetchone():
            return
        with self.db, open(archive) as source:
            for line in source:
                if not line.strip():
                    continue
                row = json.loads(line)
                if row['account_id'] != self.account:
                    continue
                mid = row['gmail_message_id']
                if not mid or '/' in mid:
                    raise ValueError('invalid archive message ID')
                if self.config.get('raw_archive_dir'):
                    row['raw_path'] = str(Path(self.config['raw_archive_dir']) / (mid + '.json'))
                self._ingest(row, archive=True)
            self.db.execute('INSERT INTO archive_imports VALUES(?,?,?)', (self.scope, archive, self.now().isoformat()))

    def delta_ids(self, gmail, mailbox):
        ids, token, cursor = set(), None, mailbox['cursor']
        try:
            while True:
                response = gmail.users().history().list(userId='me', startHistoryId=mailbox['cursor'],
                                                       historyTypes=['messageAdded', 'labelAdded'],
                                                       maxResults=500, pageToken=token).execute()
                for history in response.get('history', []):
                    for kind in ('messagesAdded', 'labelsAdded'):
                        ids.update(x['message']['id'] for x in history.get(kind, []))
                cursor = str(response.get('historyId', cursor))
                token = response.get('nextPageToken')
                if not token:
                    return ids, cursor
        except Exception as exc:
            if getattr(getattr(exc, 'resp', None), 'status', None) != 404:
                raise
        # Read high-water cursor BEFORE overlap query, never after it.
        cursor = str(self.verify_mailbox(gmail)['historyId'])
        now = self.now().timestamp()
        since = instant(mailbox['last_success']).timestamp() - self.config.get('recovery_overlap_seconds', 300)
        if now - since > self.config.get('recovery_max_days', 7) * 86400:
            raise RuntimeError('history expired beyond bounded recovery; manual reconciliation required')
        token = None
        query = f'label:TRX after:{int(since)} before:{int(now) + 1}'
        ids = set()
        while True:
            response = gmail.users().messages().list(userId='me', q=query, maxResults=500, pageToken=token).execute()
            ids.update(x['id'] for x in response.get('messages', []))
            token = response.get('nextPageToken')
            if not token:
                return ids, cursor

    def fetch_row(self, gmail, mid, label_id):
        from email.utils import parseaddr
        messages = gmail.users().messages()
        metadata = read_message(messages, mid, 'metadata', metadataHeaders=['From'])
        sender_headers = {x['name'].lower(): x['value'] for x in metadata.get('payload', {}).get('headers', [])}
        sender = parseaddr(sender_headers.get('from', ''))[1].lower()
        allow = self.config['sender_allowlist']
        if label_id not in metadata.get('labelIds', []) or sender not in allow or 'shopee' in sender:
            return None
        full = read_message(messages, mid, 'full')
        if label_id not in full.get('labelIds', []):
            return None
        headers = {x['name'].lower(): x['value'] for x in full.get('payload', {}).get('headers', [])}
        if parseaddr(headers.get('from', ''))[1].lower() != sender:
            raise ValueError('message sender changed between metadata and full')
        import importlib.util
        spec = importlib.util.spec_from_file_location('mesh_harvest', str(Path(self.config.get('harvest_dir', Path(__file__).resolve().parent)) / 'harvest.py'))
        harvest = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(harvest)

        def attachment(aid):
            return messages.attachments().get(userId='me', messageId=mid, id=aid).execute()['data']

        plain, html, body, errors = harvest.extract_bodies(full.get('payload', {}), attachment)
        if errors:
            raise ValueError('MIME extraction failed; cursor retained for retry')
        return dict(account_id=self.account, gmail_message_id=mid, thread_id=full.get('threadId'),
                    email_address=self.config['mailbox_email'], **{'from': headers.get('from', '')},
                    subject=headers.get('subject', ''), date=headers.get('date', ''),
                    labels=full.get('labelIds', []), body_plain=plain, body_html=html,
                    body_normalized=body, extraction_errors=errors,
                    internalDate=full.get('internalDate'), raw_gmail=full, provider=allow[sender])

    def run(self, gmail):
        mailbox = self.db.execute('SELECT * FROM mailbox WHERE account=?', (self.account,)).fetchone()
        if not mailbox:
            raise ValueError('bootstrap required')
        if mailbox['email'].casefold() != self.config['mailbox_email'].casefold():
            raise ValueError('stored mailbox identity mismatch')
        self.verify_mailbox(gmail)
        with self.db:
            job = self.db.execute('INSERT INTO job_runs(scope,started,status) VALUES(?,?,?)',
                                  (self.scope, self.now().isoformat(), 'running')).lastrowid
        try:
            # Conservative acquisition boundary covers mail arriving during pagination/fetch.
            cursor_acquired_at = self.now().isoformat()
            ids, cursor = self.delta_ids(gmail, mailbox)
            labels = gmail.users().labels().list(userId='me').execute().get('labels', []) if ids else []
            label_ids = [x['id'] for x in labels if x['name'] == 'TRX']
            if ids and len(label_ids) != 1:
                raise ValueError('TRX label missing or ambiguous')
            rows, unavailable = [], []
            for mid in sorted(ids):
                if self.db.execute('SELECT 1 FROM evidence WHERE account=? AND message=?', (self.account, mid)).fetchone():
                    continue
                try:
                    row = self.fetch_row(gmail, mid, label_ids[0])
                except MessageUnavailable as exc:
                    unavailable.append({'message': mid, 'stage': exc.stage})
                    continue
                if row:
                    rows.append(row)
            with self.db:
                for row in rows:
                    self._ingest(row)
                self.db.execute('UPDATE mailbox SET cursor=?,last_success=? WHERE account=?',
                                (cursor, cursor_acquired_at, self.account))
                self.db.execute('UPDATE job_runs SET finished=?,status=?,detail=? WHERE id=?',
                                (self.now().isoformat(), 'success', dumps({'fetched': len(rows), 'delta_ids': len(ids),
                                                                        'unavailable_messages': unavailable}), job))
        except BaseException as exc:
            with self.db:
                self.db.execute('UPDATE job_runs SET finished=?,status=?,detail=? WHERE id=?',
                                (self.now().isoformat(), 'failed', type(exc).__name__, job))
            raise
        return self.status()

    def reparse_pending(self):
        # Indexed candidate subset only; never replay archive or posted balance effects.
        pending = self.db.execute("""
            SELECT e.raw FROM candidates c
            JOIN evidence e ON e.account=c.account AND e.message=c.message
            WHERE c.scope=? AND e.archive=0 AND c.event_id IS NULL
            AND NOT EXISTS (
                SELECT 1 FROM event_evidence b
                WHERE b.scope=c.scope AND b.account=c.account AND b.message=c.message
            ) AND (
                c.reason IN ('parser_missing','unknown_template','unknown_fee','unresolved_endpoint')
                OR c.reason LIKE 'parser_error:%'
                OR (c.reason='ineligible' AND EXISTS (
                    SELECT 1 FROM json_each(c.parsed, '$.validation_errors')
                    WHERE value IN ('unknown_template','unresolved_source','unresolved_destination')
                ))
            )""", (self.scope,)).fetchall()
        with self.db:
            for item in pending:
                row = json.loads(item['raw'])
                self.db.execute('DELETE FROM candidates WHERE scope=? AND account=? AND message=?',
                                (self.scope, row['account_id'], row['gmail_message_id']))
                self._ingest(row)

    def reconcile_incoming(self, now=None):
        """Attach unique confirmed-owner receipts; never create events or movements."""
        from reconciliation import match_incoming
        names = self.config.get('owner_names', [])
        if not names:
            return
        now = self.now().timestamp() if now is None else now
        candidates = self.db.execute("""SELECT c.* FROM candidates c JOIN evidence e
            ON e.account=c.account AND e.message=c.message
            WHERE c.scope=? AND e.archive=0 AND c.reason NOT IN ('archive','pre_checkpoint','not_transaction')
            AND json_extract(c.parsed,'$.event_type')='transfer_in'""", (self.scope,)).fetchall()
        receipts = [json.loads(r['parsed']) for r in candidates]
        with self.db:
            for r, p in zip(candidates, receipts):
                if r['event_id'] or r['reason'] != 'ineligible':
                    continue
                if instant(p['notification_at']) < instant(self.config['checkpoint_at']):
                    continue
                at = instant(p['notification_at']).timestamp()
                # Notification window widened for late emails; matcher uses body transaction time.
                events = [(x['id'], json.loads(x['parsed'])) for x in self.db.execute(
                    'SELECT id,parsed FROM events WHERE scope=? AND at BETWEEN ? AND ?',
                    (self.scope, at - 86400, at + 86400))]
                events.extend((None, json.loads(x['parsed'])) for x in self.db.execute("""
                    SELECT parsed FROM candidates WHERE scope=? AND event_id IS NULL
                    AND reason NOT IN ('archive','pre_checkpoint','not_transaction')
                    AND json_extract(parsed,'$.event_type')='transfer_out'""", (self.scope,)))
                eid = match_incoming(p, events, receipts, names, self.config['registry']['wallets'], now)
                if not eid:
                    continue
                self.db.execute('INSERT OR IGNORE INTO event_evidence VALUES(?,?,?,?)',
                                (self.scope, eid, r['account'], r['message']))
                self.db.execute("UPDATE candidates SET reason='ready',event_id=? WHERE scope=? AND account=? AND message=?",
                                (eid, self.scope, r['account'], r['message']))
                self.db.execute("UPDATE outbox SET state='pending',next_attempt=0 WHERE scope=? AND event_id=?",
                                (self.scope, eid))

    def drain(self, publisher, force=False):
        pending = self.db.execute("SELECT * FROM outbox WHERE scope=? AND state!='sent' AND next_attempt<=? ORDER BY rowid",
                                  (self.scope, 1e20 if force else self.now().timestamp())).fetchall()
        for item in pending:
            payload = json.loads(item['payload'])
            # Receipt-review events have a dedicated owner that verifies exact cloud
            # marker/components before acknowledging publication, including retries.
            if payload.get('parsed', {}).get('financial_review'):
                continue
            release = payload.get('release_hold')
            if release:
                hold = self.db.execute('SELECT state FROM outbox WHERE scope=? AND event_id=?', (self.scope, release)).fetchone()
                if not hold or hold['state'] != 'sent':
                    continue
            payload['evidence'] = [dict(r) for r in self.db.execute('SELECT account,message FROM event_evidence WHERE scope=? AND event_id=? ORDER BY account,message', (self.scope, item['event_id']))]
            try:
                publisher.apply(payload)
            except Exception as exc:
                attempts = item['attempts'] + 1
                with self.db:
                    self.db.execute('UPDATE outbox SET attempts=?,next_attempt=?,error=? WHERE scope=? AND event_id=?',
                                    (attempts, self.now().timestamp() + min(3600, 2 ** min(attempts, 12)),
                                     type(exc).__name__, self.scope, item['event_id']))
            else:
                with self.db:
                    self.db.execute("UPDATE outbox SET state='sent',error=NULL WHERE scope=? AND event_id=?", (self.scope, item['event_id']))

    def reason(self, p):
        if not p.get('is_transaction'):
            return 'not_transaction'
        holding_errors = {'status_not_success:hold', 'status_not_success:pending'}
        hold_valid = event_kind(p) == 'hold' and not (set(p.get('validation_errors') or []) - holding_errors)
        if (not p.get('eligible') or p.get('validation_errors')) and not hold_valid:
            return 'ineligible'
        holding = event_kind(p) == 'hold' and p.get('status') in ('pending', 'hold', 'authorized')
        if not holding and p.get('status') not in ('success', 'completed', 'settled'):
            return 'status_not_final'
        if event_kind(p) not in ('transfer', 'expense', 'income', 'gold_sale', 'hold'):
            return 'event_not_supported'
        if p.get('currency') != 'IDR' or type(p.get('amount')) is not int or p['amount'] <= 0:
            return 'invalid_money'
        for key in ('fee_paid', 'fee_displayed', 'total_debit', 'total_credit'):
            if p.get(key) is not None and (type(p[key]) is not int or p[key] < 0):
                return 'invalid_money'
        wallets = self.config['registry']['wallets']
        source, destination = p.get('source_wallet'), p.get('destination_wallet')
        if any(w not in wallets and w != 'EXTERNAL' for w in (source, destination)) or source == destination:
            return 'unresolved_endpoint'
        kind = event_kind(p)
        if kind in ('expense', 'hold') and source == 'EXTERNAL':
            return 'invalid_direction'
        if kind == 'expense' and destination != 'EXTERNAL':
            return 'invalid_direction'
        if kind == 'income' and (source != 'EXTERNAL' or destination == 'EXTERNAL'):
            return 'invalid_direction'
        try:
            if instant(p['notification_at']) < instant(self.config['checkpoint_at']):
                return 'pre_checkpoint'
        except (KeyError, TypeError, ValueError):
            return 'invalid_notification_time'
        if holding:
            if not p.get('reference') or source not in wallets or wallets[source].get('type') not in ('credit', 'paylater'):
                return 'hold_link_uncertain'
            return 'ready'
        if p.get('fee_paid') is None and p.get('fee_displayed') not in (None, 0):
            return 'unknown_fee'
        fee = p.get('fee_paid') or 0
        if fee and source == 'EXTERNAL' and event_kind(p) != 'gold_sale':
            return 'fee_payer_unresolved'
        debit, credit = p.get('total_debit'), p.get('total_credit')
        principal = credit if destination != 'EXTERNAL' and credit is not None else p['amount']
        if event_kind(p) == 'gold_sale':
            if destination not in wallets or credit != p['amount'] - fee:
                return 'inconsistent_gold_totals'
            return 'ready'
        if principal <= 0 or (source != 'EXTERNAL' and debit is not None and debit != principal + fee):
            return 'inconsistent_totals'
        if destination != 'EXTERNAL' and credit is not None and credit not in (p['amount'], p['amount'] - fee):
            return 'inconsistent_totals'
        return 'ready'

    def category(self, p, tx_type, *, approval=_UNSET_APPROVAL):
        """Return a current catalog ID and rule/hint/whitelist source, or null."""
        if tx_type == 'transfer':
            return None, None
        catalog = [json.loads(r[0]) for r in self.db.execute('SELECT body FROM category_cache WHERE scope=?', (self.scope,))]
        sections = {'income'} if tx_type == 'income' else {'needs', 'wants', 'savings', 'expense'}
        valid = {c['id']: c for c in catalog if c.get('section') in sections}
        ref = p.get('reference') or ''
        override = self.config.get('category_overrides', {}).get(ref)
        if override in valid:
            return override, 'rule'
        name = self.config.get('destination_category_overrides', {}).get(p.get('destination_identity'))
        if tx_type == 'expense' and name:
            matches = [c['id'] for c in valid.values() if c.get('name', '').casefold() == name.casefold()]
            return (matches[0], 'rule') if len(matches) == 1 else (None, None)
        if str(p.get('destination_identity') or '').startswith('BRIZZI • '):
            return None, None  # Product classification cannot establish an unknown card's spending purpose.
        if self.whitelist is not None:
            from destination_whitelist import extract_destination, resolve_whitelist_category
            observed = extract_destination(p)
            record = approval
            if record is _UNSET_APPROVAL:
                record = self.whitelist.lookup(observed) if observed else None
            return resolve_whitelist_category(record, tx_type, catalog)

        from category_rules import resolve_category
        hint = str(p.get('category_hint') or '').casefold()
        if hint in valid:
            return hint, 'hint'
        if hint in ('pln', 'listrik'):
            category_id, _ = resolve_category(dict(p, event_type='electricity_payment'), tx_type, catalog)
            if category_id:
                return category_id, 'hint'
        category_id, source = resolve_category(p, tx_type, catalog)
        if category_id:
            return category_id, source
        matches = [c['id'] for c in valid.values() if hint and c.get('name', '').casefold() == hint]
        if len(matches) == 1:
            return matches[0], 'hint'
        return None, None

    def plan(self, p, eid, provider=None):
        source, destination = p['source_wallet'], p['destination_wallet']
        wallets = self.config['registry']['wallets']
        # Determine mesh_type: INCOMING/OUTGOING/INTERNAL
        if source == 'EXTERNAL':
            mesh_type = 'INCOMING'
        elif destination == 'EXTERNAL':
            mesh_type = 'OUTGOING'
        else:
            mesh_type = 'INTERNAL'
        if event_kind(p) == 'hold':
            return {'event_id': eid, 'scope': self.scope, 'components': [],
                    'movements': [dict(wallet=wallets[source]['id'], field='heldAmount', delta=p['amount'])],
                    'parsed': p, 'checkpoint_at': self.config['checkpoint_at']}
        gold = event_kind(p) == 'gold_sale'
        amount = p['amount'] if gold else (p.get('total_credit') if destination != 'EXTERNAL' and p.get('total_credit') is not None else p['amount'])
        date = instant(p['notification_at']).astimezone(JAKARTA).date().isoformat()
        tags = ['email-mesh']
        identity = p.get('destination_identity') or ''
        if destination == 'EXTERNAL' and identity.startswith('BRIZZI • '):
            tag = self.config.get('destination_tag_overrides', {}).get(identity)
            tags = [tag] if tag else []
        base = dict(date=date, categoryId=None, note=str(p.get('note') or '')[:1000], tags=tags,
                    toWalletId=None, mesh_type=mesh_type, mesh={'eventId': eid, 'scope': self.scope, 'currency': p['currency']})
        if gold and source != 'EXTERNAL':
            principal = dict(base, type='transfer', walletId=wallets[source]['id'], toWalletId=wallets[destination]['id'], amount=amount)
        elif source == 'EXTERNAL':
            principal = dict(base, type='income', walletId=wallets[destination]['id'], amount=amount)
        elif destination == 'EXTERNAL':
            principal = dict(base, type='expense', walletId=wallets[source]['id'], amount=amount)
        else:
            principal = dict(base, type='transfer', walletId=wallets[source]['id'], toWalletId=wallets[destination]['id'], amount=amount)
        if self.whitelist is not None:
            from destination_whitelist import extract_destination
            observed = extract_destination(p)
            if observed:
                self.whitelist.observe(observed, provider=provider or p.get('provenance', {}).get('provider'),
                                       event_id=eid, context={'event_type': p.get('event_type'),
                                       'transaction_type': principal['type'], 'currency': p.get('currency')})
        record = self.whitelist.lookup(observed) if self.whitelist is not None and observed and not identity.startswith('BRIZZI • ') else None
        cat_id, cat_source = self.category(p, principal['type'], approval=record)
        principal['categoryId'] = cat_id
        principal['category_source'] = cat_source
        principal['category_status'] = 'classified' if cat_id else 'unclassified'
        if self.whitelist is not None:
            user_tags = [t for t in p.get('tags', []) if isinstance(t, str) and t] if isinstance(p.get('tags'), list) else []
            merged = list(dict.fromkeys(tags + user_tags))
            if record:
                principal['destination_category'] = record['category']
                principal['destination_tag'] = record['tag']
                principal['destination_name'] = record['destination']
                principal['destination_source'] = record['source']
                principal['destination'] = observed  # Keep the observed literal, not the normalized key.
                if record['tag']:
                    merged = list(dict.fromkeys(merged + [record['tag']]))
            principal['tags'] = merged
        components = [principal]
        if p.get('fee_paid'):
            fee_component = dict(base, type='expense', walletId=wallets[destination if gold else source]['id'], amount=p['fee_paid'], note='Paid fee: ' + base['note'])
            if self.whitelist is not None:
                merchant_tags = {record['tag']} if record else set()
                card_tag = self.config.get('destination_tag_overrides', {}).get(identity)
                if card_tag:
                    merchant_tags.add(card_tag)
                fee_component['tags'] = list(dict.fromkeys(t for t in ['email-mesh'] + user_tags if t not in merchant_tags))
            fee_component['category_source'] = None
            fee_component['category_status'] = 'unclassified'
            components.append(fee_component)
        effects = {}
        for tx in components:
            wid = tx['walletId']
            effects[wid] = effects.get(wid, 0) + (tx['amount'] if tx['type'] == 'income' else -tx['amount'])
            if tx['toWalletId']:
                wid = tx['toWalletId']
                effects[wid] = effects.get(wid, 0) + tx['amount']
        movements = [dict(wallet=wid, field='balance', delta=delta) for wid, delta in effects.items()]
        return {'event_id': eid, 'scope': self.scope, 'components': components, 'movements': movements,
                'parsed': p, 'checkpoint_at': self.config['checkpoint_at']}


class FirestorePublisher:
    """Auth gate, atomic create-once marker, components and wallet increments."""
    def __init__(self, config, db=None, auth_lookup=None, transaction_runner=None):
        validate_config(config)
        self.config = config
        self.scope = config['project_id'] + ':' + config['uid']
        from firebase_admin import auth, credentials, firestore, initialize_app
        self.firestore = firestore
        if db is None:
            path = Path(config['firebase_admin_path'])
            if path.stat().st_mode & 0o077:
                raise ValueError('Admin credential must have private permissions')
            credential = credentials.Certificate(str(path))
            if credential.project_id != config['project_id']:
                raise ValueError('credential project mismatch')
            self.app = initialize_app(credential, {'projectId': config['project_id']}, name='email-mesh-' + digest(self.scope)[:16])
            user = auth.get_user_by_email(config['email'], app=self.app)
            uid, email = user.uid, user.email
            self.db = firestore.client(app=self.app)
            if self.db.project != config['project_id']:
                raise ValueError('Firestore project mismatch')
        else:
            if auth_lookup is None:
                raise ValueError('injected database requires explicit Auth verifier')
            self.db = db
            uid, email = auth_lookup(config['email'])
        if uid != config['uid'] or email.casefold() != config['email'].casefold():
            raise ValueError('Firebase Auth UID/email mismatch')
        self.runner = transaction_runner or firestore.transactional
        self.base = 'users/' + config['uid']

    def refresh_categories(self, engine):
        categories = list(self.db.collection(self.base + '/categories').stream())
        with engine.db:
            engine.db.execute('DELETE FROM category_cache WHERE scope=?', (self.scope,))
            for cat in categories:
                engine.db.execute('INSERT INTO category_cache VALUES(?,?,?)', (self.scope, cat.id, dumps(dict(cat.to_dict(), id=cat.id))))

    def update_category(self, component_id, category_id, expected_category=None):
        """Compare-and-set category only. Never reverse/reapply money; manual edits win."""
        if not component_id.startswith('demo-mesh-') or '/' in component_id:
            raise ValueError('only mesh components can be categorized')
        if category_id is not None and ('/' in category_id or not category_id):
            raise ValueError('invalid category ID')
        ref = self.db.document(self.base + '/transactions/' + component_id)
        changed = False

        @self.runner
        def correct(transaction):
            nonlocal changed
            tx = ref.get(transaction=transaction)
            if not tx.exists or tx.to_dict().get('categoryId') != expected_category:
                return
            body = tx.to_dict()
            if body.get('category_source') == 'manual':
                return
            if body.get('mesh', {}).get('scope') != self.scope:
                raise ValueError('category namespace mismatch')
            if body['type'] == 'transfer' and category_id is not None:
                raise ValueError('transfer principal must be uncategorized')
            if category_id is not None:
                category = self.db.document(self.base + '/categories/' + category_id).get(transaction=transaction)
                sections = {'income'} if body['type'] == 'income' else {'needs', 'wants', 'savings', 'expense'}
                if not category.exists or category.to_dict().get('section') not in sections:
                    raise ValueError('incompatible category')
            transaction.update(ref, {'categoryId': category_id})
            changed = True

        correct(self.db.transaction())
        return changed

    def apply(self, payload):
        if payload['scope'] != self.scope or payload['checkpoint_at'] != self.config['checkpoint_at']:
            raise ValueError('publication namespace/checkpoint mismatch')
        allowed = {w['id'] for w in self.config['registry']['wallets'].values()}
        expected_balance = {}
        event_date = instant(payload['parsed']['notification_at']).astimezone(JAKARTA).date().isoformat()
        for component in payload['components']:
            wid, amount, kind = component.get('walletId'), component.get('amount'), component.get('type')
            if wid not in allowed or type(amount) is not int or amount <= 0 or kind not in ('income', 'expense', 'transfer'):
                raise ValueError('invalid component')
            if component.get('date') != event_date or component.get('mesh', {}).get('scope') != self.scope:
                raise ValueError('component date/namespace mismatch')
            expected_balance[wid] = expected_balance.get(wid, 0) + (amount if kind == 'income' else -amount)
            dest = component.get('toWalletId')
            if kind == 'transfer':
                if dest not in allowed or dest == wid:
                    raise ValueError('invalid transfer destination')
                expected_balance[dest] = expected_balance.get(dest, 0) + amount
            elif dest is not None:
                raise ValueError('unexpected component destination')
        actual_balance, holds, keys = {}, [], set()
        for movement in payload['movements']:
            wid, field, delta = movement['wallet'], movement['field'], movement['delta']
            key = (wid, field)
            if key in keys or wid not in allowed or field not in ('balance', 'heldAmount') or type(delta) is not int:
                raise ValueError('invalid/duplicate movement')
            keys.add(key)
            if field == 'balance':
                actual_balance[wid] = delta
            else:
                holds.append(movement)
        if actual_balance != expected_balance:
            raise ValueError('components do not match balance effects')
        if event_kind(payload['parsed']) == 'hold':
            source = self.config['registry']['wallets'][payload['parsed']['source_wallet']]['id']
            if payload['components'] or holds != [dict(wallet=source, field='heldAmount', delta=payload['parsed']['amount'])]:
                raise ValueError('invalid hold effect')
        elif holds:
            source = self.config['registry']['wallets'].get(payload['parsed']['source_wallet'], {}).get('id')
            if not payload.get('release_hold') or holds != [dict(wallet=source, field='heldAmount', delta=-payload['parsed']['amount'])]:
                raise ValueError('unlinked hold movement')
        if instant(payload['parsed']['notification_at']) < instant(self.config['checkpoint_at']):
            raise ValueError('pre-checkpoint publication rejected')
        eid = payload['event_id']
        if len(eid) != 64 or any(c not in '0123456789abcdef' for c in eid):
            raise ValueError('invalid event document ID')
        marker = self.db.document(self.base + '/mesh_events/demo-' + eid)
        checkpoint = self.db.document(self.base + '/mesh_state/demo-checkpoint')
        evidence = payload.get('evidence', [])
        immutable = digest({k: payload[k] for k in ('scope', 'event_id', 'movements', 'checkpoint_at')})

        @self.runner
        def publish(transaction):
            existing = marker.get(transaction=transaction)
            cp = checkpoint.get(transaction=transaction)
            if cp.exists and cp.to_dict().get('checkpoint_at') != self.config['checkpoint_at']:
                raise ValueError('cloud checkpoint mismatch')
            if existing.exists:
                if existing.to_dict().get('effect_hash') != immutable:
                    raise ValueError('canonical balance effect changed')
                transaction.set(marker, {'evidence': evidence}, merge=True)
                return
            refs = {}
            for movement in payload['movements']:
                wallet, field, delta = movement['wallet'], movement['field'], movement['delta']
                if wallet not in {w['id'] for w in self.config['registry']['wallets'].values()} or field not in ('balance', 'heldAmount') or type(delta) is not int:
                    raise ValueError('invalid wallet movement')
                refs[wallet] = self.db.document(self.base + '/wallets/' + wallet)
            wallets = {wid: ref.get(transaction=transaction) for wid, ref in refs.items()}
            release = payload.get('release_hold')
            if release:
                hold = self.db.document(self.base + '/mesh_events/demo-' + release).get(transaction=transaction)
                if not hold.exists:
                    raise ValueError('hold not published')
            tx_refs = [self.db.document(self.base + '/transactions/demo-mesh-' + eid + '-' + str(i)) for i, _ in enumerate(payload['components'])]
            if any(ref.get(transaction=transaction).exists for ref in tx_refs):
                raise ValueError('component exists without marker; reconcile manually')
            for component in payload['components']:
                cid = component.get('categoryId')
                if component['type'] == 'transfer' and cid is not None:
                    raise ValueError('transfer principal must be uncategorized')
                if cid is not None:
                    if not isinstance(cid, str) or not cid or '/' in cid:
                        raise ValueError('invalid category ID')
                    cat = self.db.document(self.base + '/categories/' + cid).get(transaction=transaction)
                    sections = {'income'} if component['type'] == 'income' else {'needs', 'wants', 'savings', 'expense'}
                    if not cat.exists or cat.to_dict().get('section') not in sections:
                        raise ValueError('category missing or incompatible')
            for movement in payload['movements']:
                snap = wallets[movement['wallet']]
                if not snap.exists:
                    raise ValueError('registered wallet missing')
                if movement['field'] == 'heldAmount' and (snap.to_dict().get('heldAmount') or 0) + movement['delta'] < 0:
                    raise ValueError('hold release would make heldAmount negative')
            if not cp.exists:
                transaction.create(checkpoint, {'checkpoint_at': self.config['checkpoint_at'], 'scope': self.scope, 'basis': 'demo_simulation'})
            transaction.create(marker, {'scope': self.scope, 'event_id': eid, 'effect_hash': immutable,
                                        'checkpoint_at': payload['checkpoint_at'], 'parsed': payload['parsed'], 'evidence': evidence})
            for ref, component in zip(tx_refs, payload['components']):
                if type(component['amount']) is not int or component['amount'] <= 0 or component['type'] not in ('income', 'expense', 'transfer'):
                    raise ValueError('invalid legacy component')
                transaction.create(ref, component)
            for movement in payload['movements']:
                transaction.update(refs[movement['wallet']], {movement['field']: self.firestore.Increment(movement['delta'])})

        publish(self.db.transaction())


def load_config(path):
    file = Path(path)
    if not file.is_absolute():
        raise ValueError('--config must be absolute')
    if file.stat().st_mode & 0o077:
        raise ValueError('config must have private permissions (chmod 600)')
    c = json.loads(file.read_text())
    validate_config(c)
    return c


def build_gmail(c):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    path = Path(c['token_path'])
    if path.stat().st_mode & 0o077:
        raise ValueError('OAuth token must have private permissions (chmod 600)')
    creds = Credentials.from_authorized_user_file(str(path), ['https://www.googleapis.com/auth/gmail.readonly'])
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        # Atomic private token replacement; never log OAuth values.
        temporary = path.with_suffix('.mesh-refresh')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, 'w') as target:
                target.write(creds.to_json())
                target.flush()
                os.fsync(target.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
    if not creds.valid:
        raise ValueError('OAuth authorization required outside mesh; no interactive auth')
    return build('gmail', 'v1', credentials=creds, cache_discovery=False)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, help='private absolute JSON path')
    parser.add_argument('--no-publish', action='store_true', help='retain durable outbox without Firebase access')
    parser.add_argument('command', choices=['bootstrap', 'run', 'status'])
    args = parser.parse_args(argv)
    try:
        c = load_config(args.config)
        with Engine(c) as engine:
            if args.command != 'status':
                gmail = build_gmail(c)
                # Bootstrap imports archive only; never publishes opening positions.
                if args.command == 'bootstrap':
                    engine.bootstrap(gmail)
                else:
                    publisher, cloud_error = None, None
                    if c.get('publish_enabled') is True and not args.no_publish:
                        try:
                            publisher = FirestorePublisher(c)
                            publisher.refresh_categories(engine)
                        except Exception as exc:
                            publisher, cloud_error = None, type(exc).__name__
                    engine.reparse_pending()
                    engine.run(gmail)
                    engine.reconcile_incoming()
                    if publisher:
                        engine.drain(publisher)
                    if cloud_error:
                        print(dumps(dict(engine.status(), publication_error=cloud_error)))
                        return 1
            result = engine.status()
            result['publication_enabled'] = c.get('publish_enabled') is True and not args.no_publish
            print(dumps(result))
            return 0
    except Exception as exc:
        # Error class only: SDK messages may include private mailbox/token details.
        print(dumps({'error': type(exc).__name__, 'action': 'inspect private config/state; cursor/outbox retained'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
