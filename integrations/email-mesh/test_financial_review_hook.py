"""Synthetic orchestration tests; injected collaborators perform no cloud/notification calls."""
import unittest
try:
    import financial_review_hook as hook
except ModuleNotFoundError:
    hook = None


class HookTests(unittest.TestCase):
    def test_disabled_is_noop_without_opening_any_state(self):
        self.assertIsNotNone(hook, 'Financial review hook is missing')
        self.assertEqual(hook.run_review_hook({'financial_review_enabled': False}), {'enabled': False})

    def test_discovers_readonly_processes_approved_then_notifies(self):
        import sqlite3
        import tempfile
        from pathlib import Path
        from test_mesh import config
        from mesh import Engine
        calls = []
        class Store:
            def __init__(self, config):
                self.config = config
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def discover(self, db):
                with self_test.assertRaises(sqlite3.OperationalError):
                    db.execute('CREATE TABLE forbidden_probe(id)')
                calls.append('discover')
                return {'queued': 1}
            def rows(self, states=None):
                return [{'state': 'pending'}, {'state': 'posted'}]
        self_test = self
        def process(config, store, limit=10):
            calls.append('process')
            return {'posted': 1, 'deferred': 0}
        def notify(config, store, limit=10):
            calls.append('notify')
            return {'notified': 1}
        with tempfile.TemporaryDirectory() as tmp:
            cfg = config(Path(tmp))
            cfg.update(financial_review_enabled=True, publish_enabled=True)
            with Engine(cfg):
                pass
            result = hook.run_review_hook(cfg, store_factory=Store, processor=process, notifier=notify)
            self.assertEqual(calls, ['discover', 'process', 'notify'])
            self.assertEqual(result['pending'], 1)
            self.assertEqual(result['posted'], 1)
            calls.clear()
            result = hook.run_review_hook(cfg, allow_publication=False, store_factory=Store, processor=process, notifier=notify)
            self.assertEqual(calls, ['discover', 'notify'])
            self.assertEqual(result['posted'], 0)
            calls.clear()
            cfg['publish_enabled'] = False
            hook.run_review_hook(cfg, store_factory=Store, processor=process, notifier=notify)
            self.assertEqual(calls, ['discover', 'notify'])

    def test_publication_failure_still_notifies_pending_receipts(self):
        import tempfile
        from pathlib import Path
        from test_mesh import config
        from mesh import Engine
        calls = []
        class Store:
            def __init__(self, config): pass
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def discover(self, db): return {}
            def rows(self, states=None): return [{'state': 'approved'}]
        def process(config, store, limit=10):
            raise ValueError('PRIVATE CREDENTIAL-LIKE DIAGNOSTIC MUST NOT LEAK')
        def notify(config, store, limit=10):
            calls.append('notify')
            return {'notified': 1}
        with tempfile.TemporaryDirectory() as tmp:
            cfg = config(Path(tmp))
            cfg.update(financial_review_enabled=True, publish_enabled=True)
            with Engine(cfg): pass
            result = hook.run_review_hook(cfg, store_factory=Store, processor=process, notifier=notify)
            self.assertEqual(calls, ['notify'])
            self.assertEqual(result['publication_error'], 'ValueError')
            self.assertNotIn('PRIVATE', repr(result))
            self.assertEqual(result['approved'], 1)

    def test_cli_notify_only_cannot_request_publication_and_redacts_errors(self):
        import json
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from test_mesh import config
        with tempfile.TemporaryDirectory() as tmp:
            cfg = config(Path(tmp))
            path = Path(tmp) / 'config.json'
            path.write_text(json.dumps(cfg))
            path.chmod(0o600)
            with patch.object(hook, 'run_review_hook', return_value={'enabled': True}) as run, patch('builtins.print'):
                self.assertEqual(hook.main(['--config', str(path), '--notify-only']), 0)
                self.assertFalse(run.call_args.kwargs['allow_publication'])
            with patch.object(hook, 'run_review_hook', return_value={'notification_error': 'FinancialReviewNotificationDeferred'}), patch('builtins.print'):
                self.assertEqual(hook.main(['--config', str(path)]), 1)
            with patch.object(hook, 'run_review_hook', side_effect=ValueError('PRIVATE')), patch('builtins.print') as output:
                self.assertEqual(hook.main(['--config', str(path)]), 1)
                self.assertNotIn('PRIVATE', repr(output.call_args))

    def test_failed_notice_ack_is_reported_without_hiding_receipt(self):
        import tempfile
        from pathlib import Path
        from test_mesh import config
        from mesh import Engine
        with tempfile.TemporaryDirectory() as tmp:
            cfg = config(Path(tmp))
            cfg['financial_review_enabled'] = True
            cfg['publish_enabled'] = False
            with Engine(cfg):
                pass
            class Store:
                def __init__(self, config): pass
                def __enter__(self): return self
                def __exit__(self, *args): pass
                def discover(self, db): return {'created': 1}
                def rows(self): return [{'state': 'pending'}]
            result = hook.run_review_hook(cfg, store_factory=Store, processor=lambda *a, **kw: {}, notifier=lambda *a, **kw: {'sent': 0, 'failed': 0, 'outstanding_failed': 1})
            self.assertEqual(result['notification_error'], 'FinancialReviewNotificationDeferred')
            self.assertEqual(result['pending'], 1)


if __name__ == '__main__':
    unittest.main()
