import unittest
from copy import deepcopy
from reset_checkpoint import remap

class ResetTest(unittest.TestCase):
    def test_remap_keeps_aliases_and_requires_unique_names(self):
        c = {'registry': {'wallets': {'KROM': {'id': 'old', 'type': 'bank'}}, 'aliases': {'123': 'KROM'}}, 'checkpoint_at': 'old'}
        rows = [{'id': 'new', 'name': 'Krom', 'type': 'bank', 'balance': 1000000}]
        out = remap(c, rows, {'KROM': 'Krom'})
        self.assertEqual(out['registry']['wallets']['KROM'], {'id': 'new', 'type': 'bank', 'opening_balance': 1000000})
        self.assertEqual(out['registry']['aliases'], c['registry']['aliases'])
        self.assertEqual(c['registry']['wallets']['KROM']['id'], 'old')
        for bad in ([], rows + rows, [dict(rows[0], type='credit')], [dict(rows[0], balance=float('nan'))]):
            with self.assertRaises(ValueError): remap(c, bad, {'KROM': 'Krom'})

if __name__ == '__main__': unittest.main()
