"""Offline synthetic receipt approval tests; no Gmail or cloud network calls."""
import copy
from contextlib import closing
import json
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import mesh
from mesh_parser import parse_email
from test_mesh import config as mesh_config


class StoreStub:
    def __init__(self, config, records=()):
        self.config = config
        self.scope = config['project_id'] + ':' + config['uid']
        self.records = {r['id']: copy.deepcopy(r) for r in records}

    def rows(self, states=None):
        return [copy.deepcopy(r) for r in self.records.values() if states is None or r['state'] in states]

    def get(self, rid):
        return copy.deepcopy(self.records.get(rid))

    def transition(self, rid, expected_states, state, **values):
        r = self.records[rid]
        if r['state'] not in expected_states:
            raise ValueError('CAS')
        r.update(state=state, updated=time.time(), **values)
        return copy.deepcopy(r)


def synthetic_fingerprint(config, reason, parsed, raw):
    return mesh.digest([config['registry'], config['checkpoint_at'], reason, parsed, raw])


class PublisherFake:
    """Narrow offline adapter. Documents have the real canonical SDK writer shape."""
    def __init__(self, config):
        self.config = config
        self.base = 'users/' + config['uid']
        self.identity = {k: config[k] for k in ('project_id', 'uid', 'email')}
        self.docs = {self.base + '/wallets/' + w['id']: dict(balance=50000, type=w.get('type'), name=key)
                     for key, w in config['registry']['wallets'].items()}
        self.docs[self.base + '/mesh_state/demo-checkpoint'] = dict(
            checkpoint_at=config['checkpoint_at'], scope=config['project_id'] + ':' + config['uid'], basis='demo_simulation')
        self.calls = []
        self.after_commit_error = False

    def verify_target(self, config):
        return copy.deepcopy(self.identity)

    def read_document(self, path):
        return copy.deepcopy(self.docs.get(path))

    def apply(self, payload):
        self.calls.append(copy.deepcopy(payload))
        marker = self.base + '/mesh_events/demo-' + payload['event_id']
        effect = mesh.digest({k: payload[k] for k in ('scope', 'event_id', 'movements', 'checkpoint_at')})
        if marker not in self.docs:
            self.docs[marker] = {k: copy.deepcopy(payload[k]) for k in ('scope', 'event_id', 'checkpoint_at', 'parsed', 'evidence')}
            self.docs[marker]['effect_hash'] = effect
            for i, component in enumerate(payload['components']):
                self.docs[self.base + '/transactions/demo-mesh-' + payload['event_id'] + '-' + str(i)] = copy.deepcopy(component)
            for movement in payload['movements']:
                self.docs[self.base + '/wallets/' + movement['wallet']][movement['field']] += movement['delta']
        elif self.docs[marker]['effect_hash'] != effect:
            raise ValueError('effect conflict')
        if self.after_commit_error:
            raise TimeoutError('synthetic ambiguous response, private details must not escape')


class SDKDatabase:
    """Firestore-shaped, atomic create/increment fake for the real canonical writer."""
    def __init__(self, project, docs):
        self.project = project
        self.docs = copy.deepcopy(docs)

    def document(self, path):
        db = self
        class Reference:
            def get(self, transaction=None):
                body = copy.deepcopy((transaction.docs if transaction else db.docs).get(path))
                class Snapshot:
                    exists = body is not None
                    def to_dict(self):
                        return copy.deepcopy(body)
                return Snapshot()
        ref = Reference()
        ref.path = path
        return ref

    def transaction(self):
        db = self
        class Transaction:
            def __init__(self):
                self.db = db
                self.docs = copy.deepcopy(db.docs)
            def create(self, ref, value):
                if ref.path in self.docs:
                    raise ValueError('already_exists')
                self.docs[ref.path] = copy.deepcopy(value)
            def set(self, ref, value, merge=False):
                self.docs[ref.path] = dict(self.docs.get(ref.path, {}), **value) if merge else copy.deepcopy(value)
            def update(self, ref, values):
                from google.cloud.firestore_v1.transforms import Increment
                for field, value in values.items():
                    if isinstance(value, Increment):
                        self.docs[ref.path][field] = self.docs[ref.path].get(field, 0) + value.value
                    else:
                        self.docs[ref.path][field] = copy.deepcopy(value)
        return Transaction()

    @staticmethod
    def runner(fn):
        def atomic(transaction):
            fn(transaction)
            transaction.db.docs = transaction.docs
        return atomic


class ApplyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.config = mesh_config(self.root)
        self.config.update(publish_enabled=True, financial_review_enabled=True,
            financial_review_state_path=str(self.root / 'reviews.sqlite3'),
            financial_review_admin_chat_id='790484718', financial_review_admin_user_ids=['790484718'])

    def fixture(self, unrelated_missing=False):
        self.config['registry'] = {'wallets': {'KROM': {'id': 'wk', 'type': 'bank'},
            'GOPAY': {'id': 'wg', 'type': 'ewallet'}},
            'aliases': {'owned-krom': 'KROM', 'owned-gopay': 'GOPAY'}}
        if unrelated_missing:
            self.config['registry']['wallets']['SPAYLATER'] = {'id': 'skip-unrelated-wallet', 'type': 'paylater'}
        self.raw = dict(account_id='akun-1', gmail_message_id='synthetic-receipt', provider='Krom',
            **{'from': 'synthetic@krom.id'}, subject='Transaksi Berhasil',
            date='Wed, 07 Oct 2026 07:30:00 +0700',
            body_normalized='Transaksi E-Wallet telah berhasil\nJumlah: Rp10.000\n')
        with mesh.Engine(self.config) as engine:
            engine.ingest([self.raw])
            candidate = dict(engine.db.execute('SELECT * FROM candidates').fetchone())
            # Prove this processor never drains unrelated work.
            with engine.db:
                engine.db.execute("INSERT INTO outbox(scope,event_id,payload,state) VALUES(?,?,?,'pending')",
                    (engine.scope, 'unrelated', '{}'))
        self.parsed = json.loads(candidate['parsed'])
        self.fp = synthetic_fingerprint(self.config, candidate['reason'], self.parsed, self.raw)
        self.record = dict(id='receipt-synthetic', scope=engine.scope, account='akun-1',
            message=self.raw['gmail_message_id'], kind='receipt', version=self.fp[:16], fingerprint=self.fp,
            raw_hash=mesh.digest(self.raw), parsed=self.parsed, reason=candidate['reason'], state='approved',
            event_id=None, decision={'action': 'transfer', 'source': 'KROM', 'destination': 'GOPAY'}, result=None)
        self.store = StoreStub(self.config, [self.record])
        self.publisher = PublisherFake(self.config)
        self.addCleanup(patch.stopall)
        patch('financial_review_apply.fingerprint', synthetic_fingerprint).start()

    def run_processor(self, limit=10):
        import financial_review_apply as apply
        return apply.process_reviews(self.config, self.store, publisher_factory=lambda c: self.publisher, limit=limit)

    def four_receipts(self):
        self.fixture()
        with mesh.Engine(self.config) as engine:
            for i in range(1, 4):
                raw = dict(self.raw, gmail_message_id='synthetic-receipt-' + str(i),
                    body_normalized=self.raw['body_normalized'].replace('10.000', str(10 + i) + '.000'))
                engine.ingest([raw])
                candidate = dict(engine.db.execute('SELECT * FROM candidates WHERE message=?',
                    (raw['gmail_message_id'],)).fetchone())
                parsed = json.loads(candidate['parsed'])
                record = copy.deepcopy(self.record)
                record.update(id='receipt-' + str(i), message=raw['gmail_message_id'], parsed=parsed,
                    reason=candidate['reason'], raw_hash=mesh.digest(raw), created=i, updated=i)
                record['fingerprint'] = synthetic_fingerprint(self.config, record['reason'], parsed, raw)
                record['version'] = record['fingerprint'][:16]
                self.store.records[record['id']] = record
        self.store.records[self.record['id']].update(created=0, updated=0)

    def test_waiting_oldest_three_do_not_consume_limit_or_make_backups(self):
        self.four_receipts()
        with patch.object(self.publisher, 'apply', side_effect=ConnectionError):
            self.assertEqual(self.run_processor(limit=3)['deferred'], 3)
        root = self.root / 'financial-review-backups'
        before = set(root.rglob('*'))
        for i, record in enumerate(self.store.records.values()):
            record['updated'] = i  # deferred records really are the oldest
        self.assertEqual(self.run_processor(limit=3)['posted'], 1)
        self.assertEqual(self.store.get('receipt-3')['state'], 'posted')
        # Only the newly eligible fourth receipt needs a preparation backup.
        self.assertEqual(len(set(root.rglob('ledger-before.sqlite3'))), 4)
        self.assertTrue(before <= set(root.rglob('*')))

    def test_exhausted_oldest_three_block_with_canonical_ids_without_backup_or_starvation(self):
        self.four_receipts()
        with patch.object(self.publisher, 'apply', side_effect=ConnectionError):
            self.assertEqual(self.run_processor(limit=3)['deferred'], 3)
        ids = {r['id']: r['event_id'] for r in self.store.rows(states=['prepared'])}
        for i, record in enumerate(self.store.records.values()):
            record['updated'] = i
        with closing(sqlite3.connect(self.config['db_path'])) as db, db:
            db.execute("UPDATE outbox SET attempts=12,next_attempt=99999999999 WHERE event_id!='unrelated'")
        import financial_review_apply as apply
        original = apply.backup
        def only_new(engine, config, cloud):
            self.assertEqual(len(self.ledger_rows('events')), 3)
            return original(engine, config, cloud)
        with patch.object(apply, 'backup', side_effect=only_new) as saved:
            result = self.run_processor(limit=3)
        self.assertEqual(result['posted'], 1)
        self.assertEqual(result['blocked'], 3)
        self.assertEqual(saved.call_count, 1)
        for rid, eid in ids.items():
            record = self.store.get(rid)
            self.assertEqual(record['state'], 'blocked')
            self.assertEqual(record['error'], 'publication_attempts_exhausted')
            self.assertEqual(record['event_id'], eid)
        self.assertEqual(len(self.ledger_rows('events')), 4)
        self.assertEqual(len(self.publisher.calls), 1)

    def test_transient_failure_before_outbox_rotates_first_three_for_fourth_next_tick(self):
        self.four_receipts()
        import financial_review_apply as apply
        def offline(config):
            raise ConnectionError('offline before any outbox exists')
        first = apply.process_reviews(self.config, self.store, publisher_factory=offline, limit=3)
        self.assertEqual(first['deferred'], 3)
        self.assertEqual(self.ledger_rows('events'), [])
        self.assertEqual(len(self.ledger_rows('outbox')), 1)  # unrelated only
        self.assertEqual(self.run_processor(limit=3)['posted'], 3)
        self.assertEqual(self.publisher.calls[0]['parsed']['amount'], 13000)
        self.assertEqual(self.store.get('receipt-3')['state'], 'posted')

    def test_repeated_eligible_publication_failures_reuse_private_preparation_backup(self):
        self.fixture()
        with patch.object(self.publisher, 'apply', side_effect=ConnectionError):
            for _ in range(6):
                with closing(sqlite3.connect(self.config['db_path'])) as db, db:
                    db.execute('UPDATE outbox SET next_attempt=0')
                self.assertEqual(self.run_processor()['deferred'], 1)
        record = self.store.get(self.record['id'])
        root = self.root / 'financial-review-backups'
        self.assertEqual(len(list(root.rglob('ledger-before.sqlite3'))), 1)
        self.assertEqual(len(list(root.rglob('event-before.json'))), 1)
        with closing(sqlite3.connect(Path(record['result']['backup_path']) / 'ledger-before.sqlite3')) as saved:
            self.assertIsNone(saved.execute('SELECT event_id FROM candidates').fetchone()[0])
        self.assertEqual(len(self.ledger_rows('events')), 1)
        self.assertEqual({r[1]: r for r in self.ledger_rows('outbox')}[record['event_id']][4], 6)

    def test_retention_keeps_twenty_finished_and_two_active_never_follows_outside_paths(self):
        self.fixture()
        import financial_review_apply as apply
        with patch.object(self.publisher, 'apply', side_effect=ConnectionError):
            self.assertEqual(self.run_processor()['deferred'], 1)
        active = self.store.get(self.record['id'])
        preserved = Path(active['result']['backup_path'])
        identity = json.loads((preserved / 'review.json').read_text())
        root = preserved.parent
        with apply.existing_engine(self.config) as engine:
            for i in range(25):
                bundle = apply.backup(engine, self.config, {})
                rid = 'finished-' + str(i)
                apply.private_json(bundle / 'review.json', dict(identity, review_id=rid))
                self.store.records[rid] = dict(id=rid, state='posted')
            for _ in range(5):
                bundle = apply.backup(engine, self.config, {})
                apply.private_json(bundle / 'review.json', identity)
        outside = self.root / 'outside'
        outside.mkdir()
        (outside / 'ledger-before.sqlite3').write_text('must survive')
        link = root / '20000101T000000000000Z-00000000000000000000000000000000'
        link.symlink_to(outside, target_is_directory=True)
        foreign = root / 'unmanaged'
        foreign.mkdir()
        (foreign / 'ledger-before.sqlite3').write_text('also survive')
        # A ceiling-blocked canonical event is still unresolved, not finished.
        self.store.records[active['id']]['state'] = 'blocked'
        self.store.records['foreign-ref'] = dict(id='foreign-ref', state='posted',
            result={'backup_path': str(outside)})
        self.run_processor(limit=0)
        managed = [p for p in root.iterdir() if not p.is_symlink() and (p / 'review.json').is_file()]
        identities = [json.loads((p / 'review.json').read_text()) for p in managed]
        self.assertEqual(sum(m['review_id'].startswith('finished-') for m in identities), 20)
        self.assertEqual(sum(m['review_id'] == active['id'] for m in identities), 2)
        self.assertTrue((preserved / 'ledger-before.sqlite3').is_file())
        self.assertEqual((outside / 'ledger-before.sqlite3').read_text(), 'must survive')
        self.assertTrue(link.is_symlink())
        self.assertEqual((foreign / 'ledger-before.sqlite3').read_text(), 'also survive')

    def test_ceiling_ambiguous_commit_recovers_by_readback_without_backup_or_second_apply(self):
        self.fixture()
        self.publisher.after_commit_error = True
        self.assertEqual(self.run_processor()['deferred'], 1)
        eid = self.store.get(self.record['id'])['event_id']
        cloud = copy.deepcopy(self.publisher.docs)
        with closing(sqlite3.connect(self.config['db_path'])) as db, db:
            db.execute('UPDATE outbox SET attempts=12,next_attempt=99999999999 WHERE event_id=?', (eid,))
        # Recover read-only even if a legacy/crashed review lost its backup link.
        self.store.records[self.record['id']]['result'] = None
        with patch('financial_review_apply.backup', side_effect=AssertionError('no backup during ceiling recovery')):
            self.assertEqual(self.run_processor()['posted'], 1)
        self.assertEqual(self.store.get(self.record['id'])['event_id'], eid)
        self.assertEqual(self.publisher.docs, cloud)
        self.assertEqual(len(self.publisher.calls), 1)
        self.assertEqual(len(self.ledger_rows('events')), 1)
        self.assertEqual({r[1]: r for r in self.ledger_rows('outbox')}[eid][3], 'sent')

    def test_repeated_prepare_rollback_reuses_snapshot_before_any_financial_mutation(self):
        self.fixture()
        before = {t: self.ledger_rows(t) for t in ('candidates', 'events', 'outbox', 'movements')}
        original = mesh.Engine._ingest
        def fail_after_prepare(engine, raw, archive=False):
            original(engine, raw, archive)
            raise RuntimeError('synthetic local rollback')
        with patch.object(mesh.Engine, '_ingest', fail_after_prepare):
            for _ in range(6):
                self.assertEqual(self.run_processor()['deferred'], 1)
        for table, rows in before.items():
            self.assertEqual(self.ledger_rows(table), rows)
        self.assertEqual(len(list((self.root / 'financial-review-backups').rglob('ledger-before.sqlite3'))), 1)
        self.assertEqual(self.publisher.calls, [])
        self.assertEqual(self.run_processor()['posted'], 1)

    def test_invalid_cloud_snapshot_is_not_reused_before_eligible_retry(self):
        self.fixture()
        with patch.object(self.publisher, 'apply', side_effect=ConnectionError):
            self.assertEqual(self.run_processor()['deferred'], 1)
        old = Path(self.store.get(self.record['id'])['result']['backup_path'])
        (old / 'cloud-before.json').write_text('invalid JSON')
        with closing(sqlite3.connect(self.config['db_path'])) as db, db:
            db.execute('UPDATE outbox SET next_attempt=0')
        self.assertEqual(self.run_processor()['posted'], 1)
        new = Path(self.store.get(self.record['id'])['result']['backup_path'])
        self.assertNotEqual(new, old)
        self.assertIsInstance(json.loads((new / 'cloud-before.json').read_text()), dict)

    def test_real_store_ceiling_canonical_binding_refuses_reapproval_and_remint(self):
        self.fixture()
        patch.stopall()
        from financial_review import ReviewStore
        import financial_review_apply as apply
        actor = dict(platform='telegram', chat_id='790484718', user_id='790484718', is_bot=False, chat_type='dm')
        with ReviewStore(self.config) as store:
            with closing(sqlite3.connect(self.config['db_path'])) as ledger:
                ledger.row_factory = sqlite3.Row
                store.discover(ledger)
            receipt = store.rows(states=['pending'])[0]
            store.decide(receipt['id'], receipt['version'], 'transfer', 'KROM', 'GOPAY', actor=actor, message_id='1001')
            with patch.object(self.publisher, 'apply', side_effect=ConnectionError):
                self.assertEqual(apply.process_reviews(self.config, store,
                    publisher_factory=lambda c: self.publisher)['deferred'], 1)
            eid = store.get(receipt['id'])['event_id']
            with closing(sqlite3.connect(self.config['db_path'])) as db, db:
                db.execute('UPDATE outbox SET attempts=12,next_attempt=0 WHERE event_id=?', (eid,))
            self.assertEqual(apply.process_reviews(self.config, store,
                publisher_factory=lambda c: self.publisher)['blocked'], 1)
            self.assertEqual(store.get(receipt['id'])['event_id'], eid)
            with self.assertRaisesRegex(ValueError, 'decision_state_conflict'):
                store.decide(receipt['id'], receipt['version'], 'retry', actor=actor, message_id='1002')
            self.assertEqual(apply.process_reviews(self.config, store,
                publisher_factory=lambda c: self.publisher)['processed'], 0)
        self.assertEqual(len(self.ledger_rows('events')), 1)
        self.assertEqual(len(self.ledger_rows('outbox')), 2)  # canonical plus unrelated
        self.assertEqual(self.publisher.calls, [])

    def ledger_rows(self, table):
        with closing(sqlite3.connect(self.config['db_path'])) as db:
            return db.execute('SELECT * FROM ' + table).fetchall()

    def test_approved_missing_endpoint_posts_once_preserves_evidence_and_other_outbox(self):
        self.fixture()
        before = {t: self.ledger_rows(t) for t in ('evidence', 'registry', 'checkpoints', 'aliases')}
        result = self.run_processor()
        self.assertEqual(result, dict(processed=1, posted=1, deferred=0, blocked=0))
        posted = self.store.get(self.record['id'])
        self.assertEqual(posted['state'], 'posted')
        self.assertEqual(len(posted['result']['transaction_ids']), 1)
        self.assertEqual(len(self.publisher.calls), 1)
        payload = self.publisher.calls[0]
        self.assertIsNone(payload['parsed']['destination_identity'])
        self.assertIsNone(payload['parsed']['fee_paid'])
        self.assertEqual(payload['components'][0]['type'], 'transfer')
        self.assertEqual(payload['components'][0]['categoryId'], None)
        self.assertEqual(self.publisher.docs[self.publisher.base + '/wallets/wk']['balance'], 40000)
        self.assertEqual(self.publisher.docs[self.publisher.base + '/wallets/wg']['balance'], 60000)
        for t, rows in before.items():
            self.assertEqual(self.ledger_rows(t), rows)
        outbox = {r[1]: r for r in self.ledger_rows('outbox')}
        self.assertEqual(outbox['unrelated'][3], 'pending')
        self.assertEqual(outbox[posted['event_id']][3], 'sent')
        self.assertEqual(self.run_processor()['processed'], 0)
        self.assertEqual(len(self.publisher.calls), 1)
        backups = list((self.root / 'financial-review-backups').rglob('ledger-before.sqlite3'))
        self.assertEqual(len(backups), 1)
        with closing(sqlite3.connect(backups[0])) as saved:
            self.assertIsNone(saved.execute('SELECT event_id FROM candidates').fetchone()[0])
        self.assertEqual(backups[0].stat().st_mode & 0o077, 0)

    def test_restart_recovers_local_commit_before_review_event_id(self):
        self.fixture()
        class HardCrash(BaseException):
            pass
        original = self.store.transition
        def crash(rid, expected, state, **values):
            if state == 'prepared':
                raise HardCrash()
            return original(rid, expected, state, **values)
        self.store.transition = crash
        with self.assertRaises(HardCrash):
            self.run_processor()
        eid = self.ledger_rows('events')[0][1]
        self.assertIsNone(self.store.get(self.record['id'])['event_id'])
        self.assertEqual(self.store.get(self.record['id'])['state'], 'approved')
        self.assertEqual(len(self.publisher.calls), 0)
        self.store.transition = original
        self.assertEqual(self.run_processor()['posted'], 1)
        self.assertEqual(self.store.get(self.record['id'])['event_id'], eid)
        self.assertEqual(len(self.ledger_rows('events')), 1)
        self.assertEqual(self.publisher.calls[0]['event_id'], eid)

    def test_ambiguous_cloud_commit_recovers_same_id_with_exact_readback(self):
        self.fixture()
        self.publisher.after_commit_error = True
        first = self.run_processor()
        self.assertEqual(first['deferred'], 1)
        record = self.store.get(self.record['id'])
        self.assertEqual(record['state'], 'prepared')
        self.assertEqual(record['error'], 'TimeoutError')
        eid = record['event_id']
        self.assertEqual({r[1]: r for r in self.ledger_rows('outbox')}[eid][3], 'pending')
        cloud = copy.deepcopy(self.publisher.docs)
        # Restart must read the successful canonical documents, not increment again.
        self.assertEqual(self.run_processor()['posted'], 1)
        self.assertEqual(self.store.get(self.record['id'])['event_id'], eid)
        self.assertEqual(self.publisher.docs, cloud)
        self.assertEqual(len(self.publisher.calls), 1)
        self.assertEqual(len(self.ledger_rows('events')), 1)

    def test_retry_reparses_only_selected_candidate_without_overrides_or_publication(self):
        self.fixture()
        self.store.records[self.record['id']]['decision'] = {'action': 'retry'}
        changed = copy.deepcopy(self.parsed)
        changed['note'] = 'new deterministic parser metadata'
        with patch('financial_review_apply.parse_email', return_value=changed):
            result = self.run_processor()
        self.assertEqual(result['blocked'], 1)
        self.assertEqual(self.publisher.calls, [])
        self.assertEqual(self.ledger_rows('events'), [])
        candidates = self.ledger_rows('candidates')
        self.assertEqual(json.loads(candidates[0][3])['note'], changed['note'])
        self.assertEqual(candidates[0][4], 'ineligible')
        self.assertEqual(self.store.get(self.record['id'])['error'], 'retry_ineligible')

    def test_invalid_review_configuration_fails_before_publisher(self):
        self.fixture()
        self.config['financial_review_admin_user_ids'] = ['foreign-admin']
        import financial_review_apply as apply
        with self.assertRaises(ValueError):
            apply.process_reviews(self.config, self.store,
                publisher_factory=lambda c: self.fail('publisher opened under wrong admin config'))
        self.assertEqual(self.ledger_rows('events'), [])

    def test_publication_failure_uses_durable_bounded_retry_backoff_same_event(self):
        self.fixture()
        calls = []
        def unavailable(payload):
            calls.append(payload['event_id'])
            raise ConnectionError('synthetic private server details')
        self.publisher.apply = unavailable
        self.assertEqual(self.run_processor()['deferred'], 1)
        eid = self.store.get(self.record['id'])['event_id']
        pending = {r[1]: r for r in self.ledger_rows('outbox')}[eid]
        self.assertEqual(pending[4], 1)
        self.assertGreater(pending[5], 0)
        self.assertEqual(pending[6], 'ConnectionError')
        self.assertEqual(self.run_processor()['deferred'], 1)
        self.assertEqual(calls, [eid])
        self.assertEqual(self.store.get(self.record['id'])['state'], 'prepared')

    def replace_cached(self, parsed, reason=None):
        record = self.store.records[self.record['id']]
        record['parsed'] = copy.deepcopy(parsed)
        if reason is not None:
            record['reason'] = reason
        record['fingerprint'] = synthetic_fingerprint(self.config, record['reason'], parsed, self.raw)
        record['version'] = record['fingerprint'][:16]
        with closing(sqlite3.connect(self.config['db_path'])) as db, db:
            db.execute('UPDATE candidates SET parsed=?,reason=? WHERE message=?',
                       (mesh.dumps(parsed), record['reason'], record['message']))

    def assert_blocked_without_financial_mutation(self):
        before = {t: self.ledger_rows(t) for t in ('evidence', 'candidates', 'events', 'outbox', 'movements', 'checkpoints', 'registry', 'holds')}
        self.assertEqual(self.run_processor()['blocked'], 1)
        self.assertEqual(self.publisher.calls, [])
        for table, rows in before.items():
            self.assertEqual(self.ledger_rows(table), rows, table)

    def test_changed_raw_hash_is_stale_and_unpublishable(self):
        self.fixture()
        raw = dict(self.raw, body_normalized=self.raw['body_normalized'] + 'changed')
        with closing(sqlite3.connect(self.config['db_path'])) as db, db:
            db.execute('UPDATE evidence SET raw=?', (mesh.dumps(raw),))
        self.assert_blocked_without_financial_mutation()
        self.assertEqual(self.store.get(self.record['id'])['error'], 'receipt_raw_changed')

    def test_changed_candidate_facts_are_stale(self):
        self.fixture()
        with closing(sqlite3.connect(self.config['db_path'])) as db, db:
            db.execute('UPDATE candidates SET reason=?', ('unknown_fee',))
        self.assert_blocked_without_financial_mutation()

    def test_fresh_parser_changed_financial_facts_cannot_be_approved(self):
        self.fixture()
        with patch('financial_review_apply.parse_email', return_value=dict(self.parsed, amount=20000)):
            self.assert_blocked_without_financial_mutation()
        self.assertEqual(self.store.get(self.record['id'])['error'], 'fresh_parser_changed')

    def test_known_registered_endpoint_cannot_be_remapped(self):
        self.fixture()
        self.store.records[self.record['id']]['decision']['source'] = 'GOPAY'
        self.store.records[self.record['id']]['decision']['destination'] = 'KROM'
        self.assert_blocked_without_financial_mutation()
        self.assertEqual(self.store.get(self.record['id'])['error'], 'known_endpoint_remap')

    def test_actual_cloud_wallet_must_exist(self):
        self.fixture()
        del self.publisher.docs[self.publisher.base + '/wallets/wg']
        self.assert_blocked_without_financial_mutation()
        self.assertEqual(self.store.get(self.record['id'])['error'], 'cloud_wallet_missing')

    def test_cloud_auth_other_uid_is_refused(self):
        self.fixture()
        self.publisher.identity['uid'] = 'other-user'
        self.assert_blocked_without_financial_mutation()
        self.assertEqual(self.store.get(self.record['id'])['error'], 'cloud_identity_mismatch')

    def test_cloud_checkpoint_must_be_current(self):
        self.fixture()
        self.publisher.docs[self.publisher.base + '/mesh_state/demo-checkpoint']['checkpoint_at'] = '2000-01-01T00:00:00+00:00'
        self.assert_blocked_without_financial_mutation()

    def test_unknown_fee_is_not_overridden_by_endpoint_approval(self):
        self.fixture()
        parsed = dict(self.parsed, fee_displayed=2500, fee_paid=None)
        self.replace_cached(parsed)
        with patch('financial_review_apply.parse_email', return_value=parsed):
            self.assert_blocked_without_financial_mutation()

    def test_other_parser_errors_cannot_be_removed(self):
        self.fixture()
        parsed = dict(self.parsed, validation_errors=['unresolved_destination', 'invalid_money:Total'])
        self.replace_cached(parsed)
        with patch('financial_review_apply.parse_email', return_value=parsed):
            self.assert_blocked_without_financial_mutation()

    def test_hold_link_uncertainty_cannot_be_overridden(self):
        self.fixture()
        with closing(sqlite3.connect(self.config['db_path'])) as db, db:
            db.execute('INSERT INTO holds VALUES(?,?,?,?,?,?,?,?)',
                       (self.store.scope, 'old-hold', 'Krom', '', '', 'KROM', 10000, None))
        self.assert_blocked_without_financial_mutation()

    def test_reference_conflicts_preserve_all_prior_rows(self):
        self.fixture()
        parsed = dict(self.parsed, reference='SYNTHETIC-REF')
        self.replace_cached(parsed)
        other = dict(parsed, eligible=True, validation_errors=[], destination_wallet='GOPAY', amount=11000)
        with mesh.Engine(self.config, parser=lambda raw, registry: other) as engine:
            engine.ingest([dict(self.raw, gmail_message_id='unrelated-receipt')])
        with patch('financial_review_apply.parse_email', return_value=parsed):
            self.assert_blocked_without_financial_mutation()

    def test_local_prepare_failure_rolls_back_and_can_retry(self):
        self.fixture()
        before = {t: self.ledger_rows(t) for t in ('evidence', 'candidates', 'events', 'outbox', 'movements')}
        original = mesh.Engine._ingest
        def fail_after_prepare(engine, raw, archive=False):
            original(engine, raw, archive)
            raise RuntimeError('synthetic local fault')
        with patch.object(mesh.Engine, '_ingest', fail_after_prepare):
            self.assertEqual(self.run_processor()['deferred'], 1)
        self.assertEqual(self.store.get(self.record['id'])['state'], 'approved')
        for table, rows in before.items():
            self.assertEqual(self.ledger_rows(table), rows)
        self.assertEqual(self.publisher.calls, [])
        self.assertEqual(self.run_processor()['posted'], 1)

    def test_retry_ready_uses_fresh_parser_without_admin_endpoint_override(self):
        self.fixture()
        self.store.records[self.record['id']]['decision'] = {'action': 'retry'}
        parsed = dict(self.parsed, destination_wallet='GOPAY', destination_flag='GOPAY', eligible=True, validation_errors=[])
        with patch('financial_review_apply.parse_email', return_value=parsed):
            result = self.run_processor()
        self.assertEqual(result['posted'], 1)
        self.assertEqual(self.publisher.calls[0]['parsed']['destination_wallet'], 'GOPAY')
        self.assertIsNone(self.publisher.calls[0]['parsed']['destination_identity'])

    def test_retry_cannot_mutate_a_changed_current_candidate(self):
        self.fixture()
        self.store.records[self.record['id']]['decision'] = {'action': 'retry'}
        with closing(sqlite3.connect(self.config['db_path'])) as db, db:
            db.execute('UPDATE candidates SET parsed=?', (mesh.dumps(dict(self.parsed, amount=20000)),))
        self.assert_blocked_without_financial_mutation()

    def test_real_store_and_canonical_sdk_publisher_end_to_end_offline(self):
        self.fixture()
        patch.stopall()
        from financial_review import ReviewStore
        import financial_review_apply as apply
        db = SDKDatabase(self.config['project_id'], self.publisher.docs)
        publisher = mesh.FirestorePublisher(self.config, db=db,
            auth_lookup=lambda email: (self.config['uid'], email), transaction_runner=db.runner)
        actor = dict(platform='telegram', chat_id='790484718', user_id='790484718', is_bot=False, chat_type='dm')
        with ReviewStore(self.config) as store:
            with closing(sqlite3.connect(self.config['db_path'])) as ledger:
                ledger.row_factory = sqlite3.Row
                store.discover(ledger)
            receipt = store.rows(states=['pending'])[0]
            decided = store.decide(receipt['id'], receipt['version'], 'transfer', 'KROM', 'GOPAY',
                         actor=actor, message_id='1001')
            self.assertEqual(decided['state'], 'approved')
            self.assertEqual(apply.process_reviews(self.config, store, publisher_factory=lambda c: publisher)['posted'], 1)
            posted = store.get(receipt['id'])
            self.assertEqual(posted['state'], 'posted')
            # Telegram command replay remains a no-op even after publication.
            self.assertEqual(store.decide(receipt['id'], receipt['version'], 'transfer', 'KROM', 'GOPAY',
                         actor=actor, message_id='1001')['state'], 'posted')
            self.assertEqual(apply.process_reviews(self.config, store, publisher_factory=lambda c: publisher)['processed'], 0)
        with ReviewStore(self.config) as restarted:
            self.assertEqual(restarted.get(receipt['id'])['event_id'], posted['event_id'])
            self.assertEqual(apply.process_reviews(self.config, restarted, publisher_factory=lambda c: publisher)['processed'], 0)
        self.assertEqual(db.docs[publisher.base + '/wallets/wk']['balance'], 40000)
        self.assertEqual(db.docs[publisher.base + '/wallets/wg']['balance'], 60000)
        self.assertEqual(len([p for p in db.docs if '/transactions/' in p]), 1)
        self.assertEqual(len([p for p in db.docs if '/mesh_events/' in p]), 1)

    def test_only_errors_for_actually_missing_endpoints_can_be_removed(self):
        self.fixture()
        parsed = dict(self.parsed, validation_errors=['unresolved_destination', 'unresolved_source'])
        self.replace_cached(parsed)
        with patch('financial_review_apply.parse_email', return_value=parsed):
            self.assert_blocked_without_financial_mutation()

    def test_expense_resolution_preserves_whitelist_category_and_tag_semantics(self):
        self.fixture()
        from destination_whitelist import DestinationWhitelist
        self.config['destination_whitelist_path'] = str(self.root / 'whitelist.sqlite3')
        self.config['categories'][0]['name'] = 'Jasa'
        with mesh.Engine(self.config):
            pass
        parsed = dict(self.parsed, destination_identity='SYNTHETIC SHOP')
        self.replace_cached(parsed)
        self.store.records[self.record['id']]['decision'] = dict(action='expense', source='KROM', destination='EXTERNAL')
        with DestinationWhitelist(self.config['destination_whitelist_path'], self.store.scope) as whitelist:
            whitelist.observe('SYNTHETIC SHOP')
            whitelist.decide('SYNTHETIC SHOP', 'Jasa', 'Synthetic', source='admin')
        with patch('financial_review_apply.parse_email', return_value=parsed):
            self.assertEqual(self.run_processor()['posted'], 1)
        component = self.publisher.calls[0]['components'][0]
        self.assertEqual(component['type'], 'expense')
        self.assertEqual(component['categoryId'], 'c3')
        self.assertEqual(component['destination_source'], 'admin')
        self.assertIn('Synthetic', component['tags'])
        self.assertEqual(component['destination'], 'SYNTHETIC SHOP')
        self.assertEqual(self.publisher.docs[self.publisher.base + '/wallets/wg']['balance'], 50000)

    def test_income_resolution_only_credits_the_registered_destination(self):
        self.fixture()
        parsed = dict(self.parsed, event_type='transfer_in', source_wallet='UNRESOLVED',
            destination_wallet='GOPAY', destination_flag='GOPAY', validation_errors=['unresolved_source'])
        self.replace_cached(parsed)
        self.store.records[self.record['id']]['decision'] = dict(action='income', destination='GOPAY', source='EXTERNAL')
        with patch('financial_review_apply.parse_email', return_value=parsed):
            self.assertEqual(self.run_processor()['posted'], 1)
        payload = self.publisher.calls[0]
        self.assertEqual(payload['components'][0]['type'], 'income')
        self.assertEqual(payload['movements'], [dict(wallet='wg', field='balance', delta=10000)])
        self.assertIsNone(payload['parsed']['source_identity'])

    def test_unverifiable_cloud_component_never_marks_outbox_sent(self):
        self.fixture()
        original = self.publisher.apply
        def corrupt(payload):
            original(payload)
            component = self.publisher.base + '/transactions/demo-mesh-' + payload['event_id'] + '-0'
            self.publisher.docs[component]['amount'] = 999
        self.publisher.apply = corrupt
        self.assertEqual(self.run_processor()['deferred'], 1)
        record = self.store.get(self.record['id'])
        self.assertEqual(record['state'], 'prepared')
        self.assertEqual({r[1]: r for r in self.ledger_rows('outbox')}[record['event_id']][3], 'pending')

    def test_bound_event_without_matching_admin_provenance_cannot_resume(self):
        self.fixture()
        self.publisher.after_commit_error = True
        self.assertEqual(self.run_processor()['deferred'], 1)
        eid = self.store.get(self.record['id'])['event_id']
        with closing(sqlite3.connect(self.config['db_path'])) as db, db:
            payload = json.loads(db.execute('SELECT payload FROM outbox WHERE event_id=?', (eid,)).fetchone()[0])
            payload['parsed']['financial_review']['decision_hash'] = 'foreign-decision'
            db.execute('UPDATE outbox SET payload=? WHERE event_id=?', (mesh.dumps(payload), eid))
        before_calls = len(self.publisher.calls)
        self.assertEqual(self.run_processor()['blocked'], 1)
        self.assertEqual(len(self.publisher.calls), before_calls)
        self.assertEqual(len(self.ledger_rows('events')), 1)
        self.assertEqual(self.store.get(self.record['id'])['error'], 'canonical_provenance_mismatch')

    def test_restart_after_sent_before_posted_only_reads_existing_canonical_event(self):
        self.fixture()
        original = self.store.transition
        class HardCrash(BaseException):
            pass
        def crash(rid, expected, state, **values):
            if state == 'posted':
                raise HardCrash()
            return original(rid, expected, state, **values)
        self.store.transition = crash
        with self.assertRaises(HardCrash):
            self.run_processor()
        eid = self.store.get(self.record['id'])['event_id']
        self.assertEqual({r[1]: r for r in self.ledger_rows('outbox')}[eid][3], 'sent')
        self.store.transition = original
        self.assertEqual(self.run_processor()['posted'], 1)
        self.assertEqual(len(self.publisher.calls), 1)
        self.assertEqual(self.store.get(self.record['id'])['event_id'], eid)

    def test_sdk_timestamps_in_cloud_backups_do_not_block_approved_receipt(self):
        self.fixture()
        from datetime import datetime, timezone
        timestamp = datetime(2026, 10, 7, tzinfo=timezone.utc)
        self.publisher.docs[self.publisher.base + '/wallets/wk']['updatedAt'] = timestamp
        self.assertEqual(self.run_processor()['posted'], 1)
        bundle = Path(self.store.get(self.record['id'])['result']['backup_path'])
        document = json.loads((bundle / 'cloud-before.json').read_text())
        self.assertEqual(document['wallets']['wk']['updatedAt'], {'__timestamp__': timestamp.isoformat()})

    def test_resume_rejects_changed_financial_payload_even_with_matching_provenance(self):
        self.fixture()
        original = self.publisher.apply
        def unavailable(payload):
            raise TimeoutError('before cloud commit')
        self.publisher.apply = unavailable
        self.assertEqual(self.run_processor()['deferred'], 1)
        eid = self.store.get(self.record['id'])['event_id']
        with closing(sqlite3.connect(self.config['db_path'])) as db, db:
            payload = json.loads(db.execute('SELECT payload FROM outbox WHERE event_id=?', (eid,)).fetchone()[0])
            payload['components'][0]['amount'] = 20000
            for movement in payload['movements']:
                movement['delta'] *= 2
            db.execute('UPDATE outbox SET payload=?,next_attempt=0 WHERE event_id=?', (mesh.dumps(payload), eid))
        self.publisher.apply = original
        self.assertEqual(self.run_processor()['blocked'], 1)
        self.assertEqual(self.publisher.calls, [])
        self.assertEqual(self.publisher.docs[self.publisher.base + '/wallets/wk']['balance'], 50000)

    def test_unrelated_missing_cloud_wallet_is_not_read_created_or_repaired(self):
        self.fixture(unrelated_missing=True)
        skipped = self.publisher.base + '/wallets/skip-unrelated-wallet'
        del self.publisher.docs[skipped]
        original = self.publisher.read_document
        def scoped_read(path):
            self.assertNotEqual(path, skipped, 'unrelated wallet must not be consulted')
            return original(path)
        self.publisher.read_document = scoped_read
        before = {table: self.ledger_rows(table) for table in ('registry', 'checkpoints')}
        self.assertEqual(self.run_processor()['posted'], 1)
        self.assertNotIn(skipped, self.publisher.docs)
        for table, rows in before.items():
            self.assertEqual(self.ledger_rows(table), rows)

    def test_rejected_receipt_never_opens_publisher_or_ledger(self):
        import financial_review_apply as apply
        store = StoreStub(self.config, [{'id': 'receipt', 'state': 'rejected'}])
        result = apply.process_reviews(self.config, store,
            publisher_factory=lambda c: self.fail('publisher opened for reject'))
        self.assertEqual(result, dict(processed=0, posted=0, deferred=0, blocked=0))
        self.assertFalse(Path(self.config['db_path']).exists())


if __name__ == '__main__':
    unittest.main()
