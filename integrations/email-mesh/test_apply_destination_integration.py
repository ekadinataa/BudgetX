"""Offline end-to-end regressions for apply_demo, without Auth/Firestore imports.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
    -s integrations/email-mesh \
    -p test_apply_destination_integration.py -v

Only the external publisher and whitelist adapter are replaced. The production
planner, CAS executor, locking, SQLite backups and readbacks execute unchanged.
Deterministic hooks model races; batches are atomic, snapshot bodies are copies,
transaction reads are version-checked, and retries have a finite bound.
"""
import copy
import importlib.util
import json
import os
import sqlite3
import tempfile
import types
import unittest
from functools import wraps
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name('apply_destination_demo.py')
SPEC = importlib.util.spec_from_file_location('_offline_apply_destination_demo', SCRIPT)
apply_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(apply_module)
PROJECT = 'budgetku-app-v1'
UID = 'VCqdnx9zvJVrZQSNp6gyGm6Zzhr2'
SCOPE = PROJECT + ':' + UID
BASE = 'users/' + UID
SECTIONS = {'Belanja': 'wants', 'Jasa': 'needs'}


class PreconditionFailed(RuntimeError):
    """A create/update_time guard rejected a write."""


class ReadConflict(RuntimeError):
    """A document in a transaction's read set changed before commit."""


class InjectedFailure(RuntimeError):
    """An explicit fault at a finite apply boundary."""


class Snapshot:
    def __init__(self, reference, body, update_time):
        self.reference = reference
        self.id = reference.id
        self.exists = body is not None
        self.update_time = update_time
        self._body = copy.deepcopy(body)

    def to_dict(self):
        return copy.deepcopy(self._body)


class Reference:
    def __init__(self, db, path):
        self.db = db
        self.path = path
        self.id = path.rsplit('/', 1)[-1]

    def get(self, transaction=None):
        return self.db.read(self, transaction)

    def create(self, body):
        self.db.commit_operations([('create', self, copy.deepcopy(body), None)])


class Collection:
    def __init__(self, db, path):
        self.db = db
        self.path = path

    def stream(self):
        prefix = self.path + '/'
        paths = sorted(p for p in self.db.docs if p.startswith(prefix)
                       and '/' not in p[len(prefix):])
        return iter([self.db.document(p).get() for p in paths])


class Batch:
    def __init__(self, db):
        self.db = db
        self.operations = []

    def create(self, ref, body):
        self.operations.append(('create', ref, copy.deepcopy(body), None))

    def update(self, ref, body, option=None):
        self.operations.append(('update', ref, copy.deepcopy(body), option))

    def commit(self):
        self.db.batch_calls += 1
        self.db.fire(self.db.before_batch, self.db.batch_calls)
        self.db.commit_operations(self.operations)
        self.db.batch_sizes.append(len(self.operations))


class Transaction(Batch):
    def __init__(self, db):
        super().__init__(db)
        self.read_versions = {}

    def commit(self):
        self.db.transaction_commits += 1
        self.db.fire(self.db.before_transaction_commit, self.db.transaction_commits)
        for path, version in self.read_versions.items():
            if self.db.version(path) != version:
                raise ReadConflict(path)
        self.db.commit_operations(self.operations)


class MemoryFirestore:
    """Finite, versioned Firestore double, including atomic CAS and read conflicts."""
    def __init__(self):
        self.docs = {}
        self.clock = 0
        self.writes = []
        self.reads = []
        self.get_all_calls = []
        self.batch_calls = 0
        self.batch_sizes = []
        self.transaction_calls = 0
        self.transaction_commits = 0
        self.before_batch = {}
        self.before_transaction = {}
        self.before_transaction_commit = {}
        self.after_transaction = {}
        self.operations_seen = 0

    def tick(self):
        self.operations_seen += 1
        if self.operations_seen > 20000:
            raise AssertionError('offline fake operation budget exhausted')

    def document(self, path):
        if not path.startswith(BASE + '/') or len(path.split('/')) != 4:
            raise AssertionError('out-of-demo document path: ' + path)
        return Reference(self, path)

    def collection(self, path):
        if not path.startswith(BASE + '/') or len(path.split('/')) != 3:
            raise AssertionError('out-of-demo collection path: ' + path)
        return Collection(self, path)

    def version(self, path):
        return self.docs[path][1] if path in self.docs else None

    def seed(self, collection, ident, body):
        path = BASE + '/' + collection + '/' + ident
        self.document(path)  # Enforce the same namespace on fixture setup.
        self.clock += 1
        self.docs[path] = (copy.deepcopy(body), self.clock)
        return path

    def mutate(self, path, **fields):
        body = self.body(path)
        body.update(copy.deepcopy(fields))
        self.clock += 1
        self.docs[path] = (body, self.clock)

    def body(self, path):
        return copy.deepcopy(self.docs[path][0])

    def read(self, ref, transaction=None):
        self.tick()
        self.reads.append((ref.path, transaction is not None))
        if transaction is not None:
            if transaction.operations:
                raise AssertionError('Firestore transaction read after write')
            transaction.read_versions[ref.path] = self.version(ref.path)
        body, version = self.docs.get(ref.path, (None, None))
        return Snapshot(ref, body, version)

    def get_all(self, refs):
        refs = list(refs)
        self.get_all_calls.append([r.path for r in refs])
        return iter([r.get() for r in refs])

    def batch(self):
        return Batch(self)

    def transaction(self):
        return Transaction(self)

    def write_option(self, *, last_update_time):
        return {'last_update_time': last_update_time}

    def fire(self, hooks, index):
        hook = hooks.pop(index, None)
        if hook:
            hook()

    def commit_operations(self, operations):
        self.tick()
        # Prevalidate the entire batch: no partial batch writes on a CAS failure.
        seen = set()
        for kind, ref, body, option in operations:
            if ref.path in seen:
                raise AssertionError('duplicate write target in fake batch')
            seen.add(ref.path)
            if kind == 'create' and ref.path in self.docs:
                raise PreconditionFailed('create already exists: ' + ref.path)
            if kind == 'update' and ref.path not in self.docs:
                raise PreconditionFailed('update missing: ' + ref.path)
            if option is not None and self.version(ref.path) != option['last_update_time']:
                raise PreconditionFailed('update_time changed: ' + ref.path)
        for kind, ref, body, option in operations:
            new = self.body(ref.path) if kind == 'update' else {}
            new.update(copy.deepcopy(body))
            self.clock += 1
            self.docs[ref.path] = (new, self.clock)
            self.writes.append((kind, ref.path, copy.deepcopy(body), copy.deepcopy(option)))

    def runner(self, fn):
        @wraps(fn)
        def run(transaction):
            self.transaction_calls += 1
            call = self.transaction_calls
            self.fire(self.before_transaction, call)
            for attempt in range(3):
                current = transaction if attempt == 0 else self.transaction()
                try:
                    value = fn(current)
                    current.commit()
                except ReadConflict:
                    if attempt == 2:
                        raise
                    continue
                self.fire(self.after_transaction, call)
                return value
        return run


class ApplyDestinationIntegrationTests(unittest.TestCase):
    def setUp(self):
        # Keep ledger/locks/backups in the caller's temporary directory (TMPDIR).
        scratch = Path(tempfile.gettempdir())
        scratch.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='apply-integration-', dir=scratch)
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.config = {'project_id': PROJECT, 'uid': UID, 'email': 'demo@budgetx.id',
                       'db_path': str(self.root / 'ledger.sqlite3'),
                       'destination_whitelist_path': str(self.root / 'whitelist.sqlite3')}
        for key in ('db_path', 'destination_whitelist_path'):
            with sqlite3.connect(self.config[key]) as db:
                db.execute('CREATE TABLE fixture (value TEXT NOT NULL)')
                db.execute('INSERT INTO fixture VALUES (?)', ('offline-' + key,))
        self.db = MemoryFirestore()
        self.decisions = {}
        self.observations = []
        self.publisher_calls = []
        owner = self

        class Publisher:
            def __init__(self, config):
                # Identity gate is not under test; refuse any non-demo fixture.
                if (config['project_id'], config['uid'], config['email']) != (
                        PROJECT, UID, 'demo@budgetx.id'):
                    raise AssertionError('fixture must use the exact demo identity')
                owner.publisher_calls.append(copy.deepcopy(config))
                self.db = owner.db
                self.base = BASE
                self.runner = owner.db.runner

        class WhitelistAdapter:
            def __init__(self, path, scope):
                if Path(path) != owner.root / 'whitelist.sqlite3' or scope != SCOPE:
                    raise AssertionError('wrong offline whitelist path/scope')

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def lookup(self, destination):
                return copy.deepcopy(owner.decisions.get(apply_module.decision_id(destination)))

            def records(self):
                return copy.deepcopy(list(owner.decisions.values()))

            def observe(self, destination, **kwargs):
                owner.observations.append((destination, copy.deepcopy(kwargs)))

        mesh = types.ModuleType('mesh')
        mesh.FirestorePublisher = Publisher
        whitelist = types.ModuleType('destination_whitelist')
        whitelist.DestinationWhitelist = WhitelistAdapter
        whitelist.CATEGORY_SECTIONS = dict(SECTIONS)
        whitelist.extract_destination = lambda parsed: parsed.get('destination_identity')
        self.dependencies = patch.dict('sys.modules', {
            'mesh': mesh, 'destination_whitelist': whitelist})
        self.dependencies.start()
        self.addCleanup(self.dependencies.stop)
        self.db.seed('wallets', 'bank', {'balance': 1000000, 'heldAmount': 9500, 'name': 'Demo bank'})
        self.db.seed('wallets', 'cash', {'balance': 500000, 'heldAmount': 0})
        self.db.seed('mesh_state', 'checkpoint', {'checkpoint_at': '2026-10-01T00:00:00Z', 'cursor': 7})
        self.seed_catalog()

    def seed_catalog(self):
        self.db.seed('categories', 'shop', {'name': 'Belanja', 'section': 'wants',
                                          'color': '#007aff', 'icon': '🛍️'})
        self.db.seed('categories', 'service', {'name': 'Jasa', 'section': 'needs',
                                             'color': '#007aff', 'icon': '🏷️'})

    def decision(self, destination='Synthetic shop', category='Belanja', tag='Retail', source='admin', **extra):
        body = dict(destination=destination, category=category, tag=tag, source=source, **extra)
        self.decisions[apply_module.decision_id(destination)] = body
        return copy.deepcopy(body)

    def remote(self, decision, **extra):
        body = dict(decision, scope=SCOPE, **extra)
        return self.db.seed('destination_whitelist', apply_module.decision_id(decision['destination']), body)

    def event(self, char='a', destination='Synthetic shop', **tx_fields):
        eid = char * 64
        tx = {'type': 'expense', 'categoryId': None, 'category_source': 'rule',
              'category_status': 'unclassified', 'tags': ['email-mesh', 'personal'],
              'walletId': 'bank', 'toWalletId': None, 'amount': 9500,
              'date': '2026-10-01', 'note': 'Synthetic receipt',
              'mesh': {'eventId': eid, 'scope': SCOPE, 'component': 0}}
        tx.update(copy.deepcopy(tx_fields))
        tid = 'demo-mesh-' + eid + '-0'
        path = self.db.seed('transactions', tid, tx)
        self.db.seed('mesh_events', 'demo-' + eid, {
            'event_id': eid, 'parsed': {'destination_identity': destination,
                                       'event_type': 'merchant_payment',
                                       'provenance': {'provider': 'synthetic'}},
            'movements': [{'wallet': 'bank', 'field': 'balance', 'delta': -9500}],
            'published_at': '2026-10-01T10:00:00Z'})
        return eid, path

    def apply(self, **kwargs):
        return apply_module.apply_demo(self.config, **kwargs)

    def state(self):
        return {path: copy.deepcopy(body) for path, (body, _) in self.db.docs.items()}

    def assert_finance_unchanged(self, before):
        after = self.state()
        for path, body in before.items():
            collection = path.split('/')[-2]
            if collection in ('wallets', 'mesh_events', 'mesh_state'):
                self.assertEqual(after[path], body, path)
            if collection == 'transactions':
                self.assertEqual({k: v for k, v in after[path].items() if k not in apply_module.PATCH_FIELDS},
                                 {k: v for k, v in body.items() if k not in apply_module.PATCH_FIELDS}, path)
        self.assertEqual({p for p in before if '/transactions/' in p},
                         {p for p in after if '/transactions/' in p})
        for kind, path, fields, option in self.db.writes:
            self.assertIn(path.split('/')[-2], ('transactions', 'categories', 'destination_whitelist'))
            if '/transactions/' in path:
                self.assertEqual(kind, 'update')
                self.assertLessEqual(set(fields), apply_module.PATCH_FIELDS)
                self.assertIsNotNone(option, 'transaction write must have update_time CAS')

    def assert_backup(self, result, before, completed=True):
        bundle = Path(result['backup'])
        self.assertTrue(bundle.is_relative_to(self.root))
        expected = {'cloud-before.json', 'whitelist-before.json', 'plan.json',
                    'config-before.json', 'ledger.sqlite3', 'whitelist.sqlite3'}
        if completed:
            expected.add('result.json')
        self.assertEqual({p.name for p in bundle.iterdir()}, expected)
        for path in bundle.iterdir():
            self.assertEqual(path.stat().st_mode & 0o777, 0o600, path.name)
        with (bundle / 'cloud-before.json').open() as f:
            saved = json.load(f)
        for collection in ('wallets', 'categories', 'transactions', 'mesh_events', 'mesh_state'):
            self.assertEqual(saved[collection], {
                p.rsplit('/', 1)[-1]: body for p, body in before.items()
                if p.split('/')[-2] == collection})
        for filename, key in (('ledger.sqlite3', 'db_path'),
                              ('whitelist.sqlite3', 'destination_whitelist_path')):
            with sqlite3.connect(bundle / filename) as db:
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
                self.assertEqual(db.execute('SELECT value FROM fixture').fetchone()[0], 'offline-' + key)

    def test_dry_run_plans_real_execution_without_cloud_or_sqlite_writes(self):
        self.decision()
        _, path = self.event()
        before = self.state()
        local = {p.name: p.read_bytes() for p in self.root.glob('*.sqlite3')}
        result = self.apply()
        self.assertEqual(result['transaction_updates'], 1)
        self.assertEqual(result['whitelist_writes'], 1)
        self.assertEqual(result['patches'][0]['id'], path.rsplit('/', 1)[-1])
        self.assertEqual(self.state(), before)
        self.assertEqual(self.db.writes, [])
        self.assertEqual(self.observations, [])
        self.assertFalse((self.root / 'category-backups').exists())
        self.assertEqual({p.name: p.read_bytes() for p in self.root.glob('*.sqlite3')}, local)

    def test_apply_writes_exact_fields_preserves_money_creates_private_backups_rerun_noop(self):
        self.decision()
        _, path = self.event(tags=['email-mesh', 'personal', 'Old'], destination_tag='Old', destination_source='llm')
        before = self.state()
        result = self.apply(apply=True)
        self.assertEqual(self.db.body(path)['categoryId'], 'shop')
        self.assertEqual(self.db.body(path)['tags'], ['email-mesh', 'personal', 'Retail'])
        self.assertTrue(all(result['verified'].values()))
        self.assert_finance_unchanged(before)
        self.assert_backup(result, before)
        count = len(self.db.writes)
        rerun = self.apply(apply=True)
        self.assertEqual(rerun['transaction_updates'], 0)
        self.assertEqual(rerun['whitelist_writes'], 0)
        self.assertEqual(rerun['categories_added'], 0)
        self.assertIsNone(rerun['backup'])
        self.assertEqual(len(self.db.writes), count)

    def test_remote_admin_overrides_local_llm_with_mirror_disabled(self):
        local = self.decision(source='llm')
        remote_path = self.remote(dict(local, category='Jasa', tag='Professional', source='admin'))
        _, path = self.event()
        before = self.state()
        result = self.apply(apply=True, mirror=False)
        self.assertEqual(result['whitelist_writes'], 0)
        self.assertEqual(self.db.body(path)['categoryId'], 'service')
        self.assertEqual(self.db.body(path)['destination_source'], 'admin')
        self.assertEqual(self.db.body(path)['destination_tag'], 'Professional')
        self.assertEqual(self.db.body(remote_path), before[remote_path])
        self.assert_finance_unchanged(before)

    def test_remote_admin_with_no_local_record_is_used_not_enqueued_as_unknown(self):
        self.remote({'destination': 'Synthetic shop', 'category': 'Jasa', 'tag': 'Professional', 'source': 'admin'})
        _, path = self.event()
        result = self.apply(apply=True, mirror=False, observe=True)
        self.assertEqual(result['unknown_destinations'], [])
        self.assertEqual(self.observations, [])
        self.assertEqual(self.db.body(path)['categoryId'], 'service')

    def test_remote_admin_is_not_downgraded_by_mirroring_local_llm(self):
        local = self.decision(source='llm')
        remote_path = self.remote(dict(local, category='Jasa', source='admin'))
        _, path = self.event()
        old = self.db.body(remote_path)
        result = self.apply(apply=True)
        self.assertEqual(result['whitelist_writes'], 0)
        self.assertEqual(self.db.body(remote_path), old)
        self.assertEqual(self.db.body(path)['categoryId'], 'service')

    def test_mirror_update_preserves_unmanaged_extras_and_rerun_does_not_rewrite(self):
        d = self.decision(verification_status='verified', confidence=0.9)
        remote_path = self.remote(dict(d, tag='Old'), legacy={'keep': True}, custom_owner='human')
        self.event()
        before = self.state()
        result = self.apply(apply=True)
        self.assertEqual(result['whitelist_writes'], 1)
        self.assertEqual(self.db.body(remote_path), dict(d, scope=SCOPE, legacy={'keep': True}, custom_owner='human'))
        self.assert_finance_unchanged(before)
        self.assertEqual(self.apply(apply=True)['whitelist_writes'], 0)

    def test_mirror_matching_managed_fields_with_extras_is_already_noop(self):
        d = self.decision()
        path = self.remote(d, legacy_field='preserved')
        old = self.db.body(path)
        result = self.apply(apply=True)
        self.assertEqual(result['whitelist_writes'], 0)
        self.assertEqual(self.db.writes, [])
        self.assertEqual(self.db.body(path), old)
        self.assertIsNone(result['backup'])

    def test_destination_filter_limits_transaction_updates_not_just_mirror(self):
        self.decision('Selected shop')
        self.decision('Unselected shop', category='Jasa')
        _, selected = self.event('a', 'Selected shop')
        _, other = self.event('b', 'Unselected shop')
        before = self.state()
        result = self.apply(apply=True, destinations=['  SELECTED   SHOP  '])
        self.assertEqual(result['transaction_updates'], 1)
        self.assertEqual(result['whitelist_writes'], 1)
        self.assertEqual(self.db.body(selected)['categoryId'], 'shop')
        self.assertEqual(self.db.body(other), before[other])
        self.assertNotIn(BASE + '/destination_whitelist/' + apply_module.decision_id('Unselected shop'), self.db.docs)
        self.assert_finance_unchanged(before)

    def test_targeted_event_ids_only_fetch_and_modify_exact_primary_and_marker(self):
        self.decision()
        eid, selected = self.event('a')
        _, other = self.event('b')
        before = self.state()
        result = self.apply(apply=True, event_ids=[eid], mirror=False)
        self.assertEqual(result['transaction_updates'], 1)
        self.assertEqual(self.db.body(selected)['categoryId'], 'shop')
        self.assertEqual(self.db.body(other), before[other])
        self.assertIn([selected], self.db.get_all_calls)
        self.assertIn([BASE + '/mesh_events/demo-' + eid], self.db.get_all_calls)
        self.assert_finance_unchanged(before)

    def test_invalid_event_id_rejected_before_any_writes(self):
        self.decision()
        self.event()
        for bad in ('A' * 64, 'a' * 63, '../transaction', 'z' * 64):
            with self.subTest(event_id=bad), self.assertRaisesRegex(ValueError, 'invalid event IDs'):
                self.apply(apply=True, event_ids=[bad])
        self.assertEqual(self.db.writes, [])
        self.assertFalse((self.root / 'category-backups').exists())

    def test_empty_destination_selection_is_noop(self):
        self.decision()
        self.event()
        result = self.apply(apply=True, destinations=[])
        self.assertEqual(result['transaction_updates'], 0)
        self.assertEqual(result['whitelist_writes'], 0)
        self.assertEqual(self.db.writes, [])

    def test_empty_optional_tag_removes_old_managed_tag_without_appending_empty_string(self):
        self.decision(tag='')
        _, path = self.event(tags=['email-mesh', 'personal', 'Old'], destination_tag='Old', destination_source='llm')
        self.apply(apply=True)
        self.assertEqual(self.db.body(path)['tags'], ['email-mesh', 'personal'])
        self.assertEqual(self.db.body(path)['destination_tag'], '')
        self.assertNotIn('', self.db.body(path)['tags'])

    def test_fee_manual_legacy_other_scope_income_brizzi_missing_marker_are_untouched(self):
        self.decision()
        eid, primary = self.event('a')
        fee = self.db.seed('transactions', 'demo-mesh-' + eid + '-1', dict(self.db.body(primary), amount=1000))
        _, manual = self.event('b', category_source='manual', categoryId='service')
        _, foreign = self.event('c', mesh={'eventId': 'c' * 64, 'scope': 'other:uid'})
        _, income = self.event('d', type='income')
        _, brizzi = self.event('e', 'BRIZZI • 1234000012340001')
        _, missing = self.event('f')
        del self.db.docs[BASE + '/mesh_events/demo-' + 'f' * 64]
        legacy = self.db.seed('transactions', 'legacy', dict(self.db.body(primary)))
        before = self.state()
        result = self.apply(apply=True)
        self.assertEqual(result['transaction_updates'], 1)
        for path in (fee, manual, foreign, income, brizzi, missing, legacy):
            self.assertEqual(self.db.body(path), before[path], path)
        self.assert_finance_unchanged(before)

    def test_transfer_gets_metadata_but_never_expense_category_or_financial_conversion(self):
        self.decision()
        _, path = self.event(type='transfer', categoryId='service', toWalletId='cash')
        before = self.state()
        self.apply(apply=True)
        self.assertIsNone(self.db.body(path)['categoryId'])
        self.assertEqual(self.db.body(path)['category_status'], 'unclassified')
        self.assertEqual(self.db.body(path)['destination_category'], 'Belanja')
        self.assertEqual(self.db.body(path)['type'], 'transfer')
        self.assert_finance_unchanged(before)

    def test_unknown_observation_is_explicit_and_has_no_financial_writes(self):
        eid, path = self.event(destination='Synthetic unknown')
        before = self.state()
        plain = self.apply(mirror=False)
        self.assertEqual(plain['unknown_destinations'], ['Synthetic unknown'])
        self.assertEqual(self.observations, [])
        result = self.apply(apply=True, mirror=False, observe=True)
        self.assertEqual(result['transaction_updates'], 0)
        self.assertEqual(self.observations, [('Synthetic unknown', {
            'provider': 'synthetic', 'event_id': eid, 'context': {'event_type': 'merchant_payment'}})])
        self.assertEqual(self.db.body(path), before[path])
        self.assertEqual(self.db.writes, [])

    def test_manual_edit_after_planning_aborts_without_overwrite(self):
        self.decision()
        _, path = self.event()
        before = self.state()
        self.db.before_transaction[1] = lambda: self.db.mutate(
            path, category_source='manual', categoryId='service', tags=['human'])
        with self.assertRaisesRegex(ValueError, 'transaction changed after plan|manual edit protected'):
            self.apply(apply=True, mirror=False)
        self.assertEqual(self.db.body(path)['category_source'], 'manual')
        self.assertEqual(self.db.body(path)['tags'], ['human'])
        self.assertEqual(self.db.writes, [])
        self.assert_finance_unchanged(before)
        bundles = list((self.root / 'category-backups').iterdir())
        self.assertEqual(len(bundles), 1)
        self.assert_backup({'backup': str(bundles[0])}, before, completed=False)
        result = self.apply(apply=True, mirror=False)
        self.assertEqual(result['transaction_updates'], 0)

    def test_nonmanual_user_tag_edit_after_planning_aborts_by_snapshot_version(self):
        self.decision()
        _, path = self.event()
        self.db.before_transaction[1] = lambda: self.db.mutate(path, tags=['human-new-tag'])
        with self.assertRaisesRegex(ValueError, 'transaction changed after plan'):
            self.apply(apply=True, mirror=False)
        self.assertEqual(self.db.body(path)['tags'], ['human-new-tag'])
        self.assertEqual(self.db.writes, [])
        self.apply(apply=True, mirror=False)
        self.assertEqual(self.db.body(path)['tags'], ['human-new-tag', 'Retail'])

    def test_transaction_mutation_after_read_is_not_lost_at_commit(self):
        self.decision()
        _, path = self.event()
        self.db.before_transaction_commit[1] = lambda: self.db.mutate(
            path, category_source='manual', categoryId='service', tags=['manual-wins'])
        with self.assertRaisesRegex(ValueError, 'transaction changed after plan'):
            self.apply(apply=True, mirror=False)
        self.assertEqual(self.db.body(path)['tags'], ['manual-wins'])
        self.assertEqual(self.db.writes, [])
        self.assertEqual(self.db.transaction_commits, 1)

    def test_category_reassigned_after_plan_is_rejected_inside_same_transaction(self):
        self.decision()
        _, path = self.event()
        cat_path = BASE + '/categories/shop'
        before_tx = self.db.body(path)
        self.db.before_transaction[1] = lambda: self.db.mutate(cat_path, section='income')
        with self.assertRaisesRegex(ValueError, 'category changed or incompatible'):
            self.apply(apply=True, mirror=False)
        self.assertEqual(self.db.body(path), before_tx)
        self.assertIn((cat_path, True), self.db.reads)
        self.assertEqual(self.db.writes, [])

    def test_category_renamed_after_transaction_read_causes_retry_then_rejection(self):
        self.decision()
        _, path = self.event()
        cat_path = BASE + '/categories/shop'
        old_tx = self.db.body(path)
        self.db.before_transaction_commit[1] = lambda: self.db.mutate(cat_path, name='Unexpected name')
        with self.assertRaisesRegex(ValueError, 'category changed or incompatible'):
            self.apply(apply=True, mirror=False)
        self.assertEqual(self.db.body(path), old_tx)
        self.assertEqual(self.db.reads.count((cat_path, True)), 2)
        self.assertEqual(self.db.writes, [])

    def test_cloud_admin_created_after_plan_protects_transaction_against_llm(self):
        local = self.decision(source='llm')
        _, path = self.event()
        old_tx = self.db.body(path)
        self.db.before_transaction[1] = lambda: self.remote(dict(local, source='admin', category='Jasa'))
        with self.assertRaisesRegex(ValueError, 'cloud admin decision protected'):
            self.apply(apply=True, mirror=False)
        self.assertEqual(self.db.body(path), old_tx)
        self.assertEqual(self.db.writes, [])

    def test_cloud_admin_created_after_missing_decision_read_is_detected_at_commit(self):
        local = self.decision(source='llm')
        _, path = self.event()
        old_tx = self.db.body(path)
        self.db.before_transaction_commit[1] = lambda: self.remote(dict(local, source='admin', category='Jasa'))
        with self.assertRaisesRegex(ValueError, 'cloud admin decision protected'):
            self.apply(apply=True, mirror=False)
        self.assertEqual(self.db.body(path), old_tx)
        self.assertEqual(self.db.writes, [])

    def test_mirror_cas_rejects_late_remote_admin_and_rerun_uses_admin(self):
        local = self.decision(source='llm')
        remote_path = self.remote(dict(local, tag='Old'))
        _, path = self.event()
        before = self.state()
        self.db.before_batch[1] = lambda: self.db.mutate(
            remote_path, source='admin', category='Jasa', tag='Human')
        with self.assertRaisesRegex(PreconditionFailed, 'update_time changed'):
            self.apply(apply=True)
        self.assertEqual(self.db.body(path), before[path])
        self.assertEqual(self.db.body(remote_path)['source'], 'admin')
        self.assertEqual(self.db.writes, [])
        recovered = self.apply(apply=True)
        self.assertEqual(recovered['whitelist_writes'], 0)
        self.assertEqual(self.db.body(path)['categoryId'], 'service')
        self.assertEqual(self.db.body(path)['tags'], ['email-mesh', 'personal', 'Human'])
        self.assert_finance_unchanged(before)

    def test_mirror_create_guard_preserves_admin_created_after_plan(self):
        local = self.decision(source='llm')
        _, path = self.event()
        before = self.state()
        self.db.before_batch[1] = lambda: self.remote(dict(local, source='admin', category='Jasa'))
        with self.assertRaisesRegex(PreconditionFailed, 'create already exists'):
            self.apply(apply=True)
        self.assertEqual(self.db.body(path), before[path])
        self.assertEqual(self.db.writes, [])
        self.apply(apply=True)
        self.assertEqual(self.db.body(path)['categoryId'], 'service')
        self.assert_finance_unchanged(before)

    def test_partial_transaction_progress_recovers_without_replaying_money_or_tags(self):
        self.decision()
        _, first = self.event('a')
        _, second = self.event('b')
        before = self.state()
        def fail():
            raise InjectedFailure('second transaction interrupted')
        self.db.before_transaction[2] = fail
        with self.assertRaisesRegex(InjectedFailure, 'second transaction interrupted'):
            self.apply(apply=True)
        self.assertEqual(self.db.body(first)['categoryId'], 'shop')
        self.assertEqual(self.db.body(second), before[second])
        first_version = self.db.version(first)
        first_bundles = list((self.root / 'category-backups').iterdir())
        self.assertEqual(len(first_bundles), 1)
        self.assert_backup({'backup': str(first_bundles[0])}, before, completed=False)
        result = self.apply(apply=True)
        self.assertEqual(result['transaction_updates'], 1)
        self.assertEqual(result['whitelist_writes'], 0)
        self.assertEqual(self.db.version(first), first_version)
        self.assertEqual(self.db.body(second)['tags'].count('Retail'), 1)
        self.assertEqual(len(list((self.root / 'category-backups').iterdir())), 2)
        self.assert_finance_unchanged(before)
        self.assertEqual(self.apply(apply=True)['transaction_updates'], 0)

    def test_partial_mirror_batch_progress_recovers_only_missing_batch(self):
        for i in range(301):
            self.decision('Synthetic destination %03d' % i)
        _, tx = self.event(destination='Synthetic destination 300')
        before = self.state()
        def fail():
            raise InjectedFailure('second mirror batch interrupted')
        self.db.before_batch[2] = fail
        with self.assertRaisesRegex(InjectedFailure, 'second mirror batch interrupted'):
            self.apply(apply=True)
        self.assertEqual(self.db.batch_sizes, [300])
        self.assertEqual(len([p for p in self.db.docs if '/destination_whitelist/' in p]), 300)
        self.assertEqual(self.db.body(tx), before[tx])
        result = self.apply(apply=True)
        self.assertEqual(result['whitelist_writes'], 1)
        self.assertEqual(result['transaction_updates'], 1)
        self.assertEqual(self.db.batch_sizes, [300, 1])
        self.assertEqual(len([p for p in self.db.docs if '/destination_whitelist/' in p]), 301)
        self.assert_finance_unchanged(before)
        self.assertEqual(self.apply(apply=True)['whitelist_writes'], 0)

    def test_category_creation_then_interruption_recovers_existing_taxonomy_without_duplicate(self):
        del self.db.docs[BASE + '/categories/shop']
        self.decision()
        _, tx = self.event()
        before = self.state()
        def fail():
            raise InjectedFailure('after category creation')
        self.db.before_batch[1] = fail
        with self.assertRaisesRegex(InjectedFailure, 'after category creation'):
            self.apply(apply=True)
        created = [p for kind, p, body, option in self.db.writes if '/categories/' in p]
        self.assertEqual(len(created), 1)
        self.assertEqual(self.db.body(tx), before[tx])
        category_version = self.db.version(created[0])
        result = self.apply(apply=True)
        self.assertEqual(result['categories_added'], 0)
        self.assertEqual(self.db.body(tx)['categoryId'], created[0].rsplit('/', 1)[-1])
        self.assertEqual(self.db.version(created[0]), category_version)
        self.assert_finance_unchanged(before)

    def test_ambiguous_taxonomy_fails_before_any_external_writes(self):
        self.db.seed('categories', 'duplicate', {'name': 'Belanja', 'section': 'needs', 'color': '#007aff'})
        self.decision()
        self.event()
        with self.assertRaisesRegex(ValueError, 'ambiguous taxonomy category'):
            self.apply(apply=True)
        self.assertEqual(self.db.writes, [])
        self.assertFalse((self.root / 'category-backups').exists())

    def test_financial_field_corruption_after_write_is_not_reported_as_verified(self):
        self.decision()
        _, tx = self.event()
        self.db.after_transaction[1] = lambda: self.db.mutate(tx, amount=999999)
        with self.assertRaisesRegex(RuntimeError, 'concurrent/unexpected transaction fields changed'):
            self.apply(apply=True, mirror=False)
        bundles = list((self.root / 'category-backups').iterdir())
        self.assertEqual(len(bundles), 1)
        self.assertFalse((bundles[0] / 'result.json').exists())

    def test_patch_field_corruption_after_write_fails_exact_transaction_readback(self):
        self.decision()
        _, tx = self.event()
        self.db.after_transaction[1] = lambda: self.db.mutate(tx, categoryId='service')
        with self.assertRaisesRegex(RuntimeError, 'transaction patch readback mismatch'):
            self.apply(apply=True, mirror=False)
        bundles = list((self.root / 'category-backups').iterdir())
        self.assertFalse((bundles[0] / 'result.json').exists())

    def test_new_mirror_extras_after_write_do_not_fail_managed_readback(self):
        decision = self.decision()
        self.event()
        remote_path = BASE + '/destination_whitelist/' + apply_module.decision_id(decision['destination'])
        self.db.after_transaction[1] = lambda: self.db.mutate(remote_path, human_metadata={'keep': True})
        result = self.apply(apply=True)
        self.assertTrue(result['verified']['readback'])
        self.assertEqual(self.db.body(remote_path)['human_metadata'], {'keep': True})
        self.assertEqual(self.apply(apply=True)['whitelist_writes'], 0)

    def test_mirror_managed_field_corruption_fails_readback(self):
        decision = self.decision()
        self.event()
        remote_path = BASE + '/destination_whitelist/' + apply_module.decision_id(decision['destination'])
        self.db.after_transaction[1] = lambda: self.db.mutate(remote_path, tag='Unexpected tag')
        with self.assertRaisesRegex(RuntimeError, 'whitelist readback mismatch'):
            self.apply(apply=True)
        bundles = list((self.root / 'category-backups').iterdir())
        self.assertFalse((bundles[0] / 'result.json').exists())

    def test_marker_corruption_after_write_is_not_reported_as_verified(self):
        self.decision()
        eid, _ = self.event()
        marker_path = BASE + '/mesh_events/demo-' + eid
        self.db.after_transaction[1] = lambda: self.db.mutate(marker_path, movements=[])
        with self.assertRaisesRegex(RuntimeError, 'financial marker changed'):
            self.apply(apply=True, mirror=False)
        bundles = list((self.root / 'category-backups').iterdir())
        self.assertFalse((bundles[0] / 'result.json').exists())

    def test_checkpoint_corruption_after_write_is_not_reported_as_verified(self):
        self.decision()
        self.event()
        self.db.after_transaction[1] = lambda: self.db.mutate(BASE + '/mesh_state/checkpoint', cursor=999)
        with self.assertRaisesRegex(RuntimeError, 'financial/checkpoint invariant changed: mesh_state'):
            self.apply(apply=True, mirror=False)
        bundles = list((self.root / 'category-backups').iterdir())
        self.assertFalse((bundles[0] / 'result.json').exists())

    def test_deleted_target_after_planning_is_not_recreated(self):
        self.decision()
        _, tx = self.event()
        self.db.before_transaction[1] = lambda: self.db.docs.pop(tx)
        with self.assertRaisesRegex(ValueError, 'transaction changed after plan'):
            self.apply(apply=True, mirror=False)
        self.assertNotIn(tx, self.db.docs)
        self.assertEqual(self.db.writes, [])

    def test_wallet_corruption_after_write_is_not_reported_as_verified(self):
        self.decision()
        self.event()
        self.db.after_transaction[1] = lambda: self.db.mutate(BASE + '/wallets/bank', balance=0)
        with self.assertRaisesRegex(RuntimeError, 'financial/checkpoint invariant changed: wallets'):
            self.apply(apply=True, mirror=False)
        bundles = list((self.root / 'category-backups').iterdir())
        self.assertFalse((bundles[0] / 'result.json').exists())


if __name__ == '__main__':
    unittest.main()
