"""Synthetic category-only patches: never financial writes."""
import importlib.util
import unittest


class DemoPatchTests(unittest.TestCase):
    def test_admin_decision_merges_tag_without_financial_fields(self):
        self.assertIsNotNone(importlib.util.find_spec('apply_destination_demo'), 'category-only planner missing')
        from apply_destination_demo import build_patch
        tx = {'type': 'expense', 'categoryId': None, 'tags': ['email-mesh', 'personal'],
              'walletId': 'bank', 'amount': 9500, 'note': 'receipt'}
        decision = {'destination': 'TOKO CONTOH, KOTA CONTOH', 'category': 'Makanan & Minuman',
                    'tag': 'Perlu review', 'source': 'admin'}
        catalog = [{'id': 'food', 'name': 'Makanan & Minuman', 'section': 'needs'}]
        patch = build_patch(tx, decision, catalog)
        self.assertEqual(patch['categoryId'], 'food')
        self.assertEqual(patch['tags'], ['email-mesh', 'personal', 'Perlu review'])
        self.assertFalse(set(patch) & {'type', 'walletId', 'amount', 'date', 'note', 'toWalletId', 'mesh'})

    def test_manual_category_is_never_overridden(self):
        from apply_destination_demo import build_patch
        self.assertEqual(build_patch({'type': 'expense', 'category_source': 'manual'},
            {'destination': 'X', 'category': 'Belanja', 'tag': 'Minimarket', 'source': 'admin'}, []), {})

    def test_transfer_label_does_not_change_accounting_type(self):
        from apply_destination_demo import build_patch
        decision = {'destination': 'X', 'category': 'Transfer', 'tag': 'Orang', 'source': 'admin'}
        catalog = [{'id': 'people', 'name': 'Transfer', 'section': 'needs'}]
        expense = build_patch({'type': 'expense', 'tags': []}, decision, catalog)
        self.assertEqual(expense['categoryId'], 'people')
        transfer = build_patch({'type': 'transfer', 'categoryId': 'bad', 'tags': []}, decision, catalog)
        self.assertIsNone(transfer['categoryId'])
        self.assertNotIn('type', transfer)

    def test_missing_ambiguous_and_income_categories_fail_closed(self):
        from apply_destination_demo import build_patch
        d = {'destination': 'X', 'category': 'Belanja', 'tag': 'Toko umum', 'source': 'admin'}
        for catalog in ([], [{'id': 'income', 'name': 'Belanja', 'section': 'income'}],
                        [{'id': 'a', 'name': 'Belanja', 'section': 'needs'},
                         {'id': 'b', 'name': 'Belanja', 'section': 'wants'}]):
            self.assertEqual(build_patch({'type': 'expense'}, d, catalog), {})
        self.assertEqual(build_patch({'type': 'income'}, d, []), {})

    def test_rerun_is_noop_and_only_managed_tag_is_replaced(self):
        from apply_destination_demo import build_patch
        d = {'destination': 'X', 'category': 'Belanja', 'tag': 'Minimarket', 'source': 'admin'}
        catalog = [{'id': 'shop', 'name': 'Belanja', 'section': 'needs'}]
        tx = {'type': 'expense', 'tags': ['personal', 'Old'], 'destination_tag': 'Old', 'destination_source': 'llm'}
        patch = build_patch(tx, d, catalog)
        self.assertEqual(patch['tags'], ['personal', 'Minimarket'])
        self.assertEqual(build_patch(dict(tx, **patch), d, catalog), {})

    def test_catalog_plan_preserves_existing_names_and_adds_missing_exact_taxonomy(self):
        import apply_destination_demo as module
        self.assertTrue(hasattr(module, 'plan_categories'), 'catalog planner missing')
        catalog = [{'id': 'health', 'name': 'Kesehatan', 'section': 'needs', 'color': '#EF4444'},
                   {'id': 'food-old', 'name': 'Makanan & Minum', 'section': 'needs', 'color': '#F59E0B'}]
        planned = module.plan_categories(catalog, {'Kesehatan': 'needs', 'Makanan & Minuman': 'needs'})
        self.assertEqual(len(planned), 1)
        self.assertEqual(planned[0]['name'], 'Makanan & Minuman')
        self.assertEqual(planned[0]['section'], 'needs')
        self.assertEqual(planned[0]['color'], '#EF4444')
        self.assertEqual(module.plan_categories(catalog + planned, {'Kesehatan': 'needs', 'Makanan & Minuman': 'needs'}), [])

    def test_executor_only_updates_exact_targets_with_precondition(self):
        import apply_destination_demo as module
        self.assertTrue(hasattr(module, 'execute_patches'), 'CAS executor missing')
        from unittest.mock import Mock
        pub = Mock()
        pub.base = 'users/demo'
        pub.runner = lambda fn: fn
        snap = Mock()
        snap.exists = True
        snap.update_time = 'observed-version'
        snap.reference.get.return_value = snap
        snap.to_dict.return_value = {'type': 'expense'}
        category = Mock()
        category.exists = True
        category.to_dict.return_value = {'section': 'needs'}
        pub.db.document.return_value.get.return_value = category
        pub.db.write_option.return_value = 'precondition'
        module.execute_patches(pub, [(snap, {'categoryId': 'food', 'tags': ['Warung']})])
        pub.db.write_option.assert_called_once_with(last_update_time='observed-version')
        pub.db.transaction.return_value.update.assert_called_once_with(snap.reference, {'categoryId': 'food', 'tags': ['Warung']}, option='precondition')
        for bad in ({'amount': 10}, {'type': 'transfer'}, {'walletId': 'other'}):
            with self.assertRaises(ValueError):
                module.execute_patches(pub, [(snap, bad)])

    def test_category_race_is_rejected_inside_transaction(self):
        from unittest.mock import Mock
        from apply_destination_demo import execute_patches
        pub = Mock()
        pub.base = 'users/demo'
        pub.runner = lambda fn: fn
        snap = Mock()
        snap.exists = True
        snap.update_time = 'v1'
        snap.to_dict.return_value = {'type': 'expense', 'categoryId': None}
        snap.reference.get.return_value = snap
        category = Mock()
        category.exists = True
        category.to_dict.return_value = {'name': 'Belanja', 'section': 'income'}
        pub.db.document.return_value.get.return_value = category
        with self.assertRaises(ValueError):
            execute_patches(pub, [(snap, {'categoryId': 'shop', 'destination_category': 'Belanja'})])
        pub.db.transaction.return_value.update.assert_not_called()

    def test_seed_taxonomy_uses_only_budgetx_renderable_sections(self):
        from destination_whitelist import CATEGORY_SECTIONS
        self.assertTrue(set(CATEGORY_SECTIONS.values()) <= {'needs', 'wants', 'savings'})

    def test_empty_optional_tag_is_not_appended(self):
        from apply_destination_demo import build_patch
        d = {'destination': 'X', 'category': 'Belanja', 'tag': '', 'source': 'admin'}
        catalog = [{'id': 'shop', 'name': 'Belanja', 'section': 'needs'}]
        patch = build_patch({'type': 'expense', 'tags': ['personal']}, d, catalog)
        self.assertNotIn('', patch.get('tags', []))

    def test_cloud_admin_precedence_is_independent_of_mirror_selection(self):
        import apply_destination_demo as m
        self.assertTrue(hasattr(m, 'authoritative_decision'))
        local = {'destination': 'X', 'category': 'Belanja', 'tag': 'Toko', 'source': 'llm'}
        cloud = dict(local, category='Jasa', source='admin')
        self.assertEqual(m.authoritative_decision(local, cloud), cloud)
        self.assertEqual(m.authoritative_decision(dict(local, source='admin'), cloud)['category'], 'Belanja')

    def test_managed_mirror_readback_preserves_unowned_extras(self):
        import apply_destination_demo as m
        self.assertTrue(hasattr(m, 'managed_matches'))
        body = {'source': 'admin', 'category': 'Belanja'}
        self.assertTrue(m.managed_matches(dict(body, legacy_field='preserved'), body))
        self.assertFalse(m.managed_matches(dict(body, category='Jasa'), body))


if __name__ == '__main__':
    unittest.main()
