import unittest
from migrate_credit import plan as build_plan

FACILITIES = {
    'synthetic-card-a': ('Tokopedia Card', 'credit', 40000000),
    'synthetic-card-b': ('BRI Platinum', 'credit', 10000000),
    'synthetic-paylater': ('Shopee Paylater', 'paylater', 20000000),
}

def plan(rows):
    return build_plan(rows, facilities=FACILITIES)

class MigrationTest(unittest.TestCase):
    def test_preserves_bank_and_resets_only_approved_facilities(self):
        rows = [{'id': 'synthetic-card-a', 'name': 'Tokopedia Card', 'type': 'credit', 'balance': 40000000}, {'id': 'bank', 'type': 'bank', 'balance': 20000000}]
        changes = plan(rows)
        self.assertEqual(list(changes), ['synthetic-card-a'])
        self.assertEqual(changes['synthetic-card-a']['creditLimit'], 40000000)
        self.assertEqual(changes['synthetic-card-a']['balance_delta'], -40000000)

    def test_rerun_does_not_reset_new_purchases(self):
        row = {'id': 'synthetic-card-a', 'name': 'Tokopedia Card', 'type': 'credit', 'creditLimit': 40000000, 'balance': -100000}
        self.assertEqual(plan([row]), {})

    def test_changed_legacy_position_requires_review(self):
        row = {'id': 'synthetic-card-a', 'name': 'Tokopedia Card', 'type': 'credit', 'balance': 39900000}
        with self.assertRaises(ValueError): plan([row])

if __name__ == '__main__': unittest.main()
