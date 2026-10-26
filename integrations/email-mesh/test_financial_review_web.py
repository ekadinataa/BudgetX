"""Offline synthetic fixtures only. Never load runtime config or credentials."""
import copy
import importlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(os.environ.get('MESH_SOURCE', str(Path(__file__).resolve().parent))).resolve()
sys.dont_write_bytecode = True
sys.path.insert(0, str(SOURCE))
import mesh
import financial_review
import financial_review_apply
sys.path.insert(0, str(Path(__file__).parent))


def configuration(root) -> dict:
    return dict(project_id=mesh.PROJECT, uid=mesh.UID, email=mesh.EMAIL,
                account_id='akun-1', mailbox_email='synthetic@example.invalid',
                checkpoint_at='2026-10-07T00:00:00+00:00',
                db_path=str(root / 'ledger.sqlite3'), publish_enabled=False,
                financial_review_enabled=True, financial_review_web_enabled=True,
                financial_review_admin_chat_id='790484718',
                financial_review_admin_user_ids=['790484718'],
                financial_review_state_path=str(root / 'reviews.sqlite3'),
                sender_allowlist={'bank@example.invalid': 'SyntheticBank'},
                registry={'wallets': {'bank': {'id': 'wb', 'name': 'Bank'},
                                      'savings': {'id': 'ws', 'name': 'Savings'}}, 'aliases': {}},
                categories=[])


def parsed(**changes):
    result = dict(is_transaction=True, eligible=False, event_type='transfer', status='success',
                  source_wallet='bank', destination_wallet='UNRESOLVED', amount=100000,
                  currency='IDR', fee_displayed=0, fee_paid=0, total_debit=100000,
                  total_credit=100000, reference='SYNTHETIC-1', facility=None,
                  notification_at='2026-10-07T00:30:00+00:00',
                  validation_errors=['unresolved_destination'],
                  raw_fields={'from': 'bank@example.invalid'}, provenance={})
    result.update(changes)
    return result


def raw():
    return dict(account_id='akun-1', gmail_message_id='synthetic-1', provider='SyntheticBank',
                date='Wed, 07 Oct 2026 07:30:00 +0700', **{'from': 'bank@example.invalid'},
                body_normalized='OFFLINE SYNTHETIC RECEIPT ONLY')


class FakePublisher:
    """Trusted-code adapter, never an SDK client; only in-memory documents."""
    def __init__(self, config):
        self.config = config
        self.docs = {}
        self.calls = []
        self.applies = []
        self.identity = {k: config[k] for k in ('project_id', 'uid', 'email')}

    def verify_target(self, config):
        self.calls.append(('verify', None))
        return self.identity

    def read_document(self, path):
        self.calls.append(('read', path))
        return copy.deepcopy(self.docs.get(path))

    def write_document(self, path, body):
        self.calls.append(('write', path))
        self.docs[path] = copy.deepcopy(body)

    def apply(self, payload):
        self.applies.append(copy.deepcopy(payload))
        base = 'users/' + self.config['uid']
        marker = {k: payload[k] for k in ('scope', 'event_id', 'checkpoint_at', 'parsed', 'evidence')}
        marker['effect_hash'] = mesh.digest({k: payload[k] for k in ('scope', 'event_id', 'movements', 'checkpoint_at')})
        self.docs[base + '/mesh_events/demo-' + payload['event_id']] = marker
        for i, component in enumerate(payload['components']):
            self.docs[base + '/transactions/demo-mesh-' + payload['event_id'] + '-' + str(i)] = copy.deepcopy(component)


class WebTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cfg = configuration(self.root)
        self.addCleanup(patch.stopall)
        patch.object(socket, 'create_connection', side_effect=AssertionError('network forbidden')).start()
        patch.object(socket.socket, 'connect', side_effect=AssertionError('network forbidden')).start()
        patch.object(subprocess, 'Popen', side_effect=AssertionError('subprocess forbidden')).start()
        patch.object(financial_review_apply, 'default_publisher', side_effect=AssertionError('live publisher forbidden')).start()
        self.web = importlib.import_module('financial_review_web')

    def fixture(self, p=None):
        self.p = p if p is not None else parsed()
        with mesh.Engine(self.cfg, parser=lambda row, registry: copy.deepcopy(self.p)) as engine:
            engine.ingest([raw()])
            with self.web.WebReviewStore(self.cfg) as store:
                store.discover(engine.db)
                return store.rows()[0]

    def payload(self, record, **changes):
        body = dict(schemaVersion=1, uid=self.cfg['uid'], reviewId=record['id'],
                    version=record['version'], action='transfer', source='bank',
                    destination='savings', createdAt='2026-10-07T01:00:00.000Z')
        body.update(changes)
        return body

    def decide(self, store, record, **changes):
        return store.decide_web(self.payload(record, **changes),
                                request_id=record['id'] + '--' + record['version'])

    def test_missing_bridge_is_explicit_failure(self):
        self.assertTrue(hasattr(self.web, 'WebReviewStore'), 'web decision bridge is not implemented')

    def test_decision_uses_canonical_store_without_money_effects(self):
        r = self.fixture()
        before = Path(self.cfg['db_path']).read_bytes()
        with self.web.WebReviewStore(self.cfg) as store:
            approved = self.decide(store, r)
            self.assertEqual(approved['state'], 'approved')
            self.assertEqual(approved['decision']['actor'], {'platform': 'firebase', 'uid': mesh.UID})
            self.assertEqual(store.db.execute('SELECT platform,chat_id,message_id FROM commands').fetchone()[:],
                             ('firebase', mesh.UID, r['id'] + '--' + r['version']))
            self.assertEqual(store.db.execute("SELECT COUNT(*) FROM audit WHERE event='decision'").fetchone()[0], 1)
            self.assertEqual(self.decide(store, r)['decision'], approved['decision'])
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM commands').fetchone()[0], 1)
        self.assertEqual(Path(self.cfg['db_path']).read_bytes(), before)


    def test_sync_uses_only_current_sqlite_id_redacts_and_ignores_forged_mirror(self):
        r = self.fixture()
        pub = FakePublisher(self.cfg)
        base = 'users/' + mesh.UID
        mirror_path = base + '/financialReviews/' + r['id']
        decision_path = base + '/financialReviewDecisions/' + r['id'] + '--' + r['version']
        pub.docs[mirror_path] = {'amount': 1, 'version': 'forged', 'raw': 'SECRET'}
        pub.docs[decision_path] = self.payload(r)
        pub.docs['users/OTHER/financialReviewDecisions/forged'] = self.payload(r, uid='OTHER')
        before = Path(self.cfg['db_path']).read_bytes()
        with self.web.WebReviewStore(self.cfg) as store:
            result = self.web.sync_web_reviews(self.cfg, store, publisher=pub)
            self.assertEqual(result['accepted'], 1)
            body = pub.docs[mirror_path]
            self.assertEqual(body['amount'], 100000)
            self.assertEqual(body['fee'], 0)
            self.assertEqual(body['provider'], 'SyntheticBank')
            self.assertEqual(body['state'], 'approved')
            self.assertIs(body.get('webDecisionAccepted'), True)
            self.assertEqual(body['choices'], [])
            self.assertEqual(set(body), {'schemaVersion', 'id', 'version', 'kind', 'state', 'amount',
                'fee', 'currency', 'occurredAt', 'provider', 'reason', 'error', 'source', 'destination',
                'choices', 'walletOptions', 'event_id', 'updatedAt', 'totalCredit', 'webDecisionAccepted'})
            self.assertNotIn('SECRET', json.dumps(body))
            self.assertEqual(pub.calls[0], ('verify', None))
            self.assertTrue(all(path.startswith(base + '/') for kind, path in pub.calls if path))
            self.assertFalse(pub.applies)
            repeated = self.web.sync_web_reviews(self.cfg, store, publisher=pub)
            self.assertEqual((repeated['accepted'], repeated['replayed'], repeated['rejected']), (0, 1, 0))
        self.assertEqual(Path(self.cfg['db_path']).read_bytes(), before)

    def test_mirror_preserves_canonical_net_received_principal(self):
        record = self.fixture(parsed(amount=100000, fee_paid=2500, total_debit=100000, total_credit=97500))
        body = self.web.review_mirror(self.cfg, record)
        self.assertEqual(body.get('totalCredit'), 97500)
        self.assertEqual(body['amount'], 100000)
        self.assertIn(dict(action='transfer', source='bank', destination='savings'), body['choices'])

    def test_mirror_accepted_flag_suppresses_choices_including_pending_and_blocked(self):
        r = self.fixture()
        self.assertIs(self.web.review_mirror(self.cfg, r).get('webDecisionAccepted'), False)
        for state in ('pending', 'blocked', 'rejected'):
            with self.subTest(state=state):
                body = self.web.review_mirror(self.cfg, dict(r, state=state), web_decision_accepted=True)
                self.assertIs(body.get('webDecisionAccepted'), True)
                self.assertEqual(body['choices'], [])

    def test_sync_accepted_flag_uses_exact_canonical_firebase_command_not_cloud_body(self):
        r = self.fixture()
        pub = FakePublisher(self.cfg)
        base = 'users/' + mesh.UID
        mirror_path = base + '/financialReviews/' + r['id']
        request_id = r['id'] + '--' + r['version']
        decision_path = base + '/financialReviewDecisions/' + request_id
        pub.docs[mirror_path] = {'webDecisionAccepted': True}
        pub.docs[decision_path] = self.payload(r, action='retry', source=None, destination=None)
        with self.web.WebReviewStore(self.cfg) as store:
            counts = self.web.sync_web_reviews(self.cfg, store, publisher=pub)
            self.assertEqual(counts['rejected'], 1)
            self.assertIs(pub.docs[mirror_path].get('webDecisionAccepted'), False)
            self.assertTrue(pub.docs[mirror_path]['choices'])
            command = [store.scope, 'firebase', self.cfg['uid'], request_id, r['id'], r['version'], '{}']
            # Every namespace/path component must match, not merely review/version.
            for index, wrong in enumerate(('OTHER', 'telegram', 'OTHER', 'arbitrary', 'a' * 64, 'b' * 16)):
                with self.subTest(index=index):
                    altered = command[:]
                    altered[index] = wrong
                    store.db.execute('INSERT INTO commands VALUES(?,?,?,?,?,?,?)', altered)
                    store.db.commit()
                    self.web.sync_web_reviews(self.cfg, store, publisher=pub, consume=False)
                    self.assertIs(pub.docs[mirror_path].get('webDecisionAccepted'), False)
                    store.db.execute('DELETE FROM commands')
                    store.db.commit()
            # Missing cloud decision does not erase an accepted local command.
            del pub.docs[decision_path]
            self.decide(store, r, action='reject', source=None, destination=None)
            accepted_decision = store.get(r['id'])['decision']
            for state in ('rejected', 'blocked', 'pending'):
                with self.subTest(state=state):
                    store.db.execute('UPDATE reviews SET state=? WHERE id=?', (state, r['id']))
                    store.db.commit()
                    self.web.sync_web_reviews(self.cfg, store, publisher=pub, consume=False)
                    self.assertIs(pub.docs[mirror_path].get('webDecisionAccepted'), True)
                    self.assertEqual(pub.docs[mirror_path]['choices'], [])
                    # Replay of the original reject remains harmless; changed choices do not.
                    self.assertEqual(self.decide(store, r, action='reject', source=None, destination=None)['decision'], accepted_decision)
                    before = list(store.db.iterdump())
                    with self.assertRaises(ValueError):
                        self.decide(store, r)
                    self.assertEqual(list(store.db.iterdump()), before)

    def test_pending_mirror_choices_use_canonical_endpoint_safety(self):
        r = self.fixture(parsed(fee_displayed=2500, fee_paid=0))
        body = self.web.review_mirror(self.cfg, r)
        self.assertEqual(body['fee'], 0, 'displayed fee is not the fee actually paid')
        self.assertEqual(body['choices'], [{'action': 'transfer', 'source': 'bank', 'destination': 'savings'},
                                          {'action': 'expense', 'source': 'bank', 'destination': 'EXTERNAL'}])
        self.assertEqual(body['walletOptions'], [{'key': 'bank', 'walletId': 'wb', 'name': 'Bank'},
                                               {'key': 'savings', 'walletId': 'ws', 'name': 'Savings'}])
        for changes in ({'amount': None}, {'status': 'failed'}, {'fee_paid': None, 'fee_displayed': 2000},
                        {'amount': True}, {'total_debit': 999}):
            with self.subTest(changes=changes):
                invalid = dict(r, parsed=dict(r['parsed'], **changes))
                self.assertEqual(self.web.review_mirror(self.cfg, invalid)['choices'], [])


    def test_hook_ingests_before_canonical_processor_and_notifies_after_publication_error(self):
        r = self.fixture()
        self.cfg['publish_enabled'] = True
        pub = FakePublisher(self.cfg)
        pub.docs['users/' + mesh.UID + '/financialReviewDecisions/' + r['id'] + '--' + r['version']] = self.payload(r)
        calls = []
        def processor(config, store, limit):
            calls.append(('process', store.get(r['id'])['state']))
            raise RuntimeError('SECRET provider traceback must not leak')
        def notifier(config, store, limit):
            calls.append(('notify', store.get(r['id'])['state']))
            return {'failed': 0}
        result = self.web.run_web_review_hook(self.cfg, publisher_factory=lambda config: pub,
                                              processor=processor, notifier=notifier)
        self.assertEqual(calls, [('process', 'approved'), ('notify', 'approved')])
        self.assertEqual(result['publication_error'], 'RuntimeError')
        self.assertEqual(result['web_error'], '')
        self.assertEqual(result['web']['accepted'], 1)
        self.assertNotIn('SECRET', json.dumps(result))


    def test_payload_exact_fields_uid_types_timestamp_and_ids_fail_closed(self):
        r = self.fixture()
        mutations = [{'uid': 'OTHER'}, {'schemaVersion': True}, {'schemaVersion': 2},
                     {'reviewId': r['id'].upper()}, {'version': r['version'] + '0'},
                     {'createdAt': '2026-10-07'}, {'createdAt': '2026-10-07T01:00:00'},
                     {'createdAt': '2026-02-30T00:00:00Z'}, {'createdAt': 123},
                     {'action': 'force'}, {'source': []}, {'destination': {}},
                     {'amount': 100}, {'actor': {'platform': 'telegram'}}]
        with self.web.WebReviewStore(self.cfg) as store:
            for changes in mutations:
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    self.decide(store, r, **changes)
            body = self.payload(r)
            del body['source']
            with self.assertRaises(ValueError):
                store.decide_web(body, request_id=r['id'] + '--' + r['version'])
            with self.assertRaises(ValueError):
                store.decide_web(self.payload(r), request_id='arbitrary')
            self.assertEqual(store.get(r['id'])['state'], 'pending')
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM commands').fetchone()[0], 0)

    def test_known_endpoint_remap_is_rejected(self):
        r = self.fixture()
        with self.web.WebReviewStore(self.cfg) as store:
            with self.assertRaisesRegex(ValueError, 'known_endpoint_remap'):
                self.decide(store, r, source='savings', destination='bank')
            self.assertEqual(store.get(r['id'])['state'], 'pending')

    def test_replay_survives_posted_state_but_conflicting_payload_is_rejected(self):
        r = self.fixture()
        with self.web.WebReviewStore(self.cfg) as store:
            self.decide(store, r)
            store.transition(r['id'], 'approved', 'posted', event_id='a' * 64)
            self.assertEqual(self.decide(store, r)['state'], 'posted')
            for changes in ({'createdAt': '2026-10-07T02:00:00Z'},
                            {'action': 'reject', 'source': None, 'destination': None}):
                with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, 'replay_conflict'):
                    self.decide(store, r, **changes)
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM commands').fetchone()[0], 1)

    def test_changed_evidence_makes_old_decision_stale_and_immutable_document_untouched(self):
        r = self.fixture()
        pub = FakePublisher(self.cfg)
        path = 'users/' + mesh.UID + '/financialReviewDecisions/' + r['id'] + '--' + r['version']
        pub.docs[path] = self.payload(r)
        self.fixture(parsed(amount=200000, total_debit=200000, total_credit=200000))
        # Engine deduplicates candidates; explicitly model an upstream reparse.
        import sqlite3
        with sqlite3.connect(self.cfg['db_path']) as db:
            db.execute('UPDATE candidates SET parsed=?', (mesh.dumps(parsed(amount=200000, total_debit=200000, total_credit=200000)),))
        with self.web.WebReviewStore(self.cfg) as store:
            with sqlite3.connect(self.cfg['db_path']) as db:
                db.row_factory = sqlite3.Row
                store.discover(db)
            self.assertNotEqual(store.get(r['id'])['version'], r['version'])
            with self.assertRaisesRegex(ValueError, 'stale'):
                self.decide(store, r)
            result = self.web.sync_web_reviews(self.cfg, store, publisher=pub)
            self.assertEqual(result['accepted'], 0)
            self.assertEqual(store.get(r['id'])['state'], 'pending')
        self.assertEqual(pub.docs[path], self.payload(r))
        self.assertNotIn(('read', path), pub.calls)

    def test_web_retry_is_refused_before_state_and_replay_without_db_effects(self):
        r = self.fixture()
        ledger_before = Path(self.cfg['db_path']).read_bytes()
        with self.web.WebReviewStore(self.cfg) as store:
            request_id = r['id'] + '--' + r['version']
            payload = self.payload(r, action='retry', source=None, destination=None)
            decision = dict(action='retry', source=None, destination=None,
                            actor=dict(platform='firebase', uid=self.cfg['uid']),
                            message_id=request_id, createdAt=payload['createdAt'])
            before = list(store.db.iterdump())
            with patch.object(store, '_atomic', side_effect=AssertionError('retry reached state/replay gates')):
                with self.assertRaisesRegex(ValueError, 'invalid_web_action'):
                    store.decide_web(payload, request_id=request_id)
            self.assertEqual(list(store.db.iterdump()), before)
            # Model an old accepted retry: even identical legacy replay is forbidden.
            store.db.execute('INSERT INTO commands VALUES(?,?,?,?,?,?,?)',
                (store.scope, 'firebase', self.cfg['uid'], request_id, r['id'], r['version'], mesh.dumps(decision)))
            store.db.commit()
            for state in ('pending', 'blocked', 'approved', 'prepared', 'posted', 'rejected', 'resolved', 'unknown'):
                with self.subTest(state=state):
                    store.db.execute('UPDATE reviews SET state=? WHERE id=?', (state, r['id']))
                    store.db.commit()
                    before = list(store.db.iterdump())
                    with self.assertRaisesRegex(ValueError, 'invalid_web_action'):
                        store.decide_web(payload, request_id=request_id)
                    self.assertEqual(list(store.db.iterdump()), before)
        self.assertEqual(Path(self.cfg['db_path']).read_bytes(), ledger_before)

    def test_blocked_reject_requires_no_bound_event_or_accepted_decision(self):
        r = self.fixture()
        with self.web.WebReviewStore(self.cfg) as store:
            store.transition(r['id'], 'pending', 'blocked')
            result = self.decide(store, r, action='reject', source=None, destination=None)
            self.assertEqual(result['state'], 'rejected')
        self.cfg['financial_review_state_path'] = str(self.root / 'bound.sqlite3')
        r = self.fixture()
        with self.web.WebReviewStore(self.cfg) as store:
            store.transition(r['id'], 'pending', 'blocked', event_id='a' * 64)
            for action in ('retry', 'reject', 'transfer'):
                with self.subTest(action=action), self.assertRaises(ValueError):
                    self.decide(store, r, action=action, source=None, destination=None)

    def test_browser_cannot_replace_a_telegram_decision_after_blocking_or_rejection(self):
        r = self.fixture()
        actor = dict(platform='telegram', chat_id='790484718', user_id='790484718', is_bot=False, chat_type='dm')
        with self.web.WebReviewStore(self.cfg) as store:
            store.decide(r['id'], r['version'], 'transfer', source='bank', destination='savings',
                         actor=actor, message_id='123')
            for state in ('blocked', 'rejected', 'pending'):
                with self.subTest(state=state):
                    store.db.execute('UPDATE reviews SET state=? WHERE id=?', (state, r['id']))
                    store.db.commit()
                    before = list(store.db.iterdump())
                    with self.assertRaisesRegex(ValueError, 'decision_state_conflict'):
                        self.decide(store, r, action='reject', source=None, destination=None)
                    self.assertEqual(list(store.db.iterdump()), before)

    def test_reject_has_no_financial_mutation_even_when_processor_runs(self):
        r = self.fixture()
        self.cfg['publish_enabled'] = True
        before = Path(self.cfg['db_path']).read_bytes()
        pub = FakePublisher(self.cfg)
        with self.web.WebReviewStore(self.cfg) as store:
            self.decide(store, r, action='reject', source=None, destination=None)
            counts = financial_review_apply.process_reviews(self.cfg, store, publisher_factory=lambda config: pub)
            self.assertEqual(counts['processed'], 0)
        self.assertEqual(pub.calls, [])
        self.assertEqual(pub.applies, [])
        self.assertEqual(Path(self.cfg['db_path']).read_bytes(), before)

    def test_no_optin_means_no_factory_or_document_access(self):
        for value in (None, False, 'true', 1):
            with self.subTest(value=value):
                cfg = dict(self.cfg)
                if value is None:
                    cfg.pop('financial_review_web_enabled')
                else:
                    cfg['financial_review_web_enabled'] = value
                result = self.web.sync_web_reviews(cfg, None, publisher_factory=lambda config: self.fail('factory called'))
                self.assertFalse(result['enabled'])
                self.assertEqual(result['mirrored'], 0)
        self.assertFalse(Path(self.cfg['financial_review_state_path']).exists())

    def test_project_uid_email_mismatch_prevents_all_document_access(self):
        self.fixture()
        for field in ('project_id', 'uid', 'email'):
            with self.subTest(field=field), self.web.WebReviewStore(self.cfg) as store:
                pub = FakePublisher(self.cfg)
                pub.identity[field] = 'WRONG'
                with self.assertRaisesRegex(ValueError, 'identity_mismatch'):
                    self.web.sync_web_reviews(self.cfg, store, publisher=pub)
                self.assertEqual(pub.calls, [('verify', None)])
        cfg = dict(self.cfg, uid='OTHER')
        with self.assertRaises(ValueError):
            self.web.WebReviewStore(cfg)

    def test_malformed_current_decision_retained_without_acceptance(self):
        r = self.fixture()
        pub = FakePublisher(self.cfg)
        path = 'users/' + mesh.UID + '/financialReviewDecisions/' + r['id'] + '--' + r['version']
        for changes in ({'reviewId': 'a' * 64}, {'uid': 'OTHER'}, {'amount': 7}, {'version': 'b' * 16}):
            with self.subTest(changes=changes), self.web.WebReviewStore(self.cfg) as store:
                pub.docs[path] = self.payload(r, **changes)
                before = copy.deepcopy(pub.docs[path])
                counts = self.web.sync_web_reviews(self.cfg, store, publisher=pub)
                self.assertEqual(counts['rejected'], 1)
                self.assertEqual(store.get(r['id'])['state'], 'pending')
                self.assertEqual(pub.docs[path], before)

    def test_mirror_never_exposes_evidence_identities_results_or_diagnostics(self):
        r = self.fixture()
        p = dict(r['parsed'], note='SECRET', raw_fields={'from': 'bank@example.invalid', 'body': 'SECRET'},
                 provenance={'account_id': 'SECRET'}, destination_identity='123456789012')
        r.update(parsed=p, result={'backup_path': '/SECRET', 'anything': 'SECRET'},
                 error='SECRET /private/path', account='SECRET', message='SECRET')
        self.cfg['registry']['wallets']['bank']['name'] = 'Bank 123456789012 private@example.invalid'
        body = self.web.review_mirror(self.cfg, r)
        serialized = json.dumps(body)
        for private in ('SECRET', '/private/path', '123456789012', 'private@example.invalid', 'account_id', 'raw_fields'):
            self.assertNotIn(private, serialized)
        self.assertIsNone(body['error'])
        r['kind'] = 'delivery'
        self.assertEqual(self.web.review_mirror(self.cfg, r)['choices'], [])

    def test_income_choice_and_nullable_fee_are_not_guessed(self):
        r = self.fixture(parsed(event_type='income', source_wallet='EXTERNAL', destination_wallet='UNRESOLVED',
                                total_debit=None, fee_paid=None, fee_displayed=None))
        body = self.web.review_mirror(self.cfg, r)
        self.assertIsNone(body['fee'])
        self.assertEqual(body['choices'], [{'action': 'income', 'source': 'EXTERNAL', 'destination': k}
                                          for k in ('bank', 'savings')])
        with self.web.WebReviewStore(self.cfg) as store:
            approved = self.decide(store, r, action='income', source='EXTERNAL')
            self.assertEqual(approved['state'], 'approved')

    def test_web_telegram_concurrent_decisions_have_one_winner(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        r = self.fixture()
        barrier = Barrier(2)
        actor = dict(platform='telegram', chat_id='790484718', user_id='790484718', is_bot=False, chat_type='dm')
        def decide(platform):
            with self.web.WebReviewStore(self.cfg) as store:
                barrier.wait(timeout=5)
                try:
                    if platform == 'web':
                        self.decide(store, r)
                    else:
                        store.decide(r['id'], r['version'], 'reject', actor=actor, message_id='123')
                    return 'accepted'
                except ValueError:
                    return 'conflict'
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(decide, ('web', 'telegram')))
        self.assertEqual(sorted(results), ['accepted', 'conflict'])
        with self.web.WebReviewStore(self.cfg) as store:
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM commands').fetchone()[0], 1)
            self.assertEqual(store.db.execute("SELECT COUNT(*) FROM audit WHERE event='decision'").fetchone()[0], 1)

    def test_real_canonical_processor_consumes_firebase_actor_and_posts_once_offline(self):
        import mesh_parser
        evidence = dict(raw(), subject='Transfer Berhasil', **{'from': 'test@krom.id'},
                        body_normalized='Transaksi telah berhasil\nDari: Synthetic unknown\nKe: Unknown • 111222333\nJumlah: Rp100.000')
        with mesh.Engine(self.cfg) as engine:
            engine.ingest([evidence])
            with self.web.WebReviewStore(self.cfg) as store:
                store.discover(engine.db)
                r = store.rows()[0]
        self.assertEqual(r['parsed'], mesh_parser.parse_email(evidence, self.cfg['registry']))
        self.assertEqual(r['parsed']['amount'], 100000)
        self.cfg['publish_enabled'] = True
        pub = FakePublisher(self.cfg)
        base = 'users/' + mesh.UID
        pub.docs[base + '/mesh_state/demo-checkpoint'] = dict(checkpoint_at=self.cfg['checkpoint_at'], scope=mesh.PROJECT + ':' + mesh.UID)
        pub.docs[base + '/wallets/wb'] = {'name': 'Bank'}
        pub.docs[base + '/wallets/ws'] = {'name': 'Savings'}
        with self.web.WebReviewStore(self.cfg) as store:
            self.decide(store, r)
            counts = financial_review_apply.process_reviews(self.cfg, store, publisher_factory=lambda config: pub)
            self.assertEqual(counts, dict(processed=1, posted=1, blocked=0, deferred=0))
            self.assertEqual(store.get(r['id'])['state'], 'posted')
            self.assertEqual(self.decide(store, r)['state'], 'posted')
            again = financial_review_apply.process_reviews(self.cfg, store, publisher_factory=lambda config: pub)
            self.assertEqual(again['processed'], 0)
        self.assertEqual(len(pub.applies), 1)
        self.assertEqual(pub.applies[0]['movements'], [{'wallet': 'wb', 'field': 'balance', 'delta': -100000},
                                                     {'wallet': 'ws', 'field': 'balance', 'delta': 100000}])
        import sqlite3
        with sqlite3.connect(self.cfg['db_path']) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM events').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT state FROM outbox').fetchone()[0], 'sent')

    def test_mirror_readback_failure_is_not_success(self):
        self.fixture()
        pub = FakePublisher(self.cfg)
        pub.write_document = lambda path, body: None
        with self.web.WebReviewStore(self.cfg) as store, self.assertRaisesRegex(ValueError, 'readback_mismatch'):
            self.web.sync_web_reviews(self.cfg, store, publisher=pub)

    def test_hook_web_error_still_preserves_notifier_and_discovery(self):
        r = self.fixture()
        pub = FakePublisher(self.cfg)
        pub.identity['uid'] = 'OTHER'
        noticed = []
        result = self.web.run_web_review_hook(self.cfg, publisher_factory=lambda config: pub,
            allow_publication=False, notifier=lambda config, store, limit: noticed.append(store.get(r['id'])['state']) or {'failed': 1})
        self.assertEqual(noticed, ['pending'])
        self.assertEqual(result['web_error'], 'ReviewBlocked')
        self.assertEqual(result['notification_error'], 'FinancialReviewNotificationDeferred')
        self.assertEqual(result['discovered'], {'created': 0, 'updated': 0, 'resolved': 0})
        self.assertTrue(all(kind == 'verify' for kind, path in pub.calls))


    def test_noncanonical_timezone_offset_is_not_silently_normalized(self):
        r = self.fixture()
        with self.web.WebReviewStore(self.cfg) as store:
            with self.assertRaisesRegex(ValueError, 'invalid_created_at'):
                self.decide(store, r, createdAt='2026-10-07T01:00:00+00:60')


    def test_sdk_shaped_transport_uses_full_replace_and_verifies_before_document_access(self):
        from types import SimpleNamespace
        r = self.fixture()
        memory = FakePublisher(self.cfg)
        class Reference:
            def __init__(self, path):
                self.path = path
            def get(self):
                body = memory.read_document(self.path)
                return SimpleNamespace(exists=body is not None, to_dict=lambda: body)
            def set(self, body, *, merge):
                self_outer.assertIs(merge, False)
                memory.write_document(self.path, body)
        def document(path):
            self.assertTrue(memory.calls and memory.calls[0][0] == 'verify')
            return Reference(path)
        self_outer = self
        sdk = SimpleNamespace(verify_target=memory.verify_target, db=SimpleNamespace(document=document))
        with self.web.WebReviewStore(self.cfg) as store:
            counts = self.web.sync_web_reviews(self.cfg, store, publisher=sdk)
        self.assertEqual(counts['mirrored'], 1)
        self.assertEqual(memory.docs['users/' + mesh.UID + '/financialReviews/' + r['id']]['state'], 'pending')

    def test_unverified_adapter_and_store_scope_mismatch_fail_before_document_access(self):
        from types import SimpleNamespace
        self.fixture()
        with self.web.WebReviewStore(self.cfg) as store:
            with self.assertRaisesRegex(ValueError, 'auth_verifier_required'):
                self.web.sync_web_reviews(self.cfg, store, publisher=SimpleNamespace())
            pub = FakePublisher(self.cfg)
            cfg = copy.deepcopy(self.cfg)
            cfg['registry']['wallets']['bank']['id'] = 'changed'
            with self.assertRaisesRegex(ValueError, 'scope_mismatch'):
                self.web.sync_web_reviews(cfg, store, publisher=pub)
            self.assertEqual(pub.calls, [])

    def test_decide_requires_separate_web_optin_and_receipt_kind(self):
        r = self.fixture()
        with self.web.WebReviewStore(self.cfg) as store:
            self.cfg['financial_review_web_enabled'] = False
            with self.assertRaisesRegex(ValueError, 'explicitly_enabled'):
                self.decide(store, r)
            self.cfg['financial_review_web_enabled'] = True
            store.db.execute("UPDATE reviews SET kind='delivery' WHERE id=?", (r['id'],))
            store.db.commit()
            with self.assertRaisesRegex(ValueError, 'unavailable'):
                self.decide(store, r)

    def test_changed_raw_evidence_blocks_canonical_processor_without_financial_effect(self):
        import sqlite3
        r = self.fixture()
        self.cfg['publish_enabled'] = True
        with sqlite3.connect(self.cfg['db_path']) as db:
            db.execute('UPDATE evidence SET raw=?', (mesh.dumps(dict(raw(), body_normalized='CHANGED')),))
        pub = FakePublisher(self.cfg)
        with self.web.WebReviewStore(self.cfg) as store:
            self.decide(store, r)
            counts = financial_review_apply.process_reviews(self.cfg, store, publisher_factory=lambda config: pub)
            self.assertEqual(counts['blocked'], 1)
            self.assertEqual(store.get(r['id'])['error'], 'receipt_raw_changed')
        self.assertEqual(pub.applies, [])
        with sqlite3.connect(self.cfg['db_path']) as db:
            for table in ('events', 'movements', 'outbox'):
                self.assertEqual(db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0], 0)

    def test_disabled_wrapper_preserves_existing_telegram_hook_without_web_access(self):
        self.fixture()
        self.cfg['financial_review_web_enabled'] = False
        calls = []
        result = self.web.run_web_review_hook(self.cfg,
            publisher_factory=lambda config: self.fail('web publisher constructed'),
            notifier=lambda config, store, limit: calls.append(type(store)) or {'failed': 0})
        self.assertEqual(calls, [financial_review.ReviewStore])
        self.assertNotIn('web', result)
        self.assertEqual(result['pending'], 1)

    def test_simultaneous_identical_web_decisions_are_idempotent(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        r = self.fixture()
        barrier = Barrier(2)
        def decide(_):
            with self.web.WebReviewStore(self.cfg) as store:
                barrier.wait(timeout=5)
                return self.decide(store, r)['state']
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(decide, range(2))), ['approved', 'approved'])
        with self.web.WebReviewStore(self.cfg) as store:
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM commands').fetchone()[0], 1)
            self.assertEqual(store.db.execute("SELECT COUNT(*) FROM audit WHERE event='decision'").fetchone()[0], 1)


if __name__ == '__main__':
    unittest.main()
