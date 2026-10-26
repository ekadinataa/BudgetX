"""Offline admin CLI tests; only disposable SQLite and config fixtures."""
import importlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import mesh
import financial_review
from test_financial_review import ACTOR, configuration, facts



class AdminTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR'))
        self.addCleanup(self.temp.cleanup)
        self.profile = str(Path(self.temp.name) / 'profiles' / 'devops-budgetx')
        Path(self.profile).mkdir(parents=True)
        (Path(self.profile) / 'config.yaml').write_text('# synthetic configured profile\n')
        self.config = configuration(Path(self.temp.name))
        self.ledger = sqlite3.connect(':memory:')
        self.addCleanup(self.ledger.close)
        self.ledger.row_factory = sqlite3.Row
        self.ledger.executescript(mesh.SCHEMA)
        raw = {'provider': 'OTHER', 'gmail_message_id': 'synthetic', 'body_normalized': 'SYNTHETIC ONLY'}
        scope = mesh.PROJECT + ':' + mesh.UID
        self.ledger.execute('INSERT INTO evidence VALUES(?,?,?,?)', ('akun-1', 'synthetic', mesh.dumps(raw), 0))
        self.ledger.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?)',
                            (scope, 'akun-1', 'synthetic', mesh.dumps(facts()), 'unresolved_endpoint', None))
        self.ledger.commit()
        with financial_review.ReviewStore(self.config) as store:
            store.discover(self.ledger)
            self.item = store.rows()[0]
        self.env = patch.dict(os.environ, HERMES_HOME=self.profile)
        self.env.start()
        self.addCleanup(self.env.stop)

    def admin(self):
        try:
            module = importlib.import_module('financial_review_admin')
        except ModuleNotFoundError:
            module = None
        self.assertIsNotNone(module, 'deterministic admin backend missing')
        return module

    def request(self, text=None, **changes):
        result = dict(profile_home=self.profile, actor=dict(ACTOR), message_id='100',
                      bot_username='budgetx_bot',
                      text=text or '/bxconfirm {id} {version} transfer bri jago'.format(**self.item))
        result.update(changes)
        return result

    def test_confirmation_persists_only_local_approval_intent(self):
        admin = self.admin()
        before = self.ledger.total_changes
        response = admin.handle_request(self.config, self.request())
        self.assertTrue(response['ok'])
        self.assertIn('terjadwal berikutnya', response['text'])
        with financial_review.ReviewStore(self.config) as store:
            result = store.get(self.item['id'])
            self.assertEqual(result['state'], 'approved')
            self.assertEqual(result['decision']['source'], 'bri')
            self.assertEqual(result['decision']['destination'], 'jago')
            self.assertIsNone(result['event_id'])
        self.assertEqual(self.ledger.total_changes, before)


    def test_invalid_syntax_is_rejected_without_deciding(self):
        admin = self.admin()
        base = '{id} {version}'.format(**self.item)
        commands = ['/bxapprove ' + base, '/bxconfirm ' + base, '/bxconfirm ' + base + ' transfer bri jago extra',
                    '/bxconfirm ' + base + ' transfer bri\njago', '/bxconfirm ' + base + ' transfer bri jago\n',
                    ' /bxretry ' + base, '/bxreview extra', '/bxretry ' + base + ' extra',
                    '/bxreject ' + base + ' extra', '/bxconfirm@other_bot ' + base + ' transfer bri jago',
                    '/bxconfirm ' + base.upper() + ' transfer bri jago',
                    '/bxconfirm ' + base + ' transfer bri jago;id',
                    '/bxconfirm ' + base + ' transfer bri jago\x00', '/bxreview' + ' ' * 9000]
        for text in commands:
            with self.subTest(text=text[:90]), self.assertRaises(ValueError):
                admin.handle_request(self.config, self.request(text))
        with financial_review.ReviewStore(self.config) as store:
            self.assertEqual(store.get(self.item['id'])['state'], 'pending')
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM commands').fetchone()[0], 0)

    def test_untrusted_identity_and_profile_fail_before_store_is_opened(self):
        admin = self.admin()
        variants = [dict(profile_home=str(Path(self.temp.name) / 'wrong-profile')), dict(profile_home=self.profile + '/'),
                    dict(message_id=True), dict(message_id=0), dict(message_id='1e3'), dict(extra='ignored?')]
        for changes in (dict(user_id='123'), dict(chat_id='123'), dict(is_bot=True), dict(chat_type='group'),
                        dict(platform='internal'), dict(user_id=790484718), dict(extra=True)):
            variants.append(dict(actor=dict(ACTOR, **changes)))
        for changes in variants:
            with self.subTest(changes=changes), patch.object(admin, 'ReviewStore') as store:
                with self.assertRaises(ValueError):
                    admin.handle_request(self.config, self.request(**changes))
                store.assert_not_called()
        with patch.dict(os.environ, HERMES_HOME=str(Path(self.temp.name) / 'wrong-profile')), self.assertRaises(ValueError):
            admin.handle_request(self.config, self.request())

    def test_stale_version_foreign_receipt_and_foreign_account_cannot_decide(self):
        admin = self.admin()
        base = self.item['id'] + ' ' + ('0' * 16)
        unknown = 'f' * 64 + ' ' + self.item['version']
        foreign_config = dict(self.config, account_id='akun-other')
        for config, text in ((self.config, '/bxretry ' + base),
                             (self.config, '/bxretry ' + unknown),
                             (foreign_config, self.request()['text'])):
            with self.subTest(text=text), self.assertRaises(ValueError):
                admin.handle_request(config, self.request(text))
        with financial_review.ReviewStore(self.config) as store:
            self.assertEqual(store.get(self.item['id'])['state'], 'pending')
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM commands').fetchone()[0], 0)

    def test_expense_and_income_commands_persist_exact_local_endpoints(self):
        admin = self.admin()
        for action, source, destination, suffix in (
                ('expense', 'bri', 'EXTERNAL', 'expense bri'),
                ('income', 'EXTERNAL', 'jago', 'income jago')):
            with self.subTest(action=action):
                parsed = facts(event_type=action, source_wallet='UNRESOLVED', destination_wallet='UNRESOLVED')
                self.ledger.execute('UPDATE candidates SET parsed=?', (mesh.dumps(parsed),))
                self.ledger.commit()
                with financial_review.ReviewStore(self.config) as store:
                    store.discover(self.ledger)
                    item = store.rows()[0]
                text = '/bxconfirm ' + item['id'] + ' ' + item['version'] + ' ' + suffix
                result = admin.handle_request(self.config, self.request(text, message_id='101' if action == 'expense' else '102'))
                self.assertTrue(result['ok'])
                with financial_review.ReviewStore(self.config) as store:
                    item = store.get(item['id'])
                    self.assertEqual(item['state'], 'approved')
                    self.assertIsNone(item['event_id'])
                    self.assertEqual((item['decision']['source'], item['decision']['destination']), (source, destination))

    def test_supported_command_grammar_maps_exact_endpoints(self):
        admin = self.admin()
        base = '{id} {version}'.format(**self.item)
        for suffix, expected in [('transfer bri jago', ('transfer', 'bri', 'jago')),
                                 ('expense wallet.main', ('expense', 'wallet.main', None)),
                                 ('expense bri', ('expense', 'bri', None)),
                                 ('income jago', ('income', None, 'jago'))]:
            parsed = admin.parse_command('/bxconfirm@BudgetX_Bot ' + base + ' ' + suffix, 'budgetx_bot')
            self.assertEqual((parsed['action'], parsed['source'], parsed['destination']), expected)
        for command in ('retry', 'reject'):
            self.assertEqual(admin.parse_command('/bx' + command + ' ' + base)['action'], command)
        self.assertEqual(admin.parse_command('/bxreview'), dict(action='review'))

    def test_retry_records_intent_without_endpoint_override(self):
        admin = self.admin()
        result = admin.handle_request(self.config, self.request('/bxretry {id} {version}'.format(**self.item)))
        self.assertEqual(result['state'], 'approved')
        with financial_review.ReviewStore(self.config) as store:
            self.assertEqual(store.get(self.item['id'])['decision']['action'], 'retry')

    def test_reject_never_approves_publication(self):
        admin = self.admin()
        result = admin.handle_request(self.config, self.request('/bxreject {id} {version}'.format(**self.item)))
        self.assertEqual(result['state'], 'rejected')
        self.assertNotIn('Persetujuan lokal', result['text'])

    def test_review_lists_exact_id_version_guidance_without_writes(self):
        admin = self.admin()
        with financial_review.ReviewStore(self.config) as store:
            before = store.db.total_changes
            result = admin.handle_request(self.config, self.request('/bxreview'))
            self.assertEqual(store.db.total_changes, before)
            self.assertEqual(store.get(self.item['id'])['state'], 'pending')
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM commands').fetchone()[0], 0)
        self.assertTrue(result['ok'])
        self.assertIn(self.item['id'] + ' ' + self.item['version'], result['text'])
        self.assertIn('/bxconfirm', result['text'])
        self.assertIn('/bxretry', result['text'])
        self.assertIn('/bxreject', result['text'])
        self.assertNotIn('SYNTHETIC ONLY', result['text'])
        self.assertNotIn('synthetic@example.invalid', result['text'])

    def cli(self, payload):
        config_path = Path(self.temp.name) / 'config.json'
        config_path.write_text(json.dumps(self.config))
        config_path.chmod(0o600)
        return subprocess.run([sys.executable,
                               str(Path(__file__).with_name('financial_review_admin.py')),
                               '--config', str(config_path)], input=payload, text=True,
                              capture_output=True, timeout=10, env=dict(os.environ, HERMES_HOME=self.profile))

    def test_actual_cli_reads_bounded_json_and_records_durable_intent(self):
        proc = self.cli(json.dumps(self.request()))
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue(proc.stdout, 'CLI JSON response missing')
        response = json.loads(proc.stdout)
        self.assertTrue(response['ok'])
        self.assertEqual(proc.stderr, '')
        with financial_review.ReviewStore(self.config) as store:
            self.assertEqual(store.get(self.item['id'])['state'], 'approved')

    def test_actual_cli_fails_closed_on_oversize_invalid_or_duplicate_json(self):
        request = json.dumps(self.request())
        for payload in ('x', ' ' * 9000, request + request, '{"text":"/bxreview","text":"/bxreject"}'):
            with self.subTest(payload=payload[:30]):
                proc = self.cli(payload)
                self.assertNotEqual(proc.returncode, 0)
                response = json.loads(proc.stdout)
                self.assertFalse(response['ok'])
                self.assertNotIn('Traceback', proc.stderr)
                self.assertNotIn('SYNTHETIC ONLY', proc.stdout)
        with financial_review.ReviewStore(self.config) as store:
            self.assertEqual(store.get(self.item['id'])['state'], 'pending')

    def test_pending_delivery_is_listed_as_informational_without_new_approval(self):
        admin = self.admin()
        scope = mesh.PROJECT + ':' + mesh.UID
        self.ledger.execute("UPDATE candidates SET event_id='delivery-event'")
        self.ledger.execute('INSERT INTO outbox(scope,event_id,payload,state) VALUES(?,?,?,?)',
                            (scope, 'delivery-event', '{}', 'pending'))
        self.ledger.commit()
        with financial_review.ReviewStore(self.config) as store:
            store.discover(self.ledger)
        result = admin.handle_request(self.config, self.request('/bxreview'))
        self.assertIn(self.item['id'] + ' ' + self.item['version'], result['text'])
        self.assertIn('informasional', result['text'])
        self.assertNotIn('/bxconfirm ', result['text'])

    def test_unsafe_receipt_offers_only_retry_reject_not_financial_confirmation(self):
        admin = self.admin()
        parsed = facts()
        parsed.update(amount=-1, eligible=False, validation_errors=['unsafe_amount'])
        self.ledger.execute('UPDATE candidates SET parsed=?,reason=?', (mesh.dumps(parsed), 'ineligible'))
        self.ledger.commit()
        with financial_review.ReviewStore(self.config) as store:
            store.discover(self.ledger)
            item = store.rows()[0]
        result = admin.handle_request(self.config, self.request('/bxreview'))
        self.assertNotIn('/bxconfirm ', result['text'])
        self.assertIn('/bxretry ' + item['id'] + ' ' + item['version'], result['text'])
        self.assertIn('/bxreject ' + item['id'] + ' ' + item['version'], result['text'])
        self.assertIn('manual', result['text'])

    def test_read_only_review_closes_connection(self):
        admin = self.admin()
        opened = []
        connect = sqlite3.connect
        def tracked_connect(*args, **kwargs):
            db = connect(*args, **kwargs)
            opened.append(db)
            self.addCleanup(db.close)
            return db
        with patch.object(admin.sqlite3, 'connect', side_effect=tracked_connect):
            admin.handle_request(self.config, self.request('/bxreview'))
        self.assertEqual(len(opened), 1)
        with self.assertRaises(sqlite3.ProgrammingError):
            opened[0].execute('SELECT 1')

    def test_read_only_review_does_not_create_missing_state(self):
        admin = self.admin()
        self.config['financial_review_state_path'] = str(Path(self.temp.name) / 'not-created.db')
        self.assertTrue(admin.handle_request(self.config, self.request('/bxreview'))['ok'])
        self.assertFalse(Path(self.config['financial_review_state_path']).exists())


if __name__ == '__main__':
    unittest.main()
