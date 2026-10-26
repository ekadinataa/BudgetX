"""Offline synthetic review workflow tests. Never calls Gmail/Firestore/Telegram."""
import copy
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import mesh
try:
    import financial_review as review
except ModuleNotFoundError:
    review = None


def configuration(root):
    return dict(project_id=mesh.PROJECT, uid=mesh.UID, email=mesh.EMAIL, account_id='akun-1',
                mailbox_email='synthetic@example.invalid', sender_allowlist={'synthetic@example.invalid': 'ANY'},
                checkpoint_at='2026-10-07T00:00:00+00:00', db_path=str(root / 'ledger.db'),
                destination_whitelist_path=str(root / 'whitelist.db'),
                registry={'wallets': {'bri': {'id': 'wb'}, 'jago': {'id': 'wj'}}, 'aliases': {}},
                financial_review_enabled=True, financial_review_state_path=str(root / 'review.db'),
                financial_review_admin_chat_id='790484718', financial_review_admin_user_ids=['790484718'])


def facts(**changes):
    p = dict(is_transaction=True, eligible=True, event_type='transfer', status='success',
             source_wallet='bri', destination_wallet='UNRESOLVED', amount=100000, currency='IDR',
             fee_paid=0, fee_displayed=0, total_debit=100000, total_credit=100000,
             notification_at='2026-10-07T00:30:00+00:00', validation_errors=[],
             destination_identity='SYNTHETIC LABEL', provider='OTHER')
    p.update(changes)
    return p


ACTOR = dict(platform='telegram', chat_id='790484718', user_id='790484718', is_bot=False, chat_type='dm')


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR'))
        self.addCleanup(self.temp.cleanup)
        self.config = configuration(Path(self.temp.name))
        self.scope = mesh.PROJECT + ':' + mesh.UID
        self.ledger = sqlite3.connect(':memory:')
        self.ledger.row_factory = sqlite3.Row
        self.ledger.executescript(mesh.SCHEMA)
        self.addCleanup(self.ledger.close)
        self.clock = [1000.0]

    def store(self):
        return review.ReviewStore(self.config, now=lambda: self.clock[0])

    def candidate(self, message='m1', reason='unresolved_endpoint', parsed=None, archive=0, event_id=None, account='akun-1', scope=None):
        raw = {'provider': 'OTHER', 'gmail_message_id': message, 'body_normalized': 'SYNTHETIC ONLY'}
        self.ledger.execute('INSERT OR REPLACE INTO evidence VALUES(?,?,?,?)', (account, message, mesh.dumps(raw), archive))
        self.ledger.execute('INSERT OR REPLACE INTO candidates VALUES(?,?,?,?,?,?)',
                            (scope or self.scope, account, message, mesh.dumps(parsed or facts()), reason, event_id))
        self.ledger.commit()
        return raw

    def test_discovers_all_providers_orphan_ready_and_not_excluded_or_other_namespace(self):
        self.assertIsNotNone(review, 'financial_review module is not implemented')
        self.candidate()
        self.candidate('ready-orphan', 'ready')
        for reason in ('archive', 'pre_checkpoint', 'not_transaction'):
            self.candidate(reason, reason)
        self.candidate('archived-flag', archive=1)
        self.candidate('old', parsed=facts(notification_at='2026-10-06T00:00:00+00:00'))
        self.candidate('foreign-account', account='akun-2')
        self.candidate('foreign-scope', scope='foreign')
        before = self.ledger.total_changes
        with self.store() as store:
            result = store.discover(self.ledger)
            rows = store.rows()
            self.assertEqual({r['message'] for r in rows}, {'m1', 'ready-orphan'})
            self.assertTrue(all(r['state'] == 'pending' and r['kind'] == 'receipt' for r in rows))
            self.assertEqual(result['created'], 2)
            self.assertEqual(store.discover(self.ledger)['created'], 0)
            self.assertEqual(self.ledger.total_changes, before)
            self.assertEqual(store.db.execute('PRAGMA synchronous').fetchone()[0], 2)
        self.assertEqual(Path(self.config['financial_review_state_path']).stat().st_mode & 0o777, 0o600)

    def test_revision_is_exact_and_invalidates_old_approval(self):
        raw = self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            first = store.rows()[0]
            self.assertEqual(first['fingerprint'], review.fingerprint(self.config, first['reason'], facts(), raw))
            self.assertEqual(first['raw_hash'], mesh.digest(raw))
            self.assertEqual(len(first['fingerprint']), 64)
            self.assertEqual(first['version'], first['fingerprint'][:16])
            store.db.execute("UPDATE reviews SET state='approved',decision='{}' WHERE id=?", (first['id'],))
            store.db.commit()
            self.candidate(parsed=facts(amount=200000))
            self.assertEqual(store.discover(self.ledger)['updated'], 1)
            changed = store.get(first['id'])
            self.assertEqual(changed['state'], 'pending')
            self.assertIsNone(changed['decision'])
            self.assertNotEqual(changed['version'], first['version'])
            for key in ('checkpoint_at', 'registry', 'email', 'account_id', 'uid', 'project_id'):
                altered = copy.deepcopy(self.config)
                altered[key] = {'wallets': {}} if key == 'registry' else 'different'
                self.assertNotEqual(review.fingerprint(altered, first['reason'], facts(), raw), first['fingerprint'])
            self.assertNotEqual(review.fingerprint(self.config, 'another', facts(), raw), first['fingerprint'])
            self.assertNotEqual(review.fingerprint(self.config, first['reason'], facts(), dict(raw, extra=True)), first['fingerprint'])

    def test_bound_unsent_is_informational_and_prepared_survives_binding(self):
        self.candidate('delivery', event_id='event-d')
        self.ledger.execute('INSERT INTO outbox(scope,event_id,payload,state) VALUES(?,?,?,?)', (self.scope, 'event-d', '{}', 'pending'))
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            items = {r['message']: r for r in store.rows()}
            self.assertEqual(items['delivery']['kind'], 'delivery')
            self.assertEqual(items['delivery']['event_id'], 'event-d')
            prepared = items['m1']
            store.db.execute("UPDATE reviews SET state='prepared',event_id='event-p',decision='{}' WHERE id=?", (prepared['id'],))
            store.db.commit()
            self.candidate(event_id='event-p', reason='ready', parsed=facts(destination_wallet='jago'))
            self.ledger.execute('INSERT INTO event_evidence VALUES(?,?,?,?)', (self.scope, 'event-p', 'akun-1', 'm1'))
            self.ledger.execute("UPDATE outbox SET state='sent'")
            store.discover(self.ledger)
            self.assertEqual(store.get(prepared['id'])['state'], 'prepared')
            self.assertEqual(store.get(prepared['id'])['version'], prepared['version'])
            self.assertEqual(store.get(items['delivery']['id'])['state'], 'resolved')

    def test_configuration_fails_closed_and_store_rejects_alias_paths(self):
        self.assertTrue(callable(getattr(review, 'validate_review_config', None)), 'configuration validator missing')
        review.validate_review_config(self.config)
        variants = [dict(financial_review_enabled=False), dict(financial_review_enabled=1),
                    dict(financial_review_admin_chat_id='foreign'), dict(financial_review_admin_user_ids=[]),
                    dict(financial_review_admin_user_ids=['foreign']), dict(email='other@example.invalid'),
                    dict(financial_review_state_path='relative.db'),
                    dict(financial_review_state_path=self.config['db_path']),
                    dict(financial_review_state_path=self.config['destination_whitelist_path'])]
        for changes in variants:
            with self.subTest(changes=changes), self.assertRaises((ValueError, TypeError)):
                with review.ReviewStore(dict(self.config, **changes)):
                    pass
        target = Path(self.temp.name) / 'target'
        target.write_text('DO NOT TOUCH')
        alias = Path(self.temp.name) / 'alias'
        alias.symlink_to(target)
        for p in (target, alias):
            bad = dict(self.config, financial_review_state_path=str(p), db_path=str(target))
            with self.assertRaises(ValueError):
                review.validate_review_config(bad)
        hard = Path(self.temp.name) / 'hard'
        os.link(target, hard)
        with self.assertRaises(ValueError):
            review.validate_review_config(dict(self.config, db_path=str(target), financial_review_state_path=str(hard)))
        self.assertEqual(target.read_text(), 'DO NOT TOUCH')

    def test_explicit_transfer_is_durable_replay_safe_and_cas_scoped(self):
        self.assertTrue(callable(getattr(review.ReviewStore, 'decide', None)), 'decision API missing')
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            item = store.rows()[0]
            approved = store.decide(item['id'], item['version'], 'transfer', 'bri', 'jago', actor=ACTOR, message_id='1')
            self.assertEqual(approved['state'], 'approved')
            self.assertEqual(approved['decision']['action'], 'transfer')
            self.assertEqual(approved['decision']['source'], 'bri')
            self.assertEqual(approved['decision']['destination'], 'jago')
            self.assertEqual(store.decide(item['id'], item['version'], 'transfer', 'bri', 'jago', actor=ACTOR, message_id='1'), approved)
            for kwargs in (dict(action='expense', source='bri'), dict(action='transfer', source='bri', destination='bri')):
                with self.assertRaises(ValueError):
                    store.decide(item['id'], item['version'], actor=ACTOR, message_id='1', **kwargs)
            with self.assertRaises(ValueError):
                store.decide(item['id'], 'stale', 'transfer', 'bri', 'jago', actor=ACTOR, message_id='2')
            prepared = store.transition(item['id'], ['approved'], 'prepared', event_id='event', result={'attempt': 1})
            self.assertEqual(prepared['event_id'], 'event')
            with self.assertRaises(ValueError):
                store.transition(item['id'], ['approved'], 'posted')
            posted = store.transition(item['id'], ['prepared'], 'posted')
            self.assertEqual(posted['result'], {'attempt': 1})
            self.assertEqual(posted['event_id'], 'event')
            self.assertEqual(posted['decision'], approved['decision'])
            with self.assertRaises(ValueError):
                store.transition('foreign', ['pending'], 'approved')
            self.assertGreaterEqual(store.db.execute('SELECT count(*) FROM audit').fetchone()[0], 3)
        with self.store() as store:
            self.assertEqual(store.get(item['id'])['state'], 'posted')

    def test_only_trusted_private_telegram_admin_and_exact_message_identity(self):
        self.candidate()
        self.candidate('other')
        with self.store() as store:
            store.discover(self.ledger)
            item, other = store.rows()
            bad_actors = [None, {}, dict(ACTOR, platform='discord'), dict(ACTOR, chat_id='other'),
                          dict(ACTOR, user_id='other'), dict(ACTOR, is_bot=True), dict(ACTOR, is_bot=0),
                          dict(ACTOR, chat_type='group'), dict(ACTOR, chat_type='channel'),
                          {k: v for k, v in ACTOR.items() if k != 'is_bot'}, dict(ACTOR, trusted=True)]
            for actor in bad_actors:
                with self.subTest(actor=actor), self.assertRaises(ValueError):
                    store.decide(item['id'], item['version'], 'retry', actor=actor, message_id='1')
            for mid in (None, '', 'body-claimed-id', True, 0, -1, '01', ' 1'):
                with self.subTest(mid=mid), self.assertRaises(ValueError):
                    store.decide(item['id'], item['version'], 'retry', actor=ACTOR, message_id=mid)
            done = store.decide(item['id'], item['version'], 'retry', actor=dict(ACTOR, chat_type='private'), message_id=1)
            self.assertEqual(done['decision']['actor'], ACTOR)
            with self.assertRaises(ValueError):
                store.decide(other['id'], other['version'], 'retry', actor=ACTOR, message_id='1')
            self.assertEqual(len(store.rows(states=['approved'])), 1)

    def test_unsafe_facts_cannot_be_forced_but_retry_reject_available(self):
        unsafe = [dict(amount=None), dict(amount=True), dict(amount=0), dict(currency='USD'),
                  dict(status='pending'), dict(notification_at='invalid'), dict(event_type='authorization_hold'),
                  dict(fee_paid=None, fee_displayed=2500), dict(fee_paid=-1), dict(total_debit=1),
                  dict(total_credit=1), dict(validation_errors=['unknown_template']),
                  dict(validation_errors=['unresolved_destination', 'conflicting_amount']),
                  dict(eligible=False), dict(is_transaction=False), dict(destination_wallet='jago')]
        with self.store() as store:
            for index, change in enumerate(unsafe):
                with self.subTest(change=change):
                    self.candidate('unsafe-' + str(index), parsed=facts(**change))
                    store.discover(self.ledger)
                    item = next(r for r in store.rows() if r['message'] == 'unsafe-' + str(index))
                    destination = 'bri' if change.get('destination_wallet') == 'jago' else 'jago'
                    with self.assertRaises(ValueError):
                        store.decide(item['id'], item['version'], 'transfer', 'bri', destination, actor=ACTOR, message_id=str(index + 10))
                    action = 'reject' if index % 2 else 'retry'
                    record = store.decide(item['id'], item['version'], action, actor=ACTOR, message_id=str(index + 100))
                    self.assertEqual(record['state'], 'rejected' if action == 'reject' else 'approved')
            self.candidate('conflict', reason='reference_conflict')
            store.discover(self.ledger)
            conflict = next(r for r in store.rows() if r['message'] == 'conflict')
            with self.assertRaises(ValueError):
                store.decide(conflict['id'], conflict['version'], 'transfer', 'bri', 'jago', actor=ACTOR, message_id='300')
            self.assertEqual(self.ledger.execute('SELECT count(*) FROM movements').fetchone()[0], 0)

    def test_expense_income_endpoint_resolution_and_no_general_alias_writes(self):
        cases = [('expense', facts(), 'bri', None),
                 ('income', facts(source_wallet='UNRESOLVED', destination_wallet='jago'), None, 'jago'),
                 ('transfer', facts(eligible=False, validation_errors=['unresolved_destination']), 'bri', 'jago')]
        with self.store() as store:
            for index, (action, parsed, source, destination) in enumerate(cases):
                self.candidate('safe-' + str(index), reason='ineligible', parsed=parsed)
                store.discover(self.ledger)
                item = next(r for r in store.rows() if r['message'] == 'safe-' + str(index))
                result = store.decide(item['id'], item['version'], action, source, destination, actor=ACTOR, message_id=str(index + 1))
                self.assertEqual(result['state'], 'approved')
                self.assertEqual(result['decision']['source'], 'EXTERNAL' if action == 'income' else source)
                self.assertEqual(result['decision']['destination'], 'EXTERNAL' if action == 'expense' else destination)
            self.assertEqual(self.ledger.execute('SELECT count(*) FROM aliases').fetchone()[0], 0)
            self.assertEqual(self.ledger.execute('SELECT count(*) FROM events').fetchone()[0], 0)
            self.assertEqual(store.rows(states=[]), [])

    def test_notices_are_per_receipt_revision_acknowledged_durable_and_reminded(self):
        self.assertTrue(callable(getattr(review, 'notify_reviews', None)), 'notifier missing')
        self.candidate()
        sent = []
        def send(text):
            sent.append(text)
            return {'success': True, 'message_id': str(len(sent)), 'platform': 'telegram', 'chat_id': '790484718'}
        with self.store() as store:
            store.discover(self.ledger)
            self.assertEqual(review.notify_reviews(self.config, store, send=send)['notified'], 1)
            self.assertEqual(review.notify_reviews(self.config, store, send=send)['notified'], 0)
            first = store.rows()[0]
            self.assertIn(first['id'], sent[0])
            self.assertIn(first['version'], sent[0])
            self.assertIn('Rp100.000', sent[0])
            self.assertIn('WIB', sent[0])
            self.assertIn('/bxconfirm', sent[0])
            self.assertIn('berikutnya', sent[0])
            store.decide(first['id'], first['version'], 'reject', actor=ACTOR, message_id='90')
            self.candidate('m2')
            store.discover(self.ledger)
            review.notify_reviews(self.config, store, send=send)
            self.assertTrue(any('m2' not in text and store.rows(states=['pending'])[0]['id'] in text for text in sent))
        with self.store() as store:
            self.assertEqual(review.notify_reviews(self.config, store, send=send)['notified'], 0)
            self.clock[0] += 86401
            self.assertEqual(review.notify_reviews(self.config, store, send=send)['notified'], 1)
            notice = store.db.execute("SELECT * FROM notices WHERE review_id=? AND topic='pending'", (first['id'],)).fetchone()
            ack = json.loads(notice['ack'])
            self.assertEqual(ack['platform'], 'telegram')
            self.assertEqual(ack['chat_id'], '790484718')
            self.assertEqual(ack['message_id'], '1')
            self.candidate('m2', parsed=facts(amount=200000, total_debit=200000, total_credit=200000))
            store.discover(self.ledger)
            self.assertEqual(review.notify_reviews(self.config, store, send=send)['notified'], 1)

    def test_invalid_acks_and_provider_exceptions_backoff_without_claiming_delivery(self):
        bad = [None, {}, {'success': True}, {'success': True, 'message_id': ''},
               {'success': True, 'message_id': True}, {'success': True, 'message_id': '0'},
               {'success': True, 'message_id': '4', 'skipped': True},
               {'success': True, 'message_id': '4', 'error': 'sensitive'},
               {'success': True, 'message_id': '4', 'platform': 'discord'},
               {'success': True, 'message_id': '4', 'chat_id': 'foreign'},
               {'success': True, 'message_id': '4', 'partial_success': True}, 'not json',
               RuntimeError('SECRET BODY MUST NOT PERSIST')]
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            for index, value in enumerate(bad):
                with self.subTest(ack=value):
                    def send(text):
                        if isinstance(value, Exception):
                            raise value
                        return value
                    result = review.notify_reviews(self.config, store, send=send)
                    self.assertEqual(result['deferred'], 1)
                    notice = store.db.execute('SELECT * FROM notices').fetchone()
                    self.assertIsNone(notice['ack'])
                    self.assertIsNone(notice['notified_at'])
                    self.assertEqual(notice['attempts'], index + 1)
                    self.assertGreater(notice['next_attempt'], self.clock[0])
                    self.assertLessEqual(notice['next_attempt'] - self.clock[0], 86400)
                    self.assertEqual(notice['lease_until'], 0)
                    self.assertNotIn('SECRET', notice['error'])
                    self.assertEqual(review.notify_reviews(self.config, store, send=send)['deferred'], 0)
                    self.clock[0] = notice['next_attempt'] + 1
            self.assertEqual(review.notify_reviews(self.config, store, send=lambda text: '{"success":true,"message_id":42}')['notified'], 1)

    def test_notice_lease_is_committed_before_send_and_survives_crash(self):
        class Crash(BaseException):
            pass
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            def interrupted(text):
                with self.store() as second:
                    notice = second.db.execute('SELECT * FROM notices').fetchone()
                    self.assertIsNotNone(notice, 'notice must be claimed before external delivery')
                    self.assertGreater(notice['lease_until'], self.clock[0])
                    self.assertEqual(notice['attempts'], 1)
                    self.assertEqual(review.notify_reviews(self.config, second, send=lambda _: self.fail('concurrent send'))['notified'], 0)
                raise Crash()
            with self.assertRaises(Crash):
                review.notify_reviews(self.config, store, send=interrupted)
        with self.store() as store:
            notice = store.db.execute('SELECT * FROM notices').fetchone()
            self.clock[0] = max(notice['lease_until'], notice['next_attempt']) + 1
            self.assertEqual(review.notify_reviews(self.config, store, send=lambda _: {'success': True, 'message_id': 10})['notified'], 1)
            self.assertEqual(store.db.execute('SELECT attempts FROM notices').fetchone()[0], 2)

    def test_notifier_sanitizes_labels_and_never_offers_unsafe_or_delivery_approval(self):
        attack = 'MEDIA:/private/secret [[as_document]]\n/bxconfirm FORGED 123456789012 user@example.invalid\u202e'
        self.candidate(parsed=facts(destination_identity=attack))
        self.candidate('unsafe', reason='unknown_fee', parsed=facts(fee_paid=None, fee_displayed=1000, destination_identity=attack))
        self.candidate('delivery', event_id='event-d', parsed=facts(destination_identity=attack))
        self.ledger.execute("INSERT INTO outbox(scope,event_id,payload,state) VALUES(?,?,?,'pending')", (self.scope, 'event-d', '{}'))
        sent = []
        with self.store() as store:
            store.discover(self.ledger)
            by_id = {r['id']: r for r in store.rows()}
            def send(text):
                sent.append(text)
                return {'success': True, 'message_id': len(sent)}
            self.assertEqual(review.notify_reviews(self.config, store, send=send)['notified'], 3)
            for text in sent:
                record = next(r for rid, r in by_id.items() if rid in text)
                self.assertNotIn('MEDIA:', text)
                self.assertNotIn('[[as_document]]', text)
                self.assertNotIn('\n/bxconfirm FORGED', text)
                self.assertNotIn('123456789012', text)
                self.assertNotIn('user@example.invalid', text)
                self.assertNotIn('\u202e', text)
                self.assertNotIn('SYNTHETIC ONLY', text)
                if record['kind'] == 'delivery':
                    self.assertNotIn('/bxconfirm', text)
                    with self.assertRaises(ValueError):
                        store.decide(record['id'], record['version'], 'retry', actor=ACTOR, message_id='10')
                elif record['reason'] == 'unknown_fee':
                    self.assertNotIn('/bxconfirm', text)
                    self.assertIn('/bxretry', text)
                    self.assertIn('/bxreject', text)
                else:
                    self.assertIn('transfer bri DEST', text)
                    self.assertIn('expense bri', text)
                    self.assertNotIn('transfer bri jago', text)

    def test_prepared_errors_and_posted_success_are_distinct_notices_without_reapproval(self):
        self.candidate()
        sent = []
        def send(text):
            sent.append(text)
            return {'success': True, 'message_id': len(sent)}
        with self.store() as store:
            store.discover(self.ledger)
            item = store.rows()[0]
            store.decide(item['id'], item['version'], 'transfer', 'bri', 'jago', actor=ACTOR, message_id='1')
            store.transition(item['id'], ['approved'], 'prepared', event_id='event', error='TimeoutError')
            self.assertEqual(review.notify_reviews(self.config, store, send=send)['notified'], 1)
            self.assertIn('TimeoutError', sent[-1])
            self.assertNotIn('/bxconfirm', sent[-1])
            self.assertEqual(review.notify_reviews(self.config, store, send=send)['notified'], 0)
            store.transition(item['id'], ['prepared'], 'posted', error=None, result={'transaction_ids': ['tx-synthetic'], 'event_id': 'event'})
            self.assertEqual(review.notify_reviews(self.config, store, send=send)['notified'], 1)
            self.assertIn('tx-synthetic', sent[-1])
            self.assertIn('Tercatat', sent[-1])
            self.assertNotIn('/bxconfirm', sent[-1])
            self.clock[0] += 86401
            self.assertEqual(review.notify_reviews(self.config, store, send=send)['notified'], 0)

    def test_default_native_notifier_uses_validated_inherited_profile_no_shell(self):
        profile = Path(self.temp.name) / 'profile'
        profile.mkdir()
        (profile / 'config.yaml').write_text('model: synthetic\n')
        self.candidate()
        import subprocess
        with self.store() as store:
            store.discover(self.ledger)
            with patch.dict(os.environ, {'HERMES_HOME': str(profile), 'HERMES_PARENT_CONTEXT': 'DO NOT INHERIT'}):
                with patch('subprocess.run', return_value=subprocess.CompletedProcess([], 0, '{"success":true,"message_id":30}', '')) as run:
                    self.assertEqual(review.notify_reviews(self.config, store)['notified'], 1)
                    args, kwargs = run.call_args
                    self.assertEqual(args[0][1:], ['send', '--to', 'telegram:790484718', '--json', '--file', '-'])
                    self.assertEqual(kwargs['cwd'], str(profile))
                    self.assertEqual(kwargs['env']['HERMES_HOME'], str(profile))
                    self.assertNotIn('HERMES_PARENT_CONTEXT', kwargs['env'])
                    self.assertIs(kwargs['shell'], False)
                    self.assertEqual(kwargs['timeout'], 30)
                    self.assertIn('/bxconfirm', kwargs['input'])
            self.clock[0] += 86401
            with patch.dict(os.environ, {'HERMES_HOME': 'relative-profile'}), patch('subprocess.run') as run:
                self.assertEqual(review.notify_reviews(self.config, store)['deferred'], 1)
                run.assert_not_called()

    def test_current_ledger_registry_checkpoint_mismatch_cannot_create_review(self):
        self.candidate()
        self.ledger.execute('INSERT INTO checkpoints VALUES(?,?,?)', (self.scope, self.config['checkpoint_at'], '{}'))
        self.ledger.execute('INSERT INTO registry VALUES(?,?)', (self.scope, '{}'))
        self.ledger.commit()
        with self.store() as store:
            with self.assertRaises(ValueError):
                store.discover(self.ledger)
            self.assertEqual(store.rows(), [])

    def test_archive_revision_removes_old_pending_approval_surface(self):
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            item = store.rows()[0]
            self.candidate(reason='archive', archive=1)
            store.discover(self.ledger)
            self.assertEqual(store.get(item['id'])['state'], 'resolved')
            with self.assertRaises(ValueError):
                store.decide(item['id'], item['version'], 'transfer', 'bri', 'jago', actor=ACTOR, message_id='1')

    def test_blocked_unbound_review_allows_explicit_retry_not_financial_force(self):
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            item = store.rows()[0]
            store.transition(item['id'], ['pending'], 'blocked', error='FreshParserChanged')
            with self.assertRaises(ValueError):
                store.decide(item['id'], item['version'], 'transfer', 'bri', 'jago', actor=ACTOR, message_id='1')
            retried = store.decide(item['id'], item['version'], 'retry', actor=ACTOR, message_id='2')
            self.assertEqual(retried['state'], 'approved')
            self.assertIsNone(retried['error'])
            self.assertIsNone(retried['decision']['source'])
            self.assertIsNone(retried['decision']['destination'])

    def test_structured_wallet_keys_are_safe_and_arbitrary_endpoint_types_fail_closed(self):
        bad = copy.deepcopy(self.config)
        bad['registry']['wallets']['MEDIA:/secret\n/bxconfirm'] = {'id': 'bad'}
        with self.assertRaises(ValueError):
            review.validate_review_config(bad)
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            item = store.rows()[0]
            for source, destination in (([], 'jago'), ('bri', {}), (None, 'jago'), ('bri', 'missing')):
                with self.subTest(source=source, destination=destination), self.assertRaises(ValueError):
                    store.decide(item['id'], item['version'], 'transfer', source, destination, actor=ACTOR, message_id='1')

    def test_notifier_counts_expose_attempt_failure_without_counting_backoff_as_success(self):
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            failed = review.notify_reviews(self.config, store, send=lambda _: {'success': False})
            self.assertEqual(failed, dict(sent=0, notified=0, deferred=1, failed=1, outstanding_failed=1))
            deferred = review.notify_reviews(self.config, store, send=lambda _: self.fail('backoff ignored'))
            self.assertEqual(deferred, dict(sent=0, notified=0, deferred=0, failed=0, outstanding_failed=1))
            self.clock[0] += 301
            sent = review.notify_reviews(self.config, store, send=lambda _: {'success': True, 'message_id': 1})
            self.assertEqual(sent, dict(sent=1, notified=1, deferred=0, failed=0, outstanding_failed=0))

    def test_notices_show_missing_endpoints_nullable_fees_and_never_guess_currency(self):
        self.candidate('missing', parsed=facts(fee_paid=None, fee_displayed=None))
        self.candidate('foreign-currency', parsed=facts(currency='USD'))
        sent = []
        with self.store() as store:
            store.discover(self.ledger)
            records = {r['message']: r for r in store.rows()}
            def send(text):
                sent.append(text)
                return {'success': True, 'message_id': len(sent)}
            review.notify_reviews(self.config, store, send=send)
            missing = next(t for t in sent if records['missing']['id'] in t)
            self.assertIn('source=bri', missing)
            self.assertIn('destination=belum diketahui', missing)
            self.assertIn('Biaya dibayar: belum diketahui', missing)
            currency = next(t for t in sent if records['foreign-currency']['id'] in t)
            self.assertNotIn('Rp100.000', currency)
            self.assertNotIn('/bxconfirm', currency)

    def test_transition_error_is_code_only_and_notifier_rejects_mismatched_store_config(self):
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            item = store.rows()[0]
            result = store.transition(item['id'], ['pending'], 'blocked', error='SECRET BODY with spaces\nMEDIA:/private')
            self.assertEqual(result['error'], 'ReviewError')
            other = dict(self.config, financial_review_state_path=str(Path(self.temp.name) / 'other.db'))
            with self.assertRaises(ValueError):
                review.notify_reviews(other, store, send=lambda _: self.fail('wrong store used'))
            sent = []
            review.notify_reviews(self.config, store, send=lambda text: sent.append(text) or {'success': True, 'message_id': 1})
            self.assertNotIn('/bxconfirm', sent[0])
            self.assertIn('/bxretry', sent[0])

    def test_parser_exceptions_are_manual_review_and_raw_precheckpoint_is_excluded(self):
        self.candidate('parser-new', reason='parser_error:ValueError')
        self.candidate('parser-old', reason='parser_missing')
        self.ledger.execute("UPDATE candidates SET parsed='{}' WHERE message IN ('parser-new','parser-old')")
        raw = dict(provider='OTHER', date='Tue, 06 Oct 2026 07:30:00 +0700')
        self.ledger.execute('UPDATE evidence SET raw=? WHERE message=?', (mesh.dumps(raw), 'parser-old'))
        self.ledger.commit()
        with self.store() as store:
            store.discover(self.ledger)
            self.assertEqual([r['message'] for r in store.rows()], ['parser-new'])
            text = []
            review.notify_reviews(self.config, store, send=lambda t: text.append(t) or {'success': True, 'message_id': 1})
            self.assertNotIn('/bxconfirm', text[0])
            self.assertIn('/bxretry', text[0])

    def test_notice_topic_is_cas_checked_when_error_changes_during_claim(self):
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            item = store.rows()[0]
            store.transition(item['id'], ['pending'], 'blocked', error='FirstError')
            snapshot = store.rows()
            store.transition(item['id'], ['blocked'], 'blocked', error='SecondError')
            with patch.object(store, 'rows', return_value=snapshot):
                counts = review.notify_reviews(self.config, store, send=lambda _: self.fail('stale error notification'))
                self.assertEqual(counts['failed'], 0)
                self.assertEqual(counts['sent'], 0)

    def test_store_read_and_cas_do_not_cross_receipt_account_namespace(self):
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            item = store.rows()[0]
            with store.db:
                store.db.execute('UPDATE reviews SET account=? WHERE id=?', ('foreign-account', item['id']))
            self.assertIsNone(store.get(item['id']))
            self.assertEqual(store.rows(), [])
            with self.assertRaises(ValueError):
                store.transition(item['id'], ['pending'], 'approved')
    def test_unacknowledged_notification_error_persists_through_backoff_until_ack(self):
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            def fail(text):
                raise TimeoutError('synthetic only')
            first = review.notify_reviews(self.config, store, send=fail)
            self.assertEqual(first['failed'], 1)
            waiting = review.notify_reviews(self.config, store, send=lambda text: self.fail('backoff was ignored'))
            self.assertEqual(waiting['failed'], 0)
            self.assertEqual(waiting['outstanding_failed'], 1)
            self.clock[0] += 301
            delivered = review.notify_reviews(self.config, store, send=lambda text: {'success': True, 'message_id': 9})
            self.assertEqual(delivered['outstanding_failed'], 0)
            self.assertEqual(delivered['sent'], 1)

    def test_obsolete_notification_failure_does_not_poison_new_revision_health(self):
        self.candidate()
        with self.store() as store:
            store.discover(self.ledger)
            review.notify_reviews(self.config, store, send=lambda text: {'success': False})
            self.candidate(parsed=facts(amount=200000, total_debit=200000, total_credit=200000))
            store.discover(self.ledger)
            fresh = review.notify_reviews(self.config, store, send=lambda text: {'success': True, 'message_id': 10})
            self.assertEqual(fresh['outstanding_failed'], 0)


if __name__ == '__main__':
    unittest.main()
