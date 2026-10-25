"""Opt-in Firebase decision ingestion into the existing receipt review queue.

Decision ingestion has no CLI, scheduler, ledger mutation or direct financial
publisher call. The optional adapter preserves the existing hook's processor.
Install next to the canonical modules only after separate approval.
"""
from datetime import datetime, timezone
import re

from financial_review import ReviewStore, _endpoints, validate_review_config
from mesh import dumps

_FIELDS = {'schemaVersion', 'uid', 'reviewId', 'version', 'action', 'source', 'destination', 'createdAt'}


def validate_web_config(config):
    if config.get('financial_review_web_enabled') is not True:
        raise ValueError('web_review_must_be_explicitly_enabled')
    validate_review_config(config)
    return config


def _identifier(value, length):
    return type(value) is str and re.fullmatch('[0-9a-f]{' + str(length) + '}', value) is not None


def _timestamp(value):
    if (type(value) is not str or not re.fullmatch(
            r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)', value)):
        raise ValueError('invalid_created_at')
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)
    except (ValueError, OverflowError) as exc:
        raise ValueError('invalid_created_at') from exc


class WebReviewStore(ReviewStore):
    """Share canonical SQLite commands/audit and its Telegram concurrency lock."""

    def decide_web(self, payload, *, request_id):
        validate_web_config(self.config)
        if (type(payload) is not dict or set(payload) != _FIELDS or
                type(payload.get('schemaVersion')) is not int or payload['schemaVersion'] != 1 or
                payload.get('uid') != self.config['uid'] or
                not _identifier(payload.get('reviewId'), 64) or not _identifier(payload.get('version'), 16)):
            raise ValueError('invalid_web_decision')
        rid, version = payload['reviewId'], payload['version']
        if request_id != rid + '--' + version:
            raise ValueError('invalid_request_id')
        _timestamp(payload['createdAt'])
        action, source, destination = (payload[k] for k in ('action', 'source', 'destination'))
        if (type(action) is not str or action not in ('transfer', 'expense', 'income', 'reject') or
                any(v is not None and type(v) is not str for v in (source, destination))):
            raise ValueError('invalid_web_action')
        actor = dict(platform='firebase', uid=self.config['uid'])
        with self._atomic():
            record = self.get(rid)
            if not record or record['version'] != version or record['kind'] != 'receipt':
                raise ValueError('stale_or_unavailable_review')
            # Keep the exact immutable request in the command hash, including time.
            # Check replay before state/endpoint gates: an accepted approval may now
            # be prepared/posted. Never mint another decision to replay it.
            decision = dict(action=action, source=source, destination=destination,
                            actor=actor, message_id=request_id, createdAt=payload['createdAt'])
            previous = self.db.execute('SELECT * FROM commands WHERE scope=? AND platform=? AND chat_id=? AND message_id=?',
                                       (self.scope, 'firebase', self.config['uid'], request_id)).fetchone()
            if previous:
                if (previous['review_id'], previous['version'], previous['decision']) != (rid, version, dumps(decision)):
                    raise ValueError('message_replay_conflict')
                return record
            # A revision already decided through any trusted channel is immutable
            # to new browser commands, including a blocked/rejected revision.
            if self.db.execute('SELECT 1 FROM commands WHERE scope=? AND review_id=? AND version=?',
                               (self.scope, rid, version)).fetchone():
                raise ValueError('decision_state_conflict')
            source, destination = _endpoints(self.config, record, action, source, destination)
            if record['event_id'] or (record['state'] != 'pending' and not (
                    record['state'] == 'blocked' and action == 'reject')):
                raise ValueError('decision_state_conflict')
            # Canonical endpoints must be explicit in the immutable web payload.
            if (source, destination) != (payload['source'], payload['destination']):
                raise ValueError('explicit_endpoints_required')
            self.db.execute('INSERT INTO commands VALUES(?,?,?,?,?,?,?)',
                            (self.scope, 'firebase', self.config['uid'], request_id, rid, version, dumps(decision)))
            state = 'rejected' if action == 'reject' else 'approved'
            changed = self.db.execute('UPDATE reviews SET state=?,decision=?,error=NULL,updated=? '
                                      'WHERE id=? AND scope=? AND version=? AND state=?',
                                      (state, dumps(decision), self.now(), rid, self.scope, version, record['state'])).rowcount
            if changed != 1:
                raise ValueError('decision_state_conflict')
            self._audit(record, 'decision', decision)
        return self.get(rid)


def _label(value):
    """Public registry labels only; never surface raw identities or diagnostics."""
    if type(value) is not str:
        return None
    value = re.sub(r'[^\s@]+@[^\s@]+', '[email]', value[:120])
    value = re.sub(r'\d{6,}', '[nomor]', value)
    return ''.join(c for c in value if c.isprintable())


def _code(value):
    return value if type(value) is str and re.fullmatch(r'[A-Za-z][A-Za-z0-9_.:-]{0,95}', value) and not re.search(r'\d{6,}', value) else None


def review_mirror(config, record, web_decision_accepted=False):
    """Allowlisted projection of canonical SQLite facts; never read a web mirror."""
    validate_web_config(config)
    if not _identifier(record['id'], 64) or not _identifier(record['version'], 16):
        raise ValueError('invalid_canonical_review_id')
    p, wallets = record['parsed'], config['registry']['wallets']
    choices = []
    if (not web_decision_accepted and record['kind'] == 'receipt'
            and record['state'] == 'pending' and not record['event_id']):
        for action in ('transfer', 'expense', 'income'):
            pairs = ([(s, d) for s in wallets for d in wallets] if action == 'transfer' else
                     [(s, 'EXTERNAL') for s in wallets] if action == 'expense' else
                     [('EXTERNAL', d) for d in wallets])
            for source, destination in pairs:
                try:
                    source, destination = _endpoints(config, record, action, source, destination)
                except (ValueError, TypeError, KeyError, OverflowError):
                    continue
                choices.append(dict(action=action, source=source, destination=destination))
    occurred = p.get('notification_at')
    try:
        _timestamp(occurred)
    except ValueError:
        occurred = None
    # Parser provenance contains account/message IDs, not provider. Resolve only
    # the exact sender against the trusted configured allowlist; publish no sender.
    from email.utils import getaddresses
    sender = (p.get('raw_fields') or {}).get('from')
    addresses = getaddresses([sender]) if type(sender) is str else []
    provider = config['sender_allowlist'].get(addresses[0][1]) if len(addresses) == 1 else None
    known = set(wallets) | {'EXTERNAL', 'UNRESOLVED'}
    endpoint = lambda side: p.get(side + '_wallet') if p.get(side + '_wallet') in known else None
    money = lambda value: value if type(value) is int and value >= 0 else None
    return dict(schemaVersion=1, id=record['id'], version=record['version'], kind=record['kind'],
                webDecisionAccepted=bool(web_decision_accepted),
                state=record['state'], amount=money(p.get('amount')), fee=money(p.get('fee_paid')),
                totalCredit=money(p.get('total_credit')),
                currency=p.get('currency') if p.get('currency') == 'IDR' else None,
                occurredAt=occurred, provider=_code(provider), reason=_code(record['reason']),
                error=_code(record.get('error')), source=endpoint('source'), destination=endpoint('destination'),
                choices=choices, walletOptions=[dict(key=k, walletId=w['id'], name=_label(w.get('name') or k))
                                               for k, w in wallets.items()],
                event_id=record['event_id'] if _identifier(record['event_id'], 64) else None,
                updatedAt=datetime.fromtimestamp(record['updated'], timezone.utc).isoformat())


def sync_web_reviews(config, store, *, publisher=None, publisher_factory=None, consume=True):
    """Ingest current immutable decisions, then mirror status. Never apply money.

    Trusted adapters may expose write_document(path, body), performing a full
    replacement; otherwise use SDK document.set(..., merge=False). Read back the
    exact target before counting a mirror write as verified. Decisions are never
    changed or deleted, including invalid/stale/conflicting ones.
    """
    counts = dict(enabled=False, accepted=0, replayed=0, rejected=0, mirrored=0)
    if config.get('financial_review_web_enabled') is not True:
        return counts
    validate_web_config(config)
    keys = ('project_id', 'uid', 'email', 'account_id', 'registry', 'checkpoint_at', 'financial_review_state_path')
    if not isinstance(store, WebReviewStore) or any(store.config[k] != config[k] for k in keys):
        raise ValueError('review_scope_mismatch')
    from financial_review_apply import default_publisher, verify_target, read_document
    if publisher is None:
        publisher = (publisher_factory or default_publisher)(config)
    verify_target(publisher, config)  # MUST precede every SDK/adapter document access.
    counts['enabled'] = True
    base = 'users/' + config['uid']
    for initial in store.rows():
        rid, version = initial['id'], initial['version']
        if not _identifier(rid, 64) or not _identifier(version, 16):
            raise ValueError('invalid_canonical_review_id')
        if consume and initial['kind'] == 'receipt':
            request_id = rid + '--' + version
            body = read_document(publisher, base + '/financialReviewDecisions/' + request_id)
            if body is not None:
                # A valid body must also match the exact path being read. A body
                # pointing at another valid pending SQLite row grants no authority.
                if body.get('reviewId') != rid or body.get('version') != version:
                    counts['rejected'] += 1
                else:
                    try:
                        before = store.db.total_changes
                        store.decide_web(body, request_id=request_id)
                        counts['replayed' if store.db.total_changes == before else 'accepted'] += 1
                    except ValueError:
                        counts['rejected'] += 1
        # Serialize local decisions through mirror readback so a simultaneous
        # Telegram decision cannot cause this tick to overwrite its newer status.
        with store._atomic():
            current = store.get(rid)
            if current is None:
                continue
            accepted = store.db.execute(
                'SELECT 1 FROM commands WHERE scope=? AND platform=? AND chat_id=? AND message_id=? '
                'AND review_id=? AND version=?',
                (store.scope, 'firebase', config['uid'], rid + '--' + current['version'], rid, current['version'])
            ).fetchone() is not None
            body = review_mirror(config, current, web_decision_accepted=accepted)
            path = base + '/financialReviews/' + rid
            writer = getattr(publisher, 'write_document', None)
            if callable(writer):
                writer(path, body)
            else:
                publisher.db.document(path).set(body, merge=False)
            if read_document(publisher, path) != body:
                raise ValueError('web_mirror_readback_mismatch')
            counts['mirrored'] += 1
    return counts


def run_web_review_hook(config, *, allow_publication=True, publisher_factory=None, processor=None, notifier=None):
    """Optional adapter for the EXISTING hook call, not another worker/cron.

    Retain discovery, publication exception handling and Telegram notices in the
    canonical hook. Web failures are additive sanitized health signals and cannot
    suppress its notifier. A post-process mirror is status-only (no second ingest).
    """
    from financial_review_hook import run_review_hook
    if config.get('financial_review_web_enabled') is not True:
        return run_review_hook(config, allow_publication=allow_publication,
                               processor=processor, notifier=notifier)
    validate_web_config(config)
    from financial_review import notify_reviews
    from financial_review_apply import process_reviews
    web_counts, errors = {}, []

    def sync(store, consume):
        try:
            result = sync_web_reviews(config, store, publisher_factory=publisher_factory, consume=consume)
            for key, value in result.items():
                if key == 'enabled':
                    web_counts[key] = value
                else:
                    web_counts[key] = web_counts.get(key, 0) + value
        except Exception as exc:
            errors.append(type(exc).__name__)

    class HookStore(WebReviewStore):
        def discover(self, financial_connection):
            result = super().discover(financial_connection)
            sync(self, True)
            return result

    def process(config, store, limit):
        if processor is not None:
            return processor(config, store, limit=limit)
        return process_reviews(config, store, publisher_factory=publisher_factory, limit=limit)

    def notify(config, store, limit):
        sync(store, False)
        return (notifier or notify_reviews)(config, store, limit=limit)

    result = run_review_hook(config, allow_publication=allow_publication,
                             store_factory=HookStore, processor=process, notifier=notify)
    result.update(web=web_counts, web_error=errors[0] if errors else '')
    return result
