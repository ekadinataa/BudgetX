"""Synthetic category-hook tests; no Gmail/cloud/model access."""
import importlib.util
import unittest


class CategoryHookTests(unittest.TestCase):
    def test_disabled_hook_has_no_optional_dependencies_or_side_effects(self):
        self.assertIsNotNone(importlib.util.find_spec('category_hook'), 'ops hook missing')
        from category_hook import run_hook
        self.assertEqual(run_hook({}), {'enabled': False})

    def test_post_classification_targets_only_observed_events_and_retries_cloud_failure(self):
        import tempfile, json
        from pathlib import Path
        from destination_whitelist import DestinationWhitelist
        from category_hook import run_hook
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            c = {'project_id':'budgetku-app-v1','uid':'VCqdnx9zvJVrZQSNp6gyGm6Zzhr2',
                 'email':'demo@budgetx.id','account_id':'akun-1','checkpoint_at':'2026-10-10T00:00:00+00:00',
                 'mailbox_email':'synthetic@example.invalid','sender_allowlist':['bank@example.invalid'],
                 'registry':{'wallets':{}},'db_path':str(root/'ledger.sqlite3'),
                 'destination_whitelist_path':str(root/'whitelist.sqlite3'),
                 'destination_classification_enabled':True,'publish_enabled':True}
            scope=c['project_id']+':'+c['uid']
            eid='a'*64
            with DestinationWhitelist(c['destination_whitelist_path'],scope) as store:
                store.observe('Synthetic coffee',event_id=eid,context={'event_type':'qris_payment'})
            def worker(config):
                with DestinationWhitelist(config['destination_whitelist_path'],scope) as store:
                    store.decide('Synthetic coffee','Makanan & Minuman','Kopi & Minuman',source='llm',confidence=.95)
                return {'processed':1}
            def failing(config,**kwargs):
                raise RuntimeError('Synthetic offline conflict')
            with self.assertRaises(RuntimeError):
                run_hook(c, worker=worker, publisher=failing)
            self.assertIn('Synthetic coffee',json.loads((root/'category-corrections.json').read_text())['destinations'])
            calls=[]
            def publisher(config,**kwargs):
                calls.append(kwargs)
                return {'transaction_updates':1,'whitelist_writes':1,'verified':{'readback':True}}
            result=run_hook(c,worker=lambda _: {'processed':0},publisher=publisher)
            self.assertEqual(calls[0]['event_ids'],[eid])
            self.assertEqual(calls[0]['destinations'],['Synthetic coffee'])
            self.assertEqual(result['transaction_updates'],1)
            self.assertEqual(json.loads((root/'category-corrections.json').read_text())['destinations'],{})

    def test_admin_approval_before_hook_recovers_durable_worker_event_links_once(self):
        import tempfile
        from pathlib import Path
        from destination_whitelist import DestinationWhitelist
        from category_worker import approve_destination
        from category_hook import run_hook
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            c={'project_id':'budgetku-app-v1','uid':'VCqdnx9zvJVrZQSNp6gyGm6Zzhr2','email':'demo@budgetx.id',
               'account_id':'akun-1','checkpoint_at':'2026-10-10T00:00:00+00:00',
               'mailbox_email':'synthetic@example.invalid','sender_allowlist':['bank@example.invalid'],
               'registry':{'wallets':{}},'db_path':str(root/'ledger.sqlite3'),
               'destination_whitelist_path':str(root/'whitelist.sqlite3'),
               'destination_classification_enabled':True,'publish_enabled':True}
            with DestinationWhitelist(c['destination_whitelist_path'],c['project_id']+':'+c['uid']) as w:
                w.observe('Synthetic admin shop',event_id='b'*64)
            approve_destination(c,'Synthetic admin shop','Belanja','Toko umum',reason='Synthetic explicit admin approval')
            calls=[]
            def publisher(config,**kwargs):
                calls.append(kwargs)
                return {'transaction_updates':1,'whitelist_writes':1,'verified':{'readback':True}}
            run_hook(c,worker=lambda _: {'classified':0},publisher=publisher)
            self.assertEqual(len(calls),1)
            self.assertEqual(calls[0]['event_ids'],['b'*64])
            run_hook(c,worker=lambda _: {'classified':0},publisher=publisher)
            self.assertEqual(len(calls),1)


if __name__ == '__main__':
    unittest.main()
