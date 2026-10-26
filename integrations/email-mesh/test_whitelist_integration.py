"""Synthetic plan/ledger regressions; no network, credentials or cloud writes."""
import json
import tempfile
import unittest
from pathlib import Path

from mesh import Engine
from test_mesh import config, parsed, row
from destination_whitelist import DestinationWhitelist


class WhitelistIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.cfg = config(self.root)
        self.cfg['destination_whitelist_path'] = str(self.root / 'whitelist.sqlite3')
        self.scope = self.cfg['project_id'] + ':' + self.cfg['uid']

    def tearDown(self):
        self.temp.cleanup()

    def expense(self, **changes):
        p = parsed(event_type='electricity_payment', destination_wallet='EXTERNAL',
                   destination_identity='Synthetic Unknown • 001', total_credit=None,
                   category_hint='PLN', raw_fields={'merchant': 'Synthetic Unknown • 001'})
        p.update(changes)
        return p

    def seed(self, destination, category, tag):
        with DestinationWhitelist(self.cfg['destination_whitelist_path'], self.scope) as w:
            w.decide(destination, category, tag)

    def test_unknown_queues_actual_event_and_no_keyword_fallback_restart_no_replay(self):
        p = self.expense()
        with Engine(self.cfg, parser=lambda r, registry: p) as e:
            e.ingest([row('synthetic')])
            payload = json.loads(e.db.execute('SELECT payload FROM outbox').fetchone()[0])
            self.assertIsNone(payload['components'][0]['categoryId'])
            self.assertEqual(payload['movements'], [{'wallet': 'wb', 'field': 'balance', 'delta': -100000}])
            eid = payload['event_id']
        with DestinationWhitelist(self.cfg['destination_whitelist_path'], self.scope) as w:
            q = w.pending()[0]
            self.assertEqual(q['event_ids'], [eid])
            self.assertNotIn('note', q['context'])
        with Engine(self.cfg, parser=lambda r, registry: p) as e:
            e.ingest([row('synthetic'), row('second-receipt')])
            self.assertEqual(e.status()['events'], 1)
            self.assertEqual(e.status()['movements'], 1)
        with DestinationWhitelist(self.cfg['destination_whitelist_path'], self.scope) as w:
            self.assertEqual(len(w.pending()), 1)

    def test_admin_category_authoritative_tag_merge_fee_isolated_movements_unchanged(self):
        self.seed('Synthetic Merchant', 'Belanja', 'Perlu review')
        self.cfg['categories'].append({'id': 'current-retail', 'name': 'Belanja', 'section': 'wants'})
        p = self.expense(raw_fields={'Nama Merchant': 'Synthetic Merchant'},
                         destination_identity='Generic provider payment', tags=['user-tag', 'email-mesh', 'Perlu review'],
                         fee_paid=1000, fee_displayed=1000, total_debit=101000)
        with Engine(self.cfg) as e:
            payload = e.plan(p, 'a' * 64)
            principal, fee = payload['components']
            self.assertEqual(principal['categoryId'], 'current-retail')
            self.assertEqual(principal['destination_category'], 'Belanja')
            self.assertEqual(principal['destination_tag'], 'Perlu review')
            self.assertEqual(principal['destination_name'], 'Synthetic Merchant')
            self.assertEqual(principal['destination_source'], 'admin')
            self.assertEqual(principal['category_source'], 'whitelist_admin')
            self.assertEqual(principal['tags'], ['email-mesh', 'user-tag', 'Perlu review'])
            self.assertIsNone(fee['categoryId'])
            self.assertEqual(fee['tags'], ['email-mesh', 'user-tag'])
            self.assertNotIn('destination_category', fee)
            self.assertNotIn('destination_tag', fee)
        legacy = dict(self.cfg)
        del legacy['destination_whitelist_path']
        with Engine(legacy) as e:
            self.assertEqual(payload['movements'], e.plan(p, 'a' * 64)['movements'])

    def test_catalog_missing_ambiguous_wrong_section_stays_unclassified(self):
        self.seed('Synthetic Merchant', 'Belanja', 'Retail')
        for catalog in ([], [{'id': 'wrong', 'name': 'Belanja', 'section': 'income'}],
                        [{'id': 'a', 'name': 'Belanja', 'section': 'wants'}, {'id': 'b', 'name': 'Belanja', 'section': 'needs'}],
                        [{'id': 'synonym', 'name': 'Belanja Bulanan', 'section': 'needs'}]):
            with self.subTest(catalog=catalog):
                self.cfg['categories'] = catalog
                with Engine(self.cfg) as e:
                    e.db.execute('DELETE FROM category_cache')
                    for c in catalog:
                        e.db.execute('INSERT INTO category_cache VALUES(?,?,?)', (e.scope, c['id'], json.dumps(c)))
                    tx = e.plan(self.expense(raw_fields={'merchant': 'Synthetic Merchant'}), 'a' * 64)['components'][0]
                    self.assertIsNone(tx['categoryId'])
                    self.assertEqual(tx['category_status'], 'unclassified')
                    self.assertEqual(tx['tags'], ['email-mesh', 'Retail'])

    def test_transfer_label_never_changes_financial_type(self):
        self.seed('Synthetic endpoint • 001', 'Transfer', 'Owned pocket')
        self.cfg['categories'].append({'id': 'current-transfer-label', 'name': 'Transfer', 'section': 'needs'})
        with Engine(self.cfg) as e:
            tx = e.plan(parsed(destination_identity='Synthetic endpoint • 001'), 'a' * 64)['components'][0]
            self.assertEqual(tx['type'], 'transfer')
            self.assertIsNone(tx['categoryId'])
            self.assertEqual(tx['destination_category'], 'Transfer')
            self.assertEqual(tx['tags'], ['email-mesh', 'Owned pocket'])
            p = self.expense(destination_identity='Synthetic endpoint • 001', raw_fields={})
            payload = e.plan(p, 'b' * 64)
            tx = payload['components'][0]
            self.assertEqual(tx['type'], 'expense')
            self.assertEqual(tx['categoryId'], 'current-transfer-label')
            self.assertEqual(payload['movements'], [{'wallet': 'wb', 'field': 'balance', 'delta': -100000}])

    def test_brizzi_card_override_reference_override_and_unknown_card_safety(self):
        self.cfg['categories'].append({'id': 'transport-now', 'name': 'Transport', 'section': 'needs'})
        identity = 'BRIZZI • 1234000012340001'
        self.cfg['destination_category_overrides'] = {identity: 'Transport'}
        self.cfg['destination_tag_overrides'] = {identity: 'brizzi-synthetic-transit'}
        self.seed('BRIZZI', 'Transfer', 'Generic topup')
        with Engine(self.cfg) as e:
            p = self.expense(event_type='merchant_payment', destination_identity=identity,
                             raw_fields={'merchant': 'BRIZZI'}, fee_paid=1000, total_debit=101000)
            principal, fee = e.plan(p, 'a' * 64)['components']
            self.assertEqual(principal['categoryId'], 'transport-now')
            self.assertEqual(principal['tags'], ['brizzi-synthetic-transit'])
            self.assertEqual(fee['tags'], ['email-mesh'])
            p['destination_identity'] = 'BRIZZI • 1234000012340002'
            tx = e.plan(p, 'b' * 64)['components'][0]
            self.assertIsNone(tx['categoryId'])
            self.assertEqual(tx['tags'], [])
            self.cfg['category_overrides'] = {p['reference']: 'transport-now'}
            self.assertEqual(e.category(p, 'expense'), ('transport-now', 'rule'))

    def test_llm_whitelist_never_overrides_unknown_brizzi_card_purpose(self):
        identity='BRIZZI • 1234000012340002'
        self.cfg['categories'].append({'id':'finance','name':'Keuangan','section':'needs'})
        with DestinationWhitelist(self.cfg['destination_whitelist_path'],self.scope) as w:
            w.decide(identity,'Keuangan','Uang elektronik kartu',source='llm',confidence=.99)
        with Engine(self.cfg) as e:
            p=self.expense(event_type='merchant_payment',destination_identity=identity,raw_fields={})
            tx=e.plan(p,'c'*64)['components'][0]
            self.assertIsNone(tx['categoryId'])
            self.assertEqual(tx['tags'],[])

    def test_hold_never_classifies_or_queues_or_creates_spending(self):
        self.seed('Synthetic merchant', 'Belanja', 'Retail')
        p = parsed(event_type='authorization_hold', source_wallet='bri', destination_wallet='EXTERNAL',
                   destination_identity='Synthetic merchant', status='hold')
        with Engine(self.cfg) as e:
            payload = e.plan(p, 'a' * 64)
            self.assertEqual(payload['components'], [])
            self.assertEqual(payload['movements'], [{'wallet': 'wb', 'field': 'heldAmount', 'delta': 100000}])
            self.assertEqual(e.whitelist.pending(), [])

    def test_opt_in_path_must_be_absolute_and_not_financial_db(self):
        for path in ('relative.sqlite3', self.cfg['db_path']):
            self.cfg['destination_whitelist_path'] = path
            with self.assertRaises(ValueError):
                Engine(self.cfg)

    def test_pending_status_never_enqueues_or_creates_spending(self):
        p = self.expense(status='pending')
        with Engine(self.cfg, parser=lambda r, registry: p) as e:
            e.ingest([row('synthetic-pending')])
            self.assertEqual(e.status()['events'], 0)
            self.assertEqual(e.status()['movements'], 0)
            self.assertEqual(e.status()['outbox_pending'], 0)
            self.assertEqual(e.whitelist.pending(), [])

    def test_plan_uses_one_approval_snapshot_for_category_and_tags(self):
        from unittest.mock import patch
        self.seed('Synthetic Merchant', 'Belanja', 'Retail')
        self.cfg['categories'].append({'id': 'current-retail', 'name': 'Belanja', 'section': 'wants'})
        with Engine(self.cfg) as e:
            calls = []
            lookup = e.whitelist.lookup
            def racing_lookup(destination):
                r = lookup(destination)
                calls.append(destination)
                if len(calls) >= 3:  # Simulate an admin commit between separate planner reads.
                    return dict(r, category='Digital', tag='Software')
                return r
            with patch.object(e.whitelist, 'lookup', side_effect=racing_lookup):
                tx = e.plan(self.expense(raw_fields={'merchant': 'Synthetic Merchant'}), 'a' * 64)['components'][0]
            self.assertEqual(tx['categoryId'], 'current-retail')
            self.assertEqual(tx['destination_category'], 'Belanja')
            self.assertEqual(tx['destination_tag'], 'Retail')


if __name__ == '__main__':
    unittest.main()
