"""Regression checks on canonical ops.run with synthetic offline callbacks only."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import ops
from test_mesh import config


class OpsContractTests(unittest.TestCase):
    def test_mesh_failure_skips_classification_and_allows_review_notifications_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            c = config(root)
            c.update(destination_classification_enabled=True, financial_review_enabled=True)
            path = root / 'config.json'
            path.write_text(json.dumps(c))
            path.chmod(0o600)
            calls = []
            def category(_):
                self.fail('classification must not run after a failed mesh')
            def review(_, allow_publication):
                calls.append(allow_publication)
                return 0, {'pending':1,'posted':0}
            result = ops.run(path, execute=lambda _: (1, {'error':'SyntheticFailure'}),
                             category_execute=category, financial_execute=review, now=1000)
            self.assertEqual(calls, [False])
            self.assertEqual(result['code'], 1)
            self.assertEqual(result['financial_review_posted'], 0)
            self.assertTrue((root / 'ops-run.json').exists())

    def test_success_preserves_hook_order_and_category_failure_does_not_repeat_money(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            c = config(root)
            c.update(destination_classification_enabled=True, financial_review_enabled=True)
            path = root / 'config.json'
            path.write_text(json.dumps(c))
            path.chmod(0o600)
            calls = []
            def mesh(_):
                calls.append('mesh')
                return 0, {'outbox_pending':0}
            def category(_):
                calls.append('category')
                return 1, {'error':'SyntheticCategoryFailure'}
            def review(_, allow_publication):
                calls.append(('review', allow_publication))
                return 0, {'pending':0,'posted':0}
            result = ops.run(path, execute=mesh, category_execute=category, financial_execute=review, now=1000)
            self.assertEqual(calls, ['mesh','category',('review',True)])
            self.assertEqual(result['code'], 0)
            self.assertEqual(result['category_error'], 'SyntheticCategoryFailure')


if __name__ == '__main__':
    unittest.main()
