"""Receipt-specific financial review queue. No financial writes or model calls."""
import os
from pathlib import Path
import sqlite3
import time
import json
import re
import uuid
from contextlib import contextmanager

from mesh import Engine, digest, dumps, event_kind, instant, validate_config

EXCLUDED = {'archive', 'pre_checkpoint', 'not_transaction'}
SCHEMA = '''
CREATE TABLE IF NOT EXISTS reviews(
 id TEXT PRIMARY KEY, scope TEXT NOT NULL, account TEXT NOT NULL, message TEXT NOT NULL,
 kind TEXT NOT NULL, version TEXT NOT NULL, fingerprint TEXT NOT NULL, raw_hash TEXT NOT NULL,
 parsed TEXT NOT NULL, reason TEXT NOT NULL, state TEXT NOT NULL,
 event_id TEXT, decision TEXT, result TEXT, error TEXT, created REAL NOT NULL, updated REAL NOT NULL,
 UNIQUE(scope,account,message));
CREATE TABLE IF NOT EXISTS audit(
 seq INTEGER PRIMARY KEY, scope TEXT NOT NULL, review_id TEXT NOT NULL, version TEXT NOT NULL,
 at REAL NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS commands(
 scope TEXT NOT NULL, platform TEXT NOT NULL, chat_id TEXT NOT NULL, message_id TEXT NOT NULL,
 review_id TEXT NOT NULL, version TEXT NOT NULL, decision TEXT NOT NULL,
 PRIMARY KEY(scope,platform,chat_id,message_id));
CREATE TABLE IF NOT EXISTS notices(
 scope TEXT NOT NULL, review_id TEXT NOT NULL, version TEXT NOT NULL, topic TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt REAL NOT NULL DEFAULT 0,
 lease_until REAL NOT NULL DEFAULT 0, lease_token TEXT, notified_at REAL, ack TEXT, error TEXT,
 PRIMARY KEY(scope,review_id,version,topic));
'''
_UNSET = object()


def validate_review_config(config):
    validate_config(config)
    if config.get('financial_review_enabled') is not True:
        raise ValueError('review must be explicitly enabled')
    # Demo activation authorizes exactly the configured Telegram administrator.
    admin_chat = config.get('financial_review_admin_chat_id', '')
    admin_users = config.get('financial_review_admin_user_ids', [])
    if (not isinstance(admin_chat, str) or not admin_chat.lstrip('-').isdigit() or
            not isinstance(admin_users, list) or not admin_users or
            not all(isinstance(u, str) and u.lstrip('-').isdigit() for u in admin_users)):
        raise ValueError('explicit authorized Telegram administrator required')
    alert_target = config.get('ops_alert_target', '')
    if alert_target and alert_target != 'telegram:' + admin_chat:
        raise ValueError('ops_alert_target must match financial_review_admin_chat_id')
    name = config.get('financial_review_state_path')
    if not isinstance(name, str) or not name or not Path(name).is_absolute():
        raise ValueError('absolute private review state path required')
    path = Path(name)
    if path.is_symlink() or path.resolve() != path.absolute():
        raise ValueError('review state must not use symlink paths')
    if path.exists() and (not path.is_file() or path.stat().st_uid != os.getuid() or path.stat().st_nlink != 1):
        raise ValueError('review state must be a private owned regular file')
    others = [Path(v) for k, v in config.items() if k.endswith('_path') and k != 'financial_review_state_path' and isinstance(v, str)]
    whitelist = config.get('destination_whitelist_path')
    if whitelist:
        others += [Path(whitelist + '.category-worker.sqlite3')]
    for other in others:
        if (path.resolve() == other.resolve() or str(path.resolve()) in {str(other.resolve()) + s for s in ('-wal', '-shm', '-journal', '.lock')} or
                (path.exists() and other.exists() and path.samefile(other))):
            raise ValueError('review state must be separate from other configured files')
    if any(not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}', key) or key in ('EXTERNAL', 'UNRESOLVED')
           for key in config['registry']['wallets']):
        raise ValueError('registered wallet keys must be safe structured identifiers')
    return config


def fingerprint(config, candidate_reason, parsed, raw):
    return digest(dict(namespace={k: config[k] for k in ('project_id', 'uid', 'email', 'account_id')},
                       checkpoint=config['checkpoint_at'], registry=config['registry'],
                       reason=candidate_reason, parsed=parsed, raw=raw))


def _endpoints(config, record, action, source, destination):
    if action in ('retry', 'reject'):
        if source is not None or destination is not None:
            raise ValueError('nonfinancial_action_has_endpoints')
        return source, destination
    if action not in ('transfer', 'expense', 'income'):
        raise ValueError('unsupported_action')
    if action == 'expense':
        if destination not in (None, 'EXTERNAL'):
            raise ValueError('invalid_expense_destination')
        destination = 'EXTERNAL'
    if action == 'income':
        if source not in (None, 'EXTERNAL'):
            raise ValueError('invalid_income_source')
        source = 'EXTERNAL'
    wallets = config['registry']['wallets']
    if type(source) is not str or type(destination) is not str:
        raise ValueError('structured_wallet_keys_required')
    if not ((action == 'transfer' and source in wallets and destination in wallets and source != destination) or
            (action == 'expense' and source in wallets and destination == 'EXTERNAL') or
            (action == 'income' and source == 'EXTERNAL' and destination in wallets)):
        raise ValueError('invalid_owned_endpoints')
    p = dict(record['parsed'])
    errors = p.get('validation_errors') or []
    if (record['reason'] not in ('ready', 'ineligible', 'unresolved_endpoint') or
            event_kind(p) not in ('transfer', 'expense', 'income') or
            not isinstance(errors, list) or any(e not in ('unresolved_source', 'unresolved_destination') for e in errors) or
            (p.get('eligible') is not True and not errors)):
        raise ValueError('unsafe_financial_facts')
    for side, endpoint in (('source', source), ('destination', destination)):
        if p.get(side + '_wallet') not in ('UNRESOLVED', endpoint):
            raise ValueError('known_endpoint_remap')
        p[side + '_wallet'] = endpoint
    p.update(eligible=True, validation_errors=[])
    try:
        safe = Engine(config).reason(p) == 'ready'
    except (ValueError, TypeError, KeyError, OverflowError):
        safe = False
    if not safe:
        raise ValueError('unsafe_financial_facts')
    return source, destination


class ReviewStore:
    def __init__(self, config, now=None):
        validate_review_config(config)
        self.config = config
        self.scope = config['project_id'] + ':' + config['uid']
        self.now = now or time.time
        self.db = None

    def __enter__(self):
        path = Path(self.config['financial_review_state_path'])
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        os.close(fd)
        os.chmod(path, 0o600)
        self.db = sqlite3.connect(path, timeout=5)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA busy_timeout=5000')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript(SCHEMA)
        return self

    def __exit__(self, *args):
        self.db.close()

    @staticmethod
    def _record(row):
        if row is None:
            return None
        result = dict(row)
        for key in ('parsed', 'decision', 'result'):
            result[key] = json.loads(result[key]) if result[key] is not None else None
        return result

    def get(self, review_id):
        return self._record(self.db.execute('SELECT * FROM reviews WHERE scope=? AND account=? AND id=?',
                                            (self.scope, self.config['account_id'], review_id)).fetchone())

    def rows(self, states=None):
        query, args = 'SELECT * FROM reviews WHERE scope=? AND account=?', [self.scope, self.config['account_id']]
        if states is not None:
            states = [states] if isinstance(states, str) else list(states)
            query += ' AND state IN (' + ','.join('?' for _ in states) + ')'
            args += states
        return [self._record(r) for r in self.db.execute(query + ' ORDER BY created,id', args)]

    @contextmanager
    def _atomic(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise

    def _audit(self, record, event, detail):
        self.db.execute('INSERT INTO audit(scope,review_id,version,at,event,detail) VALUES(?,?,?,?,?,?)',
                        (self.scope, record['id'], record['version'], self.now(), event, dumps(detail)))

    def decide(self, review_id, version, action, source=None, destination=None, *, actor, message_id):
        validate_review_config(self.config)
        required = {'platform', 'chat_id', 'user_id', 'is_bot', 'chat_type'}
        if (not isinstance(actor, dict) or set(actor) != required or actor.get('platform') != 'telegram' or
                actor.get('chat_id') != self.config['financial_review_admin_chat_id'] or
                actor.get('user_id') not in self.config['financial_review_admin_user_ids'] or
                actor.get('is_bot') is not False or actor.get('chat_type') not in ('dm', 'private')):
            raise ValueError('trusted_private_admin_required')
        actor = dict(actor, chat_type='dm')
        if type(message_id) not in (str, int) or not re.fullmatch(r'[1-9][0-9]{0,19}', str(message_id)):
            raise ValueError('telegram_message_id_required')
        message_id = str(message_id)
        with self._atomic():
            record = self.get(review_id)
            if not record or record['version'] != version or record['kind'] != 'receipt':
                raise ValueError('stale_or_unavailable_review')
            source, destination = _endpoints(self.config, record, action, source, destination)
            decision = dict(action=action, source=source, destination=destination, actor=actor, message_id=message_id)
            previous = self.db.execute('SELECT * FROM commands WHERE scope=? AND platform=? AND chat_id=? AND message_id=?',
                                       (self.scope, actor['platform'], actor['chat_id'], message_id)).fetchone()
            if previous:
                if (previous['review_id'], previous['version'], previous['decision']) != (review_id, version, dumps(decision)):
                    raise ValueError('message_replay_conflict')
                return record
            if record['state'] != 'pending' and not (record['state'] == 'blocked' and not record['event_id'] and action in ('retry', 'reject')):
                raise ValueError('decision_state_conflict')
            if action not in ('transfer', 'expense', 'income', 'retry', 'reject'):
                raise ValueError('unsupported_action')
            self.db.execute('INSERT INTO commands VALUES(?,?,?,?,?,?,?)',
                            (self.scope, actor['platform'], actor['chat_id'], message_id, review_id, version, dumps(decision)))
            state = 'rejected' if action == 'reject' else 'approved'
            self.db.execute('UPDATE reviews SET state=?,decision=?,error=NULL,updated=? WHERE id=? AND scope=? AND version=? AND state=?',
                            (state, dumps(decision), self.now(), review_id, self.scope, version, record['state']))
            self._audit(record, 'decision', decision)
        return self.get(review_id)

    def transition(self, review_id, expected_states, state, *, event_id=_UNSET, error=_UNSET, result=_UNSET):
        if error is not _UNSET and error is not None and (not isinstance(error, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,96}', error)):
            error = 'ReviewError'
        expected_states = [expected_states] if isinstance(expected_states, str) else list(expected_states)
        with self._atomic():
            record = self.get(review_id)
            if not record or record['state'] not in expected_states:
                raise ValueError('transition_state_conflict')
            if state not in ('pending', 'approved', 'prepared', 'posted', 'rejected', 'blocked', 'resolved'):
                raise ValueError('unsupported_state')
            values = dict(state=state, updated=self.now())
            for key, value in (('event_id', event_id), ('error', error), ('result', result)):
                if value is not _UNSET:
                    values[key] = dumps(value) if key == 'result' and value is not None else value
            self.db.execute('UPDATE reviews SET ' + ','.join(k + '=?' for k in values) + ' WHERE id=? AND scope=? AND state=? AND version=?',
                            list(values.values()) + [review_id, self.scope, record['state'], record['version']])
            self._audit(record, 'transition', dict(previous=record['state'], state=state))
        return self.get(review_id)

    def discover(self, financial_connection):
        result = dict(created=0, updated=0, resolved=0)
        checkpoint = financial_connection.execute('SELECT at,registry FROM checkpoints WHERE scope=?', (self.scope,)).fetchone()
        registry = financial_connection.execute('SELECT body FROM registry WHERE scope=?', (self.scope,)).fetchone()
        if checkpoint or registry:
            if (not checkpoint or not registry or checkpoint['at'] != instant(self.config['checkpoint_at']).isoformat() or
                    checkpoint['registry'] != dumps(self.config['registry']) or registry['body'] != dumps(self.config['registry'])):
                raise ValueError('registry_checkpoint_changed')
        seen = set()
        query = '''SELECT c.*,e.raw,e.archive FROM candidates c JOIN evidence e
                   ON c.account=e.account AND c.message=e.message
                   WHERE c.scope=? AND c.account=? AND e.archive=0'''
        with self._atomic():
            for row in financial_connection.execute(query, (self.scope, self.config['account_id'])):
                if row['reason'] in EXCLUDED:
                    continue
                parsed, raw = json.loads(row['parsed']), json.loads(row['raw'])
                # Header date is used only to exclude old evidence, never to fill approved facts.
                for observed in (parsed.get('notification_at'), raw.get('date')):
                    try:
                        if observed and instant(observed) < instant(self.config['checkpoint_at']):
                            break
                    except (ValueError, TypeError, OverflowError):
                        pass
                else:
                    observed = None
                if observed:
                    continue
                bound = financial_connection.execute('SELECT event_id FROM event_evidence WHERE scope=? AND account=? AND message=?',
                                                      (self.scope, row['account'], row['message'])).fetchall()
                rid = digest([self.scope, self.config['email'], row['account'], row['message']])
                seen.add(rid)
                old = self.get(rid)
                event_id = row['event_id'] or (bound[0]['event_id'] if bound else None)
                kind = 'delivery' if event_id else 'receipt'
                if event_id:
                    # Publication recovery owns approved/prepared state, not discovery.
                    if old and old['kind'] == 'receipt' and old['state'] in ('approved', 'prepared', 'posted'):
                        continue
                    outbox = financial_connection.execute('SELECT state FROM outbox WHERE scope=? AND event_id=?',
                                                          (self.scope, event_id)).fetchone()
                    if not outbox or outbox['state'] == 'sent':
                        if old and old['state'] != 'resolved':
                            self.db.execute("UPDATE reviews SET state='resolved',updated=? WHERE id=? AND scope=?",
                                            (self.now(), rid, self.scope))
                            result['resolved'] += 1
                        continue
                fp = fingerprint(self.config, row['reason'], parsed, raw)
                if old:
                    if old['fingerprint'] != fp or old['kind'] != kind:
                        state = 'blocked' if old['state'] == 'prepared' else 'pending'
                        self.db.execute('''UPDATE reviews SET kind=?,version=?,fingerprint=?,raw_hash=?,parsed=?,reason=?,
                                          state=?,event_id=?,decision=NULL,result=NULL,error=NULL,updated=? WHERE id=? AND scope=?''',
                                        (kind, fp[:16], fp, digest(raw), dumps(parsed), row['reason'], state, event_id,
                                         self.now(), rid, self.scope))
                        result['updated'] += 1
                    continue
                self.db.execute('INSERT INTO reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                                (rid, self.scope, row['account'], row['message'], kind, fp[:16], fp,
                                 digest(raw), dumps(parsed), row['reason'], 'pending', event_id, None, None, None,
                                 self.now(), self.now()))
                result['created'] += 1
            for old in self.rows(states=['pending', 'approved', 'blocked']):
                if old['id'] not in seen:
                    self.db.execute("UPDATE reviews SET state='resolved',updated=? WHERE id=? AND scope=?",
                                    (self.now(), old['id'], self.scope))
                    self._audit(old, 'resolved', dict(reason='receipt_no_longer_reviewable'))
                    result['resolved'] += 1
        return result


def _safe(value):
    """Escape CLI media/control syntax and mask identities in untrusted labels."""
    text = str(value)[:320]
    text = re.sub(r'[^\s@]+@[^\s@]+', '[email]', text)
    text = re.sub(r'\d{6,}', '[nomor]', text)
    return (json.dumps(text, ensure_ascii=True).replace(':', '\\u003a')
            .replace('[', '\\u005b').replace(']', '\\u005d').replace('<', '\\u003c').replace('>', '\\u003e').replace('/', '\\u002f'))


def _render(config, record):
    from mesh import JAKARTA
    p = record['parsed']
    amount = ('Rp' + format(p['amount'], ',').replace(',', '.')
              if type(p.get('amount')) is int and p['amount'] > 0 and p.get('currency') == 'IDR' else 'nominal/mata uang belum pasti')
    try:
        date = instant(p['notification_at']).astimezone(JAKARTA).strftime('%d-%m-%Y %H:%M WIB')
    except (ValueError, TypeError, KeyError, OverflowError):
        date = 'waktu belum pasti'
    base = record['id'] + ' ' + record['version']
    text = ['BudgetX: tinjauan bukti transaksi', 'ID/revisi: ' + base, amount + ' | ' + date,
            'Akun: ' + record['account'], 'Status: ' + record['state'], 'Alasan: ' + _safe(record['reason']),
            'Label: ' + _safe(p.get('destination_identity') or 'tidak tersedia'),
            'Wallet terdaftar: ' + _safe(dumps(list(config['registry']['wallets'])))]
    known = set(config['registry']['wallets']) | {'EXTERNAL'}
    text += ['Endpoint: ' + ', '.join(side + '=' + (p.get(side + '_wallet') if p.get(side + '_wallet') in known else 'belum diketahui')
                                    for side in ('source', 'destination')),
             'Biaya dibayar: ' + ('Rp' + format(p['fee_paid'], ',').replace(',', '.') if type(p.get('fee_paid')) is int else 'belum diketahui'),
             'Validasi parser: ' + _safe(dumps(p.get('validation_errors') or []))]
    if record['error']:
        text += ['Kesalahan: ' + _safe(record['error']), 'Belum ada konfirmasi pencatatan; proses berikutnya memverifikasi ID kanonis yang sama.']
    if record['state'] == 'posted':
        text += ['Tercatat dan diverifikasi; tidak perlu persetujuan ulang.',
                 'Transaksi: ' + _safe(dumps((record['result'] or {}).get('transaction_ids', [])))]
    if record['state'] == 'pending' and record['kind'] == 'receipt':
        commands = []
        wallets = list(config['registry']['wallets'])
        for action in ('transfer', 'expense', 'income'):
            pairs = [(s, d) for s in wallets for d in wallets] if action == 'transfer' else (
                [(s, None) for s in wallets] if action == 'expense' else [(None, d) for d in wallets])
            for source, destination in pairs:
                try:
                    _endpoints(config, record, action, source, destination)
                except (ValueError, TypeError):
                    continue
                # Unknown endpoints remain placeholders; never choose ownership for the user.
                src = source if p.get('source_wallet') in wallets else 'SRC'
                dst = destination if p.get('destination_wallet') in wallets else 'DEST'
                suffix = action + ' ' + (src + ' ' + dst if action == 'transfer' else src if action == 'expense' else dst)
                command = '/bxconfirm ' + base + ' ' + suffix
                if command not in commands:
                    commands.append(command)
        text += commands or ['Perlu penilaian manual; fakta uang/status/biaya/parser belum aman.']
        text += ['/bxretry ' + base, '/bxreject ' + base,
                 'Satu konfirmasi menilai dan mengizinkan pencatatan hanya bukti/akun ini pada proses terjadwal berikutnya; bukan alias kepemilikan umum.']
    elif record['kind'] == 'delivery':
        text += ['Pengiriman tertunda; informasional saja, bukan persetujuan keuangan baru.']
    elif record['state'] == 'blocked' and not record['event_id']:
        text += ['Perlu penilaian manual; tidak ada perintah paksa pencatatan.', '/bxretry ' + base, '/bxreject ' + base]
    return '\n'.join(text)


def _acknowledgement(value, config):
    if isinstance(value, str):
        value = json.loads(value)
    if (not isinstance(value, dict) or value.get('success') is not True or
            any(value.get(k) for k in ('error', 'skipped', 'partial_success')) or
            value.get('platform', 'telegram') != 'telegram' or
            str(value.get('chat_id', config['financial_review_admin_chat_id'])) != config['financial_review_admin_chat_id'] or
            type(value.get('message_id')) not in (str, int) or
            not re.fullmatch(r'[1-9][0-9]{0,19}', str(value.get('message_id')))):
        raise ValueError('invalid_delivery_ack')
    return dict(platform='telegram', chat_id=config['financial_review_admin_chat_id'], message_id=str(value['message_id']))


def _native_send(config, text):
    import subprocess
    from category_worker import HERMES, _hermes_env
    env = _hermes_env()  # Inherited profile, validated at call time; no fallback or credentials in argv.
    sent = subprocess.run([HERMES, 'send', '--to', 'telegram:' + config['financial_review_admin_chat_id'], '--json', '--file', '-'],
                          input=text, capture_output=True, text=True, timeout=30, shell=False,
                          env=env, cwd=env['HERMES_HOME'])
    if sent.returncode != 0:
        raise RuntimeError('native_send_failed')
    return sent.stdout


def _topic(record):
    if record['state'] in ('posted', 'rejected', 'resolved'):
        return record['state']
    if record['error']:
        return 'error:' + digest([record['state'], record['error']])[:16]
    return record['state'] if record['state'] in ('pending', 'blocked') else None


def notify_reviews(config, store, send=None, now=None, limit=10):
    """Bounded, at-least-once delivery; a crash after remote acceptance can repeat a notice.

    sent/notified count validated acknowledgements. failed/deferred count attempted
    deliveries without a persisted acknowledgement (retry scheduled); leases,
    not-yet-due backoff/reminders, and limit-excluded items do not affect counts.
    Durable attempts/error/deadlines remain available in notices between ticks.
    """
    validate_review_config(config)
    if store.scope != config['project_id'] + ':' + config['uid'] or any(store.config[k] != config[k] for k in
            ('financial_review_state_path', 'account_id', 'registry', 'checkpoint_at')):
        raise ValueError('review_scope_mismatch')
    clock = now or store.now
    counts = dict(sent=0, notified=0, deferred=0, failed=0)
    if send is None:
        send = lambda text: _native_send(config, text)
    for initial in store.rows():
        if counts['notified'] + counts['deferred'] >= max(0, min(int(limit), 100)):
            break
        topic = _topic(initial)
        if topic is None:
            continue
        key = (store.scope, initial['id'], initial['version'], topic)
        token = uuid.uuid4().hex
        with store._atomic():
            record = store.get(initial['id'])
            if not record or record['version'] != initial['version'] or record['state'] != initial['state'] or _topic(record) != topic:
                continue
            store.db.execute('INSERT OR IGNORE INTO notices(scope,review_id,version,topic) VALUES(?,?,?,?)', key)
            notice = store.db.execute('SELECT * FROM notices WHERE scope=? AND review_id=? AND version=? AND topic=?', key).fetchone()
            if (notice['next_attempt'] > clock() or notice['lease_until'] > clock() or
                    (notice['notified_at'] is not None and topic in ('posted', 'rejected', 'resolved'))):
                continue
            attempts = notice['attempts'] + 1
            retry = clock() + min(86400, 300 * 2 ** min(attempts - 1, 9))
            store.db.execute('''UPDATE notices SET attempts=?,lease_until=?,lease_token=?,next_attempt=?
                                WHERE scope=? AND review_id=? AND version=? AND topic=?''',
                             (attempts, clock() + 120, token, retry) + key)
            store._audit(record, 'notification_claimed', dict(topic=topic, attempt=attempts))
        try:
            ack = _acknowledgement(send(_render(config, record)), config)
            error = None
        except Exception as exc:
            # Never persist provider stdout/stderr, credentials, email bodies or exception text.
            ack, error = None, type(exc).__name__[:64]
        with store._atomic():
            changed = store.db.execute('''UPDATE notices SET lease_until=0,lease_token=NULL,error=?,
                                         ack=COALESCE(?,ack),notified_at=COALESCE(?,notified_at),next_attempt=?
                                         WHERE scope=? AND review_id=? AND version=? AND topic=? AND lease_token=?''',
                                      (error, dumps(ack) if ack else None, clock() if ack else None,
                                       clock() + 86400 if ack else retry) + key + (token,)).rowcount
            if changed:
                store._audit(record, 'notification_sent' if ack else 'notification_deferred', ack or dict(error=error, attempt=attempts))
        if ack and changed:
            counts['notified'] += 1
            counts['sent'] += 1
        else:
            counts['deferred'] += 1
            counts['failed'] += 1
    # Attempt counters alone would clear health during backoff. Only the current
    # receipt revision/topic matters; an assessment or revision can obsolete an
    # earlier failed notice without falsely poisoning the new state.
    counts['outstanding_failed'] = 0
    for current in store.rows():
        topic = _topic(current)
        if topic is None:
            continue
        notice = store.db.execute('SELECT error FROM notices WHERE scope=? AND review_id=? AND version=? AND topic=?',
                                 (store.scope, current['id'], current['version'], topic)).fetchone()
        if notice and notice['error']:
            counts['outstanding_failed'] += 1
    return counts
