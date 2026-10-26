"""Receipt-scoped financial approval application, never a general outbox drain.

Injected publishers either are Auth-verified mesh.FirestorePublisher instances
(with an SDK-shaped db), or expose verify_target(config), read_document(path),
and apply(payload). read_document returns a document dict or None. Factories and
adapters are trusted code, never supplied by a receipt or a chat command.
"""
from contextlib import closing, contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import sqlite3
import uuid

import mesh
from mesh_parser import parse_email


class ReviewBlocked(ValueError):
    """An immutable prerequisite failed; its code is safe for queue/error logs."""


class ReviewDeferred(RuntimeError):
    """A canonical event remains pending without authorization to mint another."""


def require(condition, code):
    if not condition:
        raise ReviewBlocked(code)


def fingerprint(config, reason, parsed, raw):
    from financial_review import fingerprint as current_fingerprint
    return current_fingerprint(config, reason, parsed, raw)


@contextmanager
def existing_engine(config):
    """Use Engine's planning/catalog contracts without startup catalog mutations."""
    engine = mesh.Engine(config)
    path = Path(config['db_path'])
    require(path.is_file(), 'ledger_missing')
    try:
        engine.lock = open(str(path) + '.lock', 'a')
        os.chmod(str(path) + '.lock', 0o600)
        fcntl.flock(engine.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        engine.db = sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=5)
        engine.db.row_factory = sqlite3.Row
        engine.db.execute('PRAGMA synchronous=FULL')
        checkpoint = engine.db.execute('SELECT * FROM checkpoints WHERE scope=?', (engine.scope,)).fetchone()
        registry = engine.db.execute('SELECT body FROM registry WHERE scope=?', (engine.scope,)).fetchone()
        require(checkpoint is not None and registry is not None, 'ledger_uninitialized')
        require(checkpoint['at'] == mesh.instant(config['checkpoint_at']).isoformat()
                and checkpoint['registry'] == mesh.dumps(config['registry'])
                and registry['body'] == mesh.dumps(config['registry']), 'registry_checkpoint_changed')
        if config.get('destination_whitelist_path'):
            from destination_whitelist import DestinationWhitelist
            engine.whitelist = DestinationWhitelist(config['destination_whitelist_path'], engine.scope)
            engine.whitelist.__enter__()
        yield engine
    finally:
        engine.__exit__(None, None, None)


def default_publisher(config):
    """Reuse an initialized SDK app; still recheck the current Auth identity."""
    from firebase_admin import auth, firestore, get_app
    name = 'email-mesh-' + mesh.digest(config['project_id'] + ':' + config['uid'])[:16]
    try:
        app = get_app(name)
    except ValueError:
        return mesh.FirestorePublisher(config)
    db = firestore.client(app=app)
    def lookup(email):
        user = auth.get_user_by_email(email, app=app)
        return user.uid, user.email
    return mesh.FirestorePublisher(config, db=db, auth_lookup=lookup)


def verify_target(publisher, config):
    if callable(getattr(publisher, 'verify_target', None)):
        identity = publisher.verify_target(config)
        require(isinstance(identity, dict) and all(identity.get(k) == config[k]
                for k in ('project_id', 'uid', 'email')), 'cloud_identity_mismatch')
    else:
        require(isinstance(publisher, mesh.FirestorePublisher), 'cloud_auth_verifier_required')
        require(publisher.scope == config['project_id'] + ':' + config['uid']
                and publisher.base == 'users/' + config['uid']
                and publisher.db.project == config['project_id'], 'cloud_identity_mismatch')


def read_document(publisher, path):
    adapter = getattr(publisher, 'read_document', None)
    if callable(adapter):
        body = adapter(path)
    else:
        snapshot = publisher.db.document(path).get()
        body = snapshot.to_dict() if snapshot.exists else None
    require(body is None or isinstance(body, dict), 'invalid_cloud_readback')
    return body


def cloud_catalog(publisher, config, parsed):
    base = 'users/' + config['uid']
    checkpoint = read_document(publisher, base + '/mesh_state/demo-checkpoint')
    require(checkpoint is not None and checkpoint.get('checkpoint_at') == config['checkpoint_at']
            and checkpoint.get('scope') == config['project_id'] + ':' + config['uid'], 'cloud_checkpoint_mismatch')
    wallets = {}
    affected = {parsed.get(side + '_wallet') for side in ('source', 'destination')}
    for key, wallet in config['registry']['wallets'].items():
        if key not in affected:
            continue
        body = read_document(publisher, base + '/wallets/' + wallet['id'])
        require(body is not None, 'cloud_wallet_missing')
        require(all(body.get(field) == wallet[field] for field in ('type', 'name') if field in wallet),
                'cloud_wallet_catalog_mismatch')
        wallets[wallet['id']] = body
    return dict(checkpoint=checkpoint, wallets=wallets)


def private_json(path, value):
    def encode_cloud_type(item):
        if isinstance(item, datetime):
            # SDK DatetimeWithNanoseconds.isoformat retains its full precision.
            return {'__timestamp__': item.isoformat()}
        raise TypeError('unsupported backup value')
    serialized = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), default=encode_cloud_type)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write(serialized)
        output.flush()
        os.fsync(output.fileno())


def backup(engine, config, cloud):
    root = Path(config['financial_review_state_path']).parent / 'financial-review-backups'
    root.mkdir(mode=0o700, exist_ok=True)
    require(not root.is_symlink() and not root.stat().st_mode & 0o077, 'backup_directory_not_private')
    bundle = root / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ-') + uuid.uuid4().hex)
    bundle.mkdir(mode=0o700)
    destination = bundle / 'ledger-before.sqlite3'
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)
    with closing(sqlite3.connect(destination)) as target:
        engine.db.backup(target)
    private_json(bundle / 'config-before.json', config)
    private_json(bundle / 'cloud-before.json', cloud)
    return bundle


def preparation_backup(engine, config, cloud, store, record):
    """Persist one private, receipt/config-bound snapshot before local preparation.

    Retain the original pre-mutation snapshot across canonical publication retries.
    Missing, changed, public or symlinked snapshots are never trusted for reuse.
    """
    root = Path(config['financial_review_state_path']).parent / 'financial-review-backups'
    identity = dict(scope=store.scope, review_id=record['id'], version=record['version'],
                    fingerprint=record['fingerprint'], decision_hash=mesh.digest(record['decision']),
                    config_hash=mesh.digest(config))
    path = (record.get('result') or {}).get('backup_path')
    if path:
        bundle = Path(path)
        try:
            files = [bundle / name for name in ('ledger-before.sqlite3', 'config-before.json',
                                                'cloud-before.json', 'review.json')]
            if (bundle / 'event-before.json').exists() or (bundle / 'event-before.json').is_symlink():
                files.append(bundle / 'event-before.json')
            if (bundle.parent == root and not root.is_symlink() and not root.stat().st_mode & 0o077
                    and not bundle.is_symlink() and bundle.is_dir() and not bundle.stat().st_mode & 0o077
                    and all(p.is_file() and not p.is_symlink() and not p.stat().st_mode & 0o077 for p in files)
                    and json.loads((bundle / 'review.json').read_text()) == identity
                    and json.loads((bundle / 'config-before.json').read_text()) == config
                    and isinstance(json.loads((bundle / 'cloud-before.json').read_text()), dict)):
                with closing(sqlite3.connect((bundle / 'ledger-before.sqlite3').as_uri() + '?mode=ro', uri=True)) as db:
                    if db.execute('PRAGMA quick_check').fetchall() == [('ok',)]:
                        return bundle
        except (OSError, ValueError, sqlite3.Error):
            pass
    bundle = backup(engine, config, cloud)
    private_json(bundle / 'review.json', identity)
    store.transition(record['id'], ['approved', 'prepared'], record['state'],
                     result=dict(record.get('result') or {}, backup_path=str(bundle)))
    return bundle


def prune_backups(config, store):
    """Keep 20 finished bundles and at most two per unresolved receipt.

    Always protect its currently referenced snapshot, including ceiling-blocked
    canonical events. Only remove known direct files in private owned bundles;
    never recurse into directories or follow symlinks/queue-provided paths.
    """
    root = Path(config['financial_review_state_path']).parent / 'financial-review-backups'
    if not root.is_dir() or root.is_symlink() or root.stat().st_mode & 0o077:
        return
    records = {r['id']: r for r in store.rows()}
    active = {rid: r for rid, r in records.items() if r['state'] not in ('posted', 'rejected', 'resolved')}
    references = {(r.get('result') or {}).get('backup_path'): rid for rid, r in active.items()}
    allowed = {'ledger-before.sqlite3', 'config-before.json', 'cloud-before.json', 'event-before.json', 'review.json'}
    groups, finished = {}, []
    for bundle in sorted(root.iterdir(), reverse=True):
        try:
            if (not re.fullmatch(r'\d{8}T\d{12}Z-[0-9a-f]{32}', bundle.name)
                    or bundle.is_symlink() or not bundle.is_dir() or bundle.stat().st_mode & 0o077):
                continue
            files = list(bundle.iterdir())
            if not files or not all(p.name in allowed and not p.is_symlink() and p.is_file()
                                    and not p.stat().st_mode & 0o077 for p in files):
                continue
            metadata = bundle / 'review.json'
            identity = json.loads(metadata.read_text()) if metadata.exists() else {}
            if not isinstance(identity, dict) or (identity and identity.get('scope') != store.scope):
                continue
            rid = references.get(str(bundle)) or identity.get('review_id')
            if rid in active:
                groups.setdefault(rid, []).append((bundle, files))
            else:
                finished.append((bundle, files))
        except (OSError, ValueError, TypeError):
            continue
    remove = finished[20:]
    for rid, bundles in groups.items():
        referenced = (active[rid].get('result') or {}).get('backup_path')
        protected = {b for b, _ in bundles if str(b) == referenced}
        for bundle, _ in bundles:
            if len(protected) >= 2:
                break
            protected.add(bundle)
        remove.extend((b, files) for b, files in bundles if b not in protected)
    for bundle, files in remove:
        try:
            for path in files:
                path.unlink()
            bundle.rmdir()
        except OSError:
            continue


def resolve(record, fresh, config):
    decision = record.get('decision') or {}
    retry = decision.get('action') == 'retry'
    if retry:
        mutable = {'source_wallet', 'destination_wallet', 'destination_flag', 'validation_errors', 'eligible'}
        require({k: v for k, v in fresh.items() if k not in mutable}
                == {k: v for k, v in record['parsed'].items() if k not in mutable}, 'fresh_parser_changed')
        for side in ('source', 'destination'):
            original = record['parsed'].get(side + '_wallet')
            require(original == 'UNRESOLVED' or original == fresh.get(side + '_wallet'), 'known_endpoint_remap')
        source, destination = fresh.get('source_wallet'), fresh.get('destination_wallet')
        action = 'income' if source == 'EXTERNAL' else ('expense' if destination == 'EXTERNAL' else 'transfer')
    else:
        require(fresh == record['parsed'], 'fresh_parser_changed')
        require(record['reason'] in ('ready', 'ineligible', 'unresolved_endpoint'), 'unsafe_candidate_reason')
        action = decision.get('action')
        source, destination = decision.get('source'), decision.get('destination')
    require(action in ('transfer', 'expense', 'income'), 'unsupported_decision')
    if action == 'expense':
        destination = 'EXTERNAL'
    if action == 'income':
        source = 'EXTERNAL'
    wallets = config['registry']['wallets']
    valid = ((action == 'transfer' and source in wallets and destination in wallets and source != destination)
             or (action == 'expense' and source in wallets and destination == 'EXTERNAL')
             or (action == 'income' and source == 'EXTERNAL' and destination in wallets))
    require(valid, 'invalid_approved_endpoints')
    require(mesh.event_kind(fresh) in ('transfer', 'expense', 'income')
            and fresh.get('status') in ('success', 'completed', 'settled'), 'unsafe_financial_facts')
    errors = set(fresh.get('validation_errors') or [])
    missing = {side for side in ('source', 'destination') if fresh.get(side + '_wallet') == 'UNRESOLVED'}
    require(not errors - {'unresolved_' + side for side in missing}, 'unsafe_parser_errors')
    require(fresh.get('eligible') is True or bool(missing), 'unsafe_ineligible_facts')
    resolved = deepcopy(fresh)
    for side, endpoint in (('source', source), ('destination', destination)):
        original = fresh.get(side + '_wallet')
        require(original == 'UNRESOLVED' or original == endpoint, 'known_endpoint_remap')
        resolved[side + '_wallet'] = endpoint
    resolved['destination_flag'] = destination
    resolved['validation_errors'] = []
    resolved['eligible'] = True
    resolved['financial_review'] = dict(review_id=record['id'], version=record['version'],
        fingerprint=record['fingerprint'], raw_hash=record['raw_hash'], decision_hash=mesh.digest(decision))
    return resolved


def prepare(engine, record, raw, resolved):
    """A failure here rolls back deletion and all canonical Engine mutations."""
    with engine.db:
        old_events = {r['id'] for r in engine.db.execute('SELECT id FROM events WHERE scope=?', (engine.scope,))}
        require(engine.reason(resolved) == 'ready', 'financial_validation_failed')
        engine.db.execute('DELETE FROM candidates WHERE scope=? AND account=? AND message=? AND event_id IS NULL',
                          (engine.scope, record['account'], record['message']))
        engine.parser = lambda row, registry: deepcopy(resolved)
        try:
            engine._ingest(raw)
        finally:
            engine.parser = None
        candidate = engine.db.execute('SELECT * FROM candidates WHERE scope=? AND account=? AND message=?',
                           (engine.scope, record['account'], record['message'])).fetchone()
        require(candidate and candidate['reason'] == 'ready' and candidate['event_id'], 'engine_quarantined')
        require(candidate['event_id'] not in old_events, 'canonical_event_already_exists')
        item = engine.db.execute('SELECT * FROM outbox WHERE scope=? AND event_id=?',
                                (engine.scope, candidate['event_id'])).fetchone()
        require(item is not None, 'canonical_outbox_missing')
        payload = json.loads(item['payload'])
        require(not payload.get('release_hold') and all(m['field'] == 'balance' for m in payload['movements']),
                'hold_effect_forbidden')
        verify_financial_payload(engine, record, raw, resolved, payload)
    return payload


def resume(engine, record, candidate, resolved):
    """Cross-database crash recovery requires receipt-specific canonical provenance."""
    eid = candidate['event_id']
    require(eid and record.get('event_id') in (None, eid), 'canonical_binding_changed')
    require(engine.db.execute('SELECT 1 FROM event_evidence WHERE scope=? AND event_id=? AND account=? AND message=?',
        (engine.scope, eid, record['account'], record['message'])).fetchone() is not None, 'canonical_evidence_missing')
    item = engine.db.execute('SELECT payload FROM outbox WHERE scope=? AND event_id=?', (engine.scope, eid)).fetchone()
    event = engine.db.execute('SELECT parsed FROM events WHERE scope=? AND id=?', (engine.scope, eid)).fetchone()
    require(item is not None and event is not None, 'canonical_event_missing')
    payload = json.loads(item['payload'])
    require(payload.get('scope') == engine.scope and payload.get('event_id') == eid
        and payload.get('checkpoint_at') == engine.config['checkpoint_at']
        and payload.get('parsed') == resolved and json.loads(event['parsed']) == resolved
        and json.loads(candidate['parsed']) == resolved, 'canonical_provenance_mismatch')
    require(not payload.get('release_hold') and all(m['field'] == 'balance' for m in payload['movements']),
            'hold_effect_forbidden')
    return payload


def verify_financial_payload(engine, record, raw, resolved, payload):
    """Recompute the canonical identity and money projection, not classification."""
    require(engine.reason(resolved) == 'ready', 'financial_validation_failed')
    signature = mesh.digest([mesh.event_kind(resolved), resolved['status'], resolved['source_wallet'],
        resolved['destination_wallet'], resolved['amount'], resolved['currency'], resolved.get('fee_paid'),
        resolved.get('total_debit'), resolved.get('total_credit')])
    provider = raw.get('provider') or resolved.get('provenance', {}).get('provider')
    reference, facility = resolved.get('reference') or '', resolved.get('facility') or ''
    eid = mesh.digest([engine.scope, provider, reference, facility, signature,
                      None if reference else [record['account'], record['message']]])
    require(provider and payload['event_id'] == eid, 'canonical_identity_mismatch')
    planner = mesh.Engine(engine.config)
    # Reuse the native financial planner without observing a destination or
    # selecting a new category. The original payload's classification is retained.
    planner.category = lambda *args, **kwargs: (None, None)
    expected = planner.plan(resolved, eid, provider=provider)
    fields = ('type', 'amount', 'date', 'walletId', 'toWalletId')
    project = lambda components: [{k: c.get(k) for k in fields} for c in components]
    require(payload.get('scope') == engine.scope and payload.get('checkpoint_at') == engine.config['checkpoint_at']
        and payload.get('parsed') == resolved and project(payload['components']) == project(expected['components'])
        and sorted(payload['movements'], key=lambda m: (m['wallet'], m['field']))
            == sorted(expected['movements'], key=lambda m: (m['wallet'], m['field'])), 'canonical_financial_facts_changed')
    movements = [dict(r) for r in engine.db.execute('SELECT wallet,field,delta FROM movements WHERE scope=? AND event_id=?',
                                                  (engine.scope, eid))]
    require(sorted(movements, key=lambda m: (m['wallet'], m['field']))
            == sorted(payload['movements'], key=lambda m: (m['wallet'], m['field'])), 'canonical_movements_changed')


def event_documents(publisher, config, payload):
    base = 'users/' + config['uid']
    eid = payload['event_id']
    return dict(marker=read_document(publisher, base + '/mesh_events/demo-' + eid),
        components=[read_document(publisher, base + '/transactions/demo-mesh-' + eid + '-' + str(i))
                    for i in range(len(payload['components']))])


def verify_event(documents, payload):
    expected = {k: payload[k] for k in ('scope', 'event_id', 'checkpoint_at', 'parsed', 'evidence')}
    expected['effect_hash'] = mesh.digest({k: payload[k] for k in ('scope', 'event_id', 'movements', 'checkpoint_at')})
    require(documents['marker'] == expected and documents['components'] == payload['components'],
            'cloud_event_readback_mismatch')


def process_reviews(config, store, publisher_factory=None, limit=10):
    """Budget at most limit eligible attempts, oldest-updated first.

    Wait/ceiling housekeeping contributes deferred/blocked, not processed or the
    attempt budget. Exact readback can recover a committed final attempt without
    publication or another full backup. All counts/errors are sanitized.
    """
    mesh.validate_config(config)
    counts = dict(processed=0, posted=0, deferred=0, blocked=0)
    if config.get('financial_review_enabled') is not True or config.get('publish_enabled') is not True:
        return counts
    from financial_review import validate_review_config
    validate_review_config(config)
    require(store.scope == config['project_id'] + ':' + config['uid'], 'review_scope_mismatch')
    prune_backups(config, store)
    budget = max(0, min(int(limit), 100))
    records = sorted(store.rows(states=['approved', 'prepared']),
                     key=lambda r: (r.get('updated', 0), r.get('created', 0), r['id']))
    for initial in records:
        if counts['processed'] >= budget:
            break
        record = store.get(initial['id'])
        if not record or record['state'] not in ('approved', 'prepared'):
            continue
        counts['processed'] += 1
        try:
            require(record['kind'] == 'receipt' and record['scope'] == store.scope
                    and record['account'] == config['account_id'], 'receipt_scope_mismatch')
            publisher = (publisher_factory or default_publisher)(config)
            verify_target(publisher, config)
            with existing_engine(config) as engine:
                row = engine.db.execute('SELECT c.*,e.raw,e.archive FROM candidates c JOIN evidence e '
                    'ON e.account=c.account AND e.message=c.message WHERE c.scope=? AND c.account=? AND c.message=?',
                    (engine.scope, record['account'], record['message'])).fetchone()
                require(row is not None and not row['archive'] and row['reason'] not in ('archive', 'pre_checkpoint', 'not_transaction'),
                        'receipt_unavailable')
                raw = json.loads(row['raw'])
                require(mesh.digest(raw) == record['raw_hash'] and raw.get('account_id') == record['account']
                        and raw.get('gmail_message_id') == record['message'], 'receipt_raw_changed')
                require(fingerprint(config, record['reason'], record['parsed'], raw) == record['fingerprint'],
                        'receipt_version_stale')
                if not row['event_id']:
                    require(row['reason'] == record['reason'] and json.loads(row['parsed']) == record['parsed'],
                            'receipt_version_stale')
                fresh = parse_email(raw, config['registry'])
                if (record.get('decision') or {}).get('action') == 'retry' and not row['event_id']:
                    require(not engine.db.execute('SELECT 1 FROM event_evidence WHERE scope=? AND account=? AND message=?',
                        (engine.scope, record['account'], record['message'])).fetchone(), 'receipt_already_bound')
                    retry_reason = engine.reason(fresh)
                    if retry_reason != 'ready':
                        bundle = preparation_backup(engine, config, cloud_catalog(publisher, config, fresh), store, record)
                        with engine.db:
                            engine.db.execute('DELETE FROM candidates WHERE scope=? AND account=? AND message=?',
                                (engine.scope, record['account'], record['message']))
                            engine.parser = lambda value, registry: deepcopy(fresh)
                            try:
                                engine._ingest(raw)
                            finally:
                                engine.parser = None
                        store.transition(record['id'], ['approved'], 'blocked', error='retry_' + retry_reason,
                                         result={'backup_path': str(bundle)})
                        counts['blocked'] += 1
                        continue
                resolved = resolve(record, fresh, config)
                catalog = cloud_catalog(publisher, config, resolved)
                if row['event_id']:
                    payload = resume(engine, record, row, resolved)
                    verify_financial_payload(engine, record, raw, resolved, payload)
                    payload['evidence'] = [dict(r) for r in engine.db.execute(
                        'SELECT account,message FROM event_evidence WHERE scope=? AND event_id=? ORDER BY account,message',
                        (engine.scope, payload['event_id']))]
                    before_event = event_documents(publisher, config, payload)
                    item = engine.db.execute('SELECT attempts,next_attempt FROM outbox WHERE scope=? AND event_id=?',
                                             (engine.scope, payload['event_id'])).fetchone()
                    if before_event['marker'] is not None:
                        verify_event(before_event, payload)
                        eid = payload['event_id']
                        # This is reconciliation of an already committed event,
                        # not a new financial mutation needing another snapshot.
                        with engine.db:
                            engine.db.execute("UPDATE outbox SET state='sent',error=NULL WHERE scope=? AND event_id=?",
                                              (engine.scope, eid))
                        store.transition(record['id'], ['approved', 'prepared'], 'posted', event_id=eid, error=None,
                            result=dict(record.get('result') or {}, event_id=eid,
                                transaction_ids=['demo-mesh-' + eid + '-' + str(i)
                                                 for i in range(len(payload['components']))]))
                        counts['posted'] += 1
                        continue
                    elif item['attempts'] >= 12:
                        store.transition(record['id'], ['approved', 'prepared'], 'blocked',
                            event_id=payload['event_id'], error='publication_attempts_exhausted')
                        counts['processed'] -= 1
                        counts['blocked'] += 1
                        continue
                    if before_event['marker'] is None and item['next_attempt'] > engine.now().timestamp():
                        counts['processed'] -= 1
                        counts['deferred'] += 1
                        continue
                    bundle = preparation_backup(engine, config, catalog, store, record)
                else:
                    require(record['state'] == 'approved' and not engine.db.execute(
                        'SELECT 1 FROM event_evidence WHERE scope=? AND account=? AND message=?',
                        (engine.scope, record['account'], record['message'])).fetchone(), 'receipt_already_bound')
                    require(row['reason'] == record['reason'] and json.loads(row['parsed']) == record['parsed'],
                            'receipt_version_stale')
                    bundle = preparation_backup(engine, config, catalog, store, record)
                    payload = prepare(engine, record, raw, resolved)
                verify_financial_payload(engine, record, raw, resolved, payload)
                eid = payload['event_id']
                payload['evidence'] = [dict(r) for r in engine.db.execute(
                    'SELECT account,message FROM event_evidence WHERE scope=? AND event_id=? ORDER BY account,message',
                    (engine.scope, eid))]
                store.transition(record['id'], ['approved', 'prepared'], 'prepared', event_id=eid,
                                 result={'backup_path': str(bundle)})
                before_event = event_documents(publisher, config, payload)
                if not (bundle / 'event-before.json').exists():
                    private_json(bundle / 'event-before.json', before_event)
                if before_event['marker'] is not None:
                    verify_event(before_event, payload)
                else:
                    require(all(c is None for c in before_event['components']), 'cloud_orphan_component')
                    item = engine.db.execute('SELECT attempts,next_attempt FROM outbox WHERE scope=? AND event_id=?',
                                             (engine.scope, eid)).fetchone()
                    if item['next_attempt'] > engine.now().timestamp() or item['attempts'] >= 12:
                        raise ReviewDeferred('publication_retry_wait')
                    try:
                        publisher.apply(payload)
                        verify_event(event_documents(publisher, config, payload), payload)
                    except Exception as exc:
                        attempts = item['attempts'] + 1
                        with engine.db:
                            engine.db.execute('UPDATE outbox SET attempts=?,next_attempt=?,error=? WHERE scope=? AND event_id=?',
                                (attempts, engine.now().timestamp() + min(3600, 2 ** min(attempts, 12)),
                                 type(exc).__name__, engine.scope, eid))
                        if isinstance(exc, ReviewBlocked):
                            raise ReviewDeferred('publication_readback_unverified') from exc
                        raise
                with engine.db:
                    engine.db.execute("UPDATE outbox SET state='sent',error=NULL WHERE scope=? AND event_id=?", (engine.scope, eid))
                store.transition(record['id'], ['prepared'], 'posted', event_id=eid, error=None,
                    result={'event_id': eid, 'transaction_ids': ['demo-mesh-' + eid + '-' + str(i)
                            for i in range(len(payload['components']))], 'backup_path': str(bundle)})
                counts['posted'] += 1
        except ReviewBlocked as exc:
            store.transition(record['id'], ['approved', 'prepared'], 'blocked', error=str(exc))
            counts['blocked'] += 1
        except Exception as exc:
            current = store.get(record['id'])
            store.transition(record['id'], ['approved', 'prepared'], current['state'], error=type(exc).__name__)
            counts['deferred'] += 1
    prune_backups(config, store)
    return counts
