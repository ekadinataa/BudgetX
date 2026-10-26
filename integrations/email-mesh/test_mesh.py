"""Synthetic simulation only; no live Gmail/Firebase or real financial data."""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

try:
    import mesh
except ModuleNotFoundError:
    mesh = None

T0 = '2026-10-07T00:00:00+00:00'
NOW = datetime(2026, 10, 7, 1, tzinfo=timezone.utc)


def config(root):
    return {'project_id': 'budgetku-app-v1', 'uid': 'VCqdnx9zvJVrZQSNp6gyGm6Zzhr2',
            'email': 'demo@budgetx.id', 'account_id': 'akun-1',
            'mailbox_email': 'simulation@example.invalid', 'checkpoint_at': T0,
            'db_path': str(root / 'state.sqlite3'), 'publish_enabled': False,
            'sender_allowlist': {'bri@example.invalid': 'BRI', 'jago@example.invalid': 'Jago'},
            'registry': {'wallets': {'bri': {'id': 'wb'}, 'jago': {'id': 'wj'}},
                         'aliases': {}},
            'categories': [{'id': 'c3', 'name': 'Utilitas', 'section': 'needs'},
                           {'id': 'c18', 'name': 'Lainnya', 'section': 'income'}]}


def row(mid, provider='BRI'):
    return {'account_id': 'akun-1', 'gmail_message_id': mid,
            'provider': provider, 'from': 'bri@example.invalid',
            'date': 'Wed, 07 Oct 2026 07:30:00 +0700',
            'body_normalized': 'Explicit synthetic simulation'}


def parsed(**changes):
    p = dict(is_transaction=True, eligible=True, event_type='transfer', status='success',
             source_wallet='bri', destination_wallet='jago', source_identity='owned-bri',
             destination_identity='owned-jago', destination_flag='owned', amount=100000,
             currency='IDR', fee_displayed=0, fee_paid=0, total_debit=100000,
             total_credit=100000, reference='SIM-1', facility=None,
             notification_at='2026-10-07T00:30:00+00:00', time_source='header_date',
             body_transaction_at=None, raw_fields={}, validation_errors=[],
             category_hint=None, note='Explicit synthetic simulation', provenance={})
    p.update(changes)
    return p


class Request:
    def __init__(self, value):
        self.value = value

    def execute(self):
        if isinstance(self.value, Exception):
            raise self.value
        return self.value


class FakeGmail:
    def __init__(self):
        self.pages = {'': {'history': [{'messagesAdded': [{'message': {'id': 'new'}}]}],
                           'nextPageToken': 'p2', 'historyId': '12'},
                      'p2': {'history': [{'labelsAdded': [{'message': {'id': 'new'}},
                                                        {'message': {'id': 'excluded'}}]}], 'historyId': '13'}}
        self.calls = []
        self.fail = False

    def users(self):
        return self

    def history(self):
        return self

    def messages(self):
        return self

    def labels(self):
        return Labels()

    def getProfile(self, **kwargs):
        return Request({'emailAddress': 'simulation@example.invalid', 'historyId': '10'})

    def list(self, **kwargs):
        self.calls.append(('list', kwargs))
        return Request(self.pages[kwargs.get('pageToken') or ''])

    def get(self, **kwargs):
        self.calls.append(('get', kwargs))
        if self.fail and kwargs.get('format') == 'full':
            return Request(RuntimeError('synthetic network failure'))
        mid = kwargs['id']
        headers = [{'name': 'From', 'value': 'bri@example.invalid' if mid == 'new' else 'shopee@example.invalid'},
                   {'name': 'Date', 'value': 'Wed, 07 Oct 2026 07:30:00 +0700'}]
        return Request({'id': mid, 'labelIds': ['label-trx'], 'internalDate': '1791333000000',
                        'payload': {'headers': headers, 'mimeType': 'text/plain',
                                    'body': {'data': 'U3ludGhldGlj'}}})


class Labels:
    def list(self, **kwargs):
        return Request({'labels': [{'id': 'label-trx', 'name': 'TRX'}]})


class MeshTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.cfg = config(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def engine(self, **kwargs):
        self.assertIsNotNone(mesh, 'mesh engine not implemented')
        return mesh.Engine(self.cfg, now=lambda: NOW, **kwargs)

    def test_durable_event_and_evidence_dedup_on_restart(self):
        with self.engine(parser=lambda r, registry: parsed()) as e:
            e.ingest([row('one')])
            self.assertEqual(e.status()['events'], 1)
            self.assertEqual(e.status()['outbox_pending'], 1)
        with self.engine(parser=lambda r, registry: parsed()) as e:
            e.ingest([row('one'), row('two')])
            self.assertEqual(e.status()['events'], 1)
            self.assertEqual(e.status()['evidence'], 2)
            self.assertEqual(e.status()['movements'], 2)

    def test_paid_fee_net_transfer_and_category(self):
        p = parsed(amount=100000, total_credit=97500, total_debit=100000,
                   fee_displayed=2500, fee_paid=2500)
        with self.engine(parser=lambda r, registry: p) as e:
            e.ingest([row('fee')])
            payload = json.loads(e.db.execute('SELECT payload FROM outbox').fetchone()[0])
            self.assertEqual([t['amount'] for t in payload['components']], [97500, 2500])
            self.assertEqual([t['type'] for t in payload['components']], ['transfer', 'expense'])
            effects = {m['wallet']: m['delta'] for m in payload['movements']}
            self.assertEqual(effects, {'wb': -100000, 'wj': 97500})
            self.assertIsNone(payload['components'][0]['categoryId'])

    def test_checkpoint_direction_displayed_fee_and_pln(self):
        records = {
            'old': parsed(notification_at='2026-10-06T23:59:59+00:00'),
            'forward': parsed(reference='D1'),
            'reverse': parsed(reference='D2', source_wallet='jago', destination_wallet='bri'),
            'pln': parsed(reference='P1', event_type='expense', destination_wallet='EXTERNAL',
                          total_credit=None, fee_paid=0, fee_displayed=2500, category_hint='PLN'),
            'unknown': parsed(reference='U1', source_wallet='UNRESOLVED'),
        }
        with self.engine(parser=lambda r, registry: records[r['gmail_message_id']]) as e:
            e.ingest([row(k) for k in records])
            self.assertEqual(e.status()['events'], 3)
            payloads = [json.loads(x[0]) for x in e.db.execute('SELECT payload FROM outbox')]
            pln = next(p for p in payloads if p['parsed']['reference'] == 'P1')
            self.assertEqual(len(pln['components']), 1)
            self.assertEqual(pln['components'][0]['categoryId'], 'c3')
            self.assertEqual(pln['components'][0]['date'], '2026-10-07')

    def test_paginated_delta_atomic_cursor_and_no_delta(self):
        gmail = FakeGmail()
        with self.engine(parser=lambda r, registry: parsed()) as e:
            e.bootstrap(gmail)
            gmail.fail = True
            with self.assertRaises(RuntimeError):
                e.run(gmail)
            self.assertEqual(e.status()['mailbox']['cursor'], '10')
            self.assertEqual(e.status()['evidence'], 0)
            gmail.fail = False
            e.run(gmail)
            self.assertEqual(e.status()['mailbox']['cursor'], '13')
            self.assertEqual(e.status()['evidence'], 1)
            full = [x for x in gmail.calls if x[0] == 'get' and x[1]['format'] == 'full']
            self.assertEqual(len(full), 2)  # one failed attempt, one success
            gmail.pages = {'': {'historyId': '13'}}
            gmail.calls.clear()
            e.run(gmail)
            self.assertFalse(any(x[0] == 'get' for x in gmail.calls))
            self.assertEqual(e.status()['events'], 1)

    def test_bootstrap_archive_is_offline_and_once(self):
        archive = self.root / 'archive.jsonl'
        archive.write_text(json.dumps(row('historic')) + '\n')
        self.cfg['archive_path'] = str(archive)
        self.cfg['raw_archive_dir'] = str(self.root / 'raw')
        with self.engine(parser=lambda r, registry: parsed()) as e:
            e.bootstrap(FakeGmail())
            e.bootstrap(FakeGmail())
            self.assertEqual(e.status()['evidence'], 1)
            self.assertEqual(e.status()['events'], 0)
            self.assertEqual(e.status()['mailbox']['cursor'], '10')
            stored = json.loads(e.db.execute('SELECT raw FROM evidence').fetchone()[0])
            self.assertTrue(stored['raw_path'].endswith('historic.json'))

    def test_outbox_retry_and_evidence_enrichment_create_once(self):
        class Publisher:
            def __init__(self):
                self.calls = []
                self.fail = True
                self.markers = set()
                self.balance_writes = 0

            def apply(self, payload):
                if self.fail:
                    raise RuntimeError('synthetic failure')
                self.calls.append(payload)
                if payload['event_id'] not in self.markers:
                    self.markers.add(payload['event_id'])
                    self.balance_writes += 1

        publisher = Publisher()
        with self.engine(parser=lambda r, registry: parsed()) as e:
            e.ingest([row('one')])
            e.drain(publisher)
            self.assertEqual(e.status()['outbox_pending'], 1)
        publisher.fail = False
        with self.engine(parser=lambda r, registry: parsed()) as e:
            e.drain(publisher, force=True)
            e.ingest([row('two')])
            e.drain(publisher, force=True)
            self.assertEqual(publisher.balance_writes, 1)
            self.assertEqual(len(publisher.calls[-1]['evidence']), 2)
            self.assertEqual(e.status()['outbox_pending'], 0)

    def test_two_receipts_both_orders_opposite_transfers_and_restart(self):
        for order in (('send', 'receive'), ('receive', 'send')):
            self.cfg['db_path'] = str(self.root / ('-'.join(order) + '.sqlite3'))
            records = {
                'send': parsed(event_type='transfer_out', reference='BANK-A'),
                'receive': parsed(event_type='transfer_in', reference='BANK-B'),
                'reverse-send': parsed(event_type='transfer_out', reference='REVERSE-A', source_wallet='jago', destination_wallet='bri'),
                'reverse-receive': parsed(event_type='transfer_in', reference='REVERSE-B', source_wallet='jago', destination_wallet='bri'),
                'unknown-receive': parsed(event_type='transfer_in', eligible=False, source_wallet='UNRESOLVED', validation_errors=['unresolved_source']),
            }
            parser = lambda r, registry: records[r['gmail_message_id']]
            with self.engine(parser=parser) as e:
                e.ingest([row(mid, 'BRI' if 'send' in mid else 'Jago') for mid in order])
                self.assertEqual(e.status()['events'], 1)
                self.assertEqual(e.db.execute('SELECT count(*) FROM event_evidence').fetchone()[0], 2)
                e.ingest([row('reverse-send'), row('reverse-receive', 'Jago'), row('unknown-receive', 'Jago')])
                self.assertEqual(e.status()['events'], 2)
                self.assertEqual(e.status()['movements'], 4)
                self.assertEqual(e.db.execute('SELECT count(*) FROM event_evidence').fetchone()[0], 4)
            with self.engine(parser=parser) as e:
                e.ingest([row(mid, 'BRI' if 'send' in mid else 'Jago') for mid in records])
                self.assertEqual(e.status()['events'], 2)
                self.assertEqual(e.status()['movements'], 4)

    def test_cross_provider_unique_and_ambiguous_directional_match(self):
        with self.engine(parser=lambda r, registry: parsed(reference=r['gmail_message_id'])) as e:
            e.ingest([row('a'), row('b')])
            e.ingest([row('c', 'Jago')])
            self.assertEqual(e.status()['events'], 2)
            reason = e.db.execute("SELECT reason FROM candidates WHERE message='c'").fetchone()[0]
            self.assertEqual(reason, 'ambiguous_match')
        self.cfg['db_path'] = str(self.root / 'unique.sqlite3')
        with self.engine(parser=lambda r, registry: parsed(reference=r['gmail_message_id'])) as e:
            e.ingest([row('a'), row('b', 'Jago')])
            self.assertEqual(e.status()['events'], 1)

    def test_holds_use_held_amount_only_and_final_release(self):
        self.cfg['registry']['wallets']['bri']['type'] = 'credit'
        values = {'hold': parsed(event_type='hold', status='pending'), 'final': parsed()}
        with self.engine(parser=lambda r, registry: values[r['gmail_message_id']]) as e:
            e.ingest([row('hold')])
            hold = json.loads(e.db.execute('SELECT payload FROM outbox').fetchone()[0])
            self.assertEqual(hold['components'], [])
            self.assertEqual(hold['movements'], [{'wallet': 'wb', 'field': 'heldAmount', 'delta': 100000}])
            e.ingest([row('final')])
            final = json.loads(e.db.execute('SELECT payload FROM outbox ORDER BY rowid DESC').fetchone()[0])
            self.assertIn({'wallet': 'wb', 'field': 'heldAmount', 'delta': -100000}, final['movements'])
            self.assertEqual(e.status()['events'], 2)

    def test_target_namespace_and_lock_are_rejected(self):
        self.cfg['uid'] = 'other'
        with self.assertRaises(ValueError):
            self.engine()
        self.cfg['uid'] = 'VCqdnx9zvJVrZQSNp6gyGm6Zzhr2'
        with self.engine():
            with self.assertRaises(BlockingIOError):
                with self.engine():
                    pass

    def test_parser_event_vocabulary_and_gold_net_semantics(self):
        records = {
            'send': parsed(event_type='transfer_out', reference='SEND'),
            'receive': parsed(event_type='transfer_in', reference='OTHER'),
            'gold': parsed(event_type='gold_sale', reference='GOLD', source_wallet='EXTERNAL',
                           total_credit=97500, total_debit=None, fee_paid=2500, fee_displayed=2500),
        }
        with self.engine(parser=lambda r, registry: records[r['gmail_message_id']]) as e:
            e.ingest([row('send'), row('receive', 'Jago'), row('gold')])
            self.assertEqual(e.status()['events'], 2)
            gold = next(json.loads(r[0]) for r in e.db.execute('SELECT payload FROM outbox') if json.loads(r[0])['parsed']['reference'] == 'GOLD')
            self.assertEqual([t['amount'] for t in gold['components']], [100000, 2500])
            self.assertEqual([t['type'] for t in gold['components']], ['income', 'expense'])
            self.assertEqual(gold['movements'], [{'wallet': 'wj', 'field': 'balance', 'delta': 97500}])

    def test_firestore_transaction_create_once_manual_category_preserved(self):
        import copy
        class Snapshot:
            def __init__(self, body):
                self.exists = body is not None
                self.body = body
            def to_dict(self):
                return self.body
        class Ref:
            def __init__(self, db, path):
                self.db, self.path = db, path
            def get(self, transaction=None):
                return Snapshot((transaction.state if transaction else self.db.state).get(self.path))
        class DB:
            def __init__(self):
                self.state = {f'users/{self_cfg["uid"]}/wallets/wb': {'balance': 1000000, 'heldAmount': 0},
                              f'users/{self_cfg["uid"]}/wallets/wj': {'balance': 0, 'heldAmount': 0}}
            def document(self, path):
                return Ref(self, path)
            def transaction(self):
                return Transaction(self)
        class Transaction:
            def __init__(self, db):
                self.db, self.state = db, copy.deepcopy(db.state)
            def create(self, ref, value):
                if ref.path in self.state:
                    raise RuntimeError('already exists')
                self.state[ref.path] = value
            def set(self, ref, value, merge=False):
                self.state[ref.path] = {**self.state.get(ref.path, {}), **value} if merge else value
            def update(self, ref, value):
                from google.cloud.firestore_v1.transforms import Increment
                for k, v in value.items():
                    self.state[ref.path][k] = self.state[ref.path].get(k, 0) + v.value if isinstance(v, Increment) else v
        def runner(fn):
            def wrapped(transaction):
                fn(transaction)
                transaction.db.state = transaction.state
            return wrapped
        self_cfg = self.cfg
        db = DB()
        with self.engine(parser=lambda r, registry: parsed()) as e:
            publisher = mesh.FirestorePublisher(self.cfg, db=db, auth_lookup=lambda email: (self.cfg['uid'], email), transaction_runner=runner)
            e.ingest([row('one')])
            e.drain(publisher)
            base = f'users/{self.cfg["uid"]}'
            self.assertEqual(db.state[base + '/wallets/wb']['balance'], 900000)
            tx_path = next(k for k in db.state if '/transactions/' in k)
            db.state[tx_path]['categoryId'] = 'manual-category'
            e.ingest([row('two')])
            e.drain(publisher, force=True)
            self.assertEqual(db.state[base + '/wallets/wb']['balance'], 900000)
            self.assertEqual(db.state[tx_path]['categoryId'], 'manual-category')
            self.assertEqual(len([k for k in db.state if '/transactions/' in k]), 1)
            # Invalid target category fails atomically: no marker or balance effect.
            broken = parsed(reference='BAD-CATEGORY', event_type='expense', destination_wallet='EXTERNAL', total_credit=None)
            e.parser = lambda r, registry: broken
            e.ingest([row('bad')])
            bad_item = e.db.execute("SELECT payload FROM outbox WHERE state='pending'").fetchone()
            bad_payload = json.loads(bad_item[0])
            inconsistent = copy.deepcopy(bad_payload)
            inconsistent['components'][0]['amount'] = 999
            with self.assertRaises(ValueError):
                publisher.apply(inconsistent)
            bad_payload['components'][0]['categoryId'] = 'nonexistent'
            before = copy.deepcopy(db.state)
            with self.assertRaises(ValueError):
                publisher.apply(bad_payload)
            self.assertEqual(db.state, before)
            # Explicit synthetic category-only correction; no balance mutation.
            db.state[tx_path]['type'] = 'expense'
            db.state[base + '/categories/c3'] = {'name': 'Utilitas', 'section': 'needs'}
            component_id = tx_path.rsplit('/', 1)[1]
            self.assertFalse(publisher.update_category(component_id, 'c3', expected_category=None))
            self.assertTrue(publisher.update_category(component_id, 'c3', expected_category='manual-category'))
            self.assertEqual(db.state[tx_path]['categoryId'], 'c3')
            self.assertEqual(db.state[base + '/wallets/wb']['balance'], 900000)
            db.state[tx_path]['category_source'] = 'manual'
            self.assertFalse(publisher.update_category(component_id, None, expected_category='c3'))
            self.assertEqual(db.state[tx_path]['categoryId'], 'c3')
            self.assertEqual(db.state[base + '/wallets/wb']['balance'], 900000)
            with self.assertRaises(ValueError):
                mesh.FirestorePublisher(self.cfg, db=db, auth_lookup=lambda email: ('wrong', email), transaction_runner=runner)

    def test_last_success_covers_mail_arriving_during_slow_cursor_and_fetch(self):
        from datetime import timedelta
        clock = [NOW]
        gmail = FakeGmail()
        class Gone(Exception):
            resp = type('Response', (), {'status': 404})()
        class RecoveryGmail(FakeGmail):
            def list(self, **kwargs):
                self.calls.append(('list', kwargs))
                return Request(Gone() if 'startHistoryId' in kwargs else {})
        with mesh.Engine(self.cfg, parser=lambda r, registry: parsed(), now=lambda: clock[0]) as e:
            e.bootstrap(gmail)
            acquire = clock[0]
            delta_ids = e.delta_ids
            def slow_delta(*args):
                result = delta_ids(*args)
                clock[0] += timedelta(minutes=10)
                return result
            fetch = e.fetch_row
            def slow_fetch(*args):
                clock[0] += timedelta(minutes=20)
                return fetch(*args)
            e.delta_ids, e.fetch_row = slow_delta, slow_fetch
            e.run(gmail)
            self.assertEqual(e.status()['mailbox']['last_success'], acquire.isoformat())
            self.assertGreater(mesh.instant(e.db.execute('SELECT finished FROM job_runs').fetchone()[0]), acquire)
            recovery = RecoveryGmail()
            e.delta_ids = delta_ids
            e.run(recovery)
            query = next(kwargs['q'] for _, kwargs in recovery.calls if 'q' in kwargs)
            self.assertIn('after:' + str(int(acquire.timestamp()) - 300), query)

    def test_history_404_bounded_overlap_paginated(self):
        class Gone(Exception):
            resp = type('Response', (), {'status': 404})()
        class RecoveryGmail(FakeGmail):
            def list(self, **kwargs):
                self.calls.append(('list', kwargs))
                if 'startHistoryId' in kwargs:
                    return Request(Gone())
                return Request({'messages': [{'id': 'new'}], 'nextPageToken': 'last'} if not kwargs.get('pageToken') else {})
        gmail = RecoveryGmail()
        with self.engine(parser=lambda r, registry: parsed()) as e:
            e.bootstrap(gmail)
            e.run(gmail)
            queries = [call[1]['q'] for call in gmail.calls if 'q' in call[1]]
            self.assertEqual(len(queries), 2)
            self.assertIn('label:TRX after:', queries[0])
            self.assertIn('before:', queries[0])
            with e.db:
                e.db.execute("UPDATE mailbox SET last_success='2026-09-01T00:00:00+00:00'")
            with self.assertRaisesRegex(RuntimeError, 'bounded recovery'):
                e.run(gmail)

    def test_cli_help_and_private_config_and_missing_parser(self):
        import subprocess
        result = subprocess.run([sys.executable, mesh.__file__, '--help'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn('bootstrap', result.stdout)
        path = self.root / 'config.json'
        path.write_text(json.dumps(self.cfg))
        path.chmod(0o600)
        self.assertEqual(mesh.load_config(str(path))['account_id'], 'akun-1')
        result = subprocess.run([sys.executable, mesh.__file__, '--config', str(path), 'status'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertFalse(json.loads(result.stdout)['publication_enabled'])
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            mesh.load_config(str(path))
        from unittest.mock import patch
        with self.engine() as e, patch('mesh.importlib.import_module', side_effect=ModuleNotFoundError):
            e.ingest([row('missing')])
            self.assertEqual(e.db.execute('SELECT reason FROM candidates').fetchone()[0], 'parser_missing')
            e.parser = lambda r, registry: parsed()
            e.reparse_pending()
            self.assertEqual(e.status()['events'], 1)

    def test_current_parser_payment_vocabulary(self):
        types = ('card_purchase', 'merchant_payment', 'virtual_account_payment', 'bill_payment')
        with self.engine(parser=lambda r, registry: parsed(event_type=r['subject'], destination_wallet='EXTERNAL',
                                                          reference=r['gmail_message_id'], total_credit=None)) as e:
            e.ingest([dict(row(kind), subject=kind) for kind in types])
            self.assertEqual(e.status()['events'], len(types))

    def test_cross_provider_conflicting_fee_quarantined_not_double_posted(self):
        records = {'source': parsed(reference='F1', fee_paid=2500, fee_displayed=2500, total_debit=102500),
                   'recipient': parsed(reference='F2', fee_paid=None, fee_displayed=None, total_debit=None)}
        with self.engine(parser=lambda r, registry: records[r['gmail_message_id']]) as e:
            e.ingest([row('source'), row('recipient', 'Jago')])
            self.assertEqual(e.status()['events'], 1)
            self.assertEqual(e.db.execute("SELECT reason FROM candidates WHERE message='recipient'").fetchone()[0], 'cross_provider_effect_uncertain')

    def test_late_hold_after_final_quarantined(self):
        self.cfg['registry']['wallets']['bri']['type'] = 'credit'
        records = {'final': parsed(), 'hold': parsed(event_type='hold', status='pending')}
        with self.engine(parser=lambda r, registry: records[r['gmail_message_id']]) as e:
            e.ingest([row('final'), row('hold')])
            self.assertEqual(e.status()['events'], 1)

    def test_final_without_reference_cannot_guess_hold_release(self):
        self.cfg['registry']['wallets']['bri']['type'] = 'credit'
        values = {'hold': parsed(event_type='hold', status='pending'), 'final': parsed(reference=None)}
        with self.engine(parser=lambda r, registry: values[r['gmail_message_id']]) as e:
            e.ingest([row('hold'), row('final')])
            self.assertEqual(e.status()['events'], 1)
            self.assertEqual(e.db.execute("SELECT reason FROM candidates WHERE message='final'").fetchone()[0], 'hold_link_uncertain')

    def test_external_identity_disagreement_quarantined(self):
        for side in ('source', 'destination'):
            with self.subTest(side=side):
                self.cfg['db_path'] = str(self.root / (side + '.sqlite3'))
                values = {
                    'one': parsed(**{side + '_wallet': 'EXTERNAL', side + '_identity': ' Shop A ',
                                    'event_type': 'expense' if side == 'destination' else 'income'}),
                    'same': parsed(**{side + '_wallet': 'EXTERNAL', side + '_identity': 'shop   a',
                                     'event_type': 'expense' if side == 'destination' else 'income'}),
                    'other': parsed(**{side + '_wallet': 'EXTERNAL', side + '_identity': 'Shop B',
                                      'event_type': 'expense' if side == 'destination' else 'income'}),
                }
                with self.engine(parser=lambda r, registry: values[r['gmail_message_id']]) as e:
                    e.ingest([row('one'), row('same'), row('other')])
                    self.assertEqual(e.status()['events'], 1)
                    self.assertEqual(e.db.execute('SELECT count(*) FROM event_evidence').fetchone()[0], 2)
                    self.assertEqual(e.db.execute("SELECT reason FROM candidates WHERE message='other'").fetchone()[0], 'reference_conflict')

    def test_reference_missing_duplicate_quarantined(self):
        with self.engine(parser=lambda r, registry: parsed(reference=None)) as e:
            e.ingest([row('one'), row('two')])
            self.assertEqual(e.status()['events'], 1)
            self.assertEqual(e.db.execute("SELECT reason FROM candidates WHERE message='two'").fetchone()[0], 'reference_missing_duplicate_uncertain')

    def test_cli_cloud_unavailable_still_commits_delta(self):
        from unittest.mock import patch
        self.cfg['publish_enabled'] = True
        path = self.root / 'config.json'
        path.write_text(json.dumps(self.cfg))
        path.chmod(0o600)
        gmail = FakeGmail()
        with self.engine() as e:
            e.bootstrap(gmail)
        import contextlib
        import io
        with patch('mesh.build_gmail', return_value=gmail), patch('mesh.FirestorePublisher', side_effect=RuntimeError('synthetic unavailable')), contextlib.redirect_stdout(io.StringIO()):
            code = mesh.main(['--config', str(path), 'run'])
        self.assertEqual(code, 1)
        with self.engine() as e:
            self.assertEqual(e.status()['mailbox']['cursor'], '13')
            self.assertEqual(e.status()['evidence'], 1)

    def test_unknown_fee_blocks_eligibility(self):
        """Issue 2: fee_paid=None when fee_displayed>0 must block with 'unknown_fee'."""
        # fee_displayed>0, fee_paid=None should block
        p_blocked = parsed(fee_displayed=2500, fee_paid=None)
        with self.engine(parser=lambda r, registry: p_blocked) as e:
            reason = e.reason(p_blocked)
            self.assertEqual(reason, 'unknown_fee')
        # fee_displayed>0, fee_paid=0 explicit is OK
        p_ok = parsed(fee_displayed=2500, fee_paid=0)
        with self.engine(parser=lambda r, registry: p_ok) as e:
            reason = e.reason(p_ok)
            self.assertEqual(reason, 'ready')

    def test_mesh_type_field_in_components(self):
        """Issue 3: components must have mesh_type INCOMING/OUTGOING/INTERNAL."""
        records = {
            'incoming': parsed(source_wallet='EXTERNAL', destination_wallet='jago', reference='IN1',
                               event_type='transfer_in', total_debit=None),
            'outgoing': parsed(source_wallet='bri', destination_wallet='EXTERNAL', reference='OUT1',
                               event_type='expense', total_credit=None),
            'internal': parsed(source_wallet='bri', destination_wallet='jago', reference='INT1'),
        }
        with self.engine(parser=lambda r, registry: records[r['gmail_message_id']]) as e:
            e.ingest([row('incoming'), row('outgoing'), row('internal')])
            payloads = {json.loads(x[0])['parsed']['reference']: json.loads(x[0])
                        for x in e.db.execute('SELECT payload FROM outbox')}
            self.assertEqual(payloads['IN1']['components'][0]['mesh_type'], 'INCOMING')
            self.assertEqual(payloads['OUT1']['components'][0]['mesh_type'], 'OUTGOING')
            self.assertEqual(payloads['INT1']['components'][0]['mesh_type'], 'INTERNAL')

    def test_category_rules_use_current_catalog_and_override_precedence(self):
        self.cfg['categories'] = [
            {'id': 'new-health', 'name': 'Kesehatan', 'section': 'needs'},
            {'id': 'new-utility', 'name': 'Utilitas', 'section': 'needs'},
            {'id': 'new-grocery', 'name': 'Belanja Bulanan', 'section': 'needs'},
        ]
        self.cfg['category_overrides'] = {'OVERRIDE': 'new-health'}
        with self.engine() as e:
            grocery = parsed(event_type='qris_payment', raw_fields={'merchant': 'INDOMARET'})
            self.assertEqual(e.category(grocery, 'expense'), ('new-grocery', 'rule'))
            health = parsed(raw_fields={'Institusi': 'BPJS Kesehatan'})
            self.assertEqual(e.category(health, 'expense'), ('new-health', 'rule'))
            self.assertEqual(e.category(parsed(event_type='electricity_payment'), 'expense'), ('new-utility', 'rule'))
            self.assertEqual(e.category(dict(grocery, reference='OVERRIDE'), 'expense'), ('new-health', 'rule'))
            self.assertEqual(e.category(grocery, 'transfer'), (None, None))
            self.assertEqual(e.category(parsed(raw_fields={'merchant': 'MITRABL-SYNTHETIC-0001'}), 'expense'), (None, None))
            payload = e.plan(dict(grocery, destination_wallet='EXTERNAL', total_credit=None), 'a' * 64)
            self.assertEqual(payload['components'][0]['category_status'], 'classified')
            self.assertEqual(payload['components'][0]['categoryId'], 'new-grocery')

    def test_category_source_and_status_in_components(self):
        """Issue 4: components must have category_source and category_status."""
        records = {
            'pln': parsed(reference='P1', event_type='expense', destination_wallet='EXTERNAL',
                          total_credit=None, fee_paid=0, category_hint='PLN'),
            'none': parsed(reference='N1', event_type='expense', destination_wallet='EXTERNAL',
                           total_credit=None, fee_paid=0, category_hint=None),
            'transfer': parsed(reference='T1'),
        }
        with self.engine(parser=lambda r, registry: records[r['gmail_message_id']]) as e:
            e.ingest([row('pln'), row('none'), row('transfer')])
            payloads = {json.loads(x[0])['parsed']['reference']: json.loads(x[0])
                        for x in e.db.execute('SELECT payload FROM outbox')}
            # PLN has hint match
            self.assertEqual(payloads['P1']['components'][0]['category_source'], 'hint')
            self.assertEqual(payloads['P1']['components'][0]['category_status'], 'classified')
            # No hint, no category
            self.assertIsNone(payloads['N1']['components'][0]['category_source'])
            self.assertEqual(payloads['N1']['components'][0]['category_status'], 'unclassified')
            # Transfer has no category
            self.assertIsNone(payloads['T1']['components'][0]['category_source'])
            self.assertEqual(payloads['T1']['components'][0]['category_status'], 'unclassified')

    def test_reparse_retries_ownership_fee_endpoint_without_replaying_bound_evidence(self):
        values = {
            'source': parsed(eligible=False, validation_errors=['unresolved_source'], source_wallet='UNRESOLVED'),
            'destination': parsed(eligible=False, validation_errors=['unresolved_destination'], destination_wallet='UNRESOLVED'),
            'fee': parsed(fee_displayed=2500, fee_paid=None),
            'endpoint': parsed(source_wallet='UNRESOLVED'),
            'parser_error': None,
            'posted': parsed(reference='POSTED'),
            'bound': parsed(reference='BOUND'),
            'linked': parsed(reference='LINKED'),
            'bad_total': parsed(eligible=False, validation_errors=['total_debit_conflict']),
        }
        def initial(r, registry):
            p = values[r['gmail_message_id']]
            if p is None:
                raise ValueError('synthetic parser failure')
            return p
        with self.engine(parser=initial) as e:
            e.ingest([row(k) for k in values])
            e.ingest([row('archive')], archive=True)
            with e.db:
                # Exercise exclusions even when an old candidate carries a retry reason.
                e.db.execute("UPDATE candidates SET reason='parser_missing' WHERE message IN ('archive','bound','linked')")
                e.db.execute("UPDATE candidates SET event_id=NULL WHERE message='linked'")
                e.db.execute("UPDATE outbox SET state='sent'")
            before = e.status()['events']
            calls = []
            def fixed(r, registry):
                calls.append(r['gmail_message_id'])
                return parsed(reference=r['gmail_message_id'])
            e.parser = fixed
            e.reparse_pending()
            self.assertEqual(set(calls), {'source', 'destination', 'fee', 'endpoint', 'parser_error'})
            self.assertEqual(e.status()['events'], before + 5)
            self.assertEqual(e.db.execute("SELECT count(*) FROM outbox WHERE state='sent'").fetchone()[0], before)
            calls.clear()
            e.reparse_pending()
            self.assertEqual(calls, [])

    def test_reparse_includes_unknown_template(self):
        """Issue 5: reparse_pending must include 'unknown_template' for retry."""
        with self.engine(parser=lambda r, registry: parsed(validation_errors=['unknown_template'], eligible=False)) as e:
            e.ingest([row('unknown')])
            self.assertEqual(e.db.execute("SELECT reason FROM candidates WHERE message='unknown'").fetchone()[0], 'ineligible')
            # Now fix the parser
            e.parser = lambda r, registry: parsed()
            e.reparse_pending()
            # Should have re-parsed and now be ready
            self.assertEqual(e.status()['events'], 1)


if __name__ == '__main__':
    unittest.main()
