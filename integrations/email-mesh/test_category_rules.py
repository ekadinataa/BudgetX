"""Offline category rules using synthetic reduced category evidence only."""
import importlib.util
import unittest


def resolve(parsed, tx_type='expense', catalog=None):
    assert importlib.util.find_spec('category_rules'), 'category_rules module missing'
    from category_rules import resolve_category
    return resolve_category(parsed, tx_type, catalog if catalog is not None else CATALOG)


CATALOG = [
    {'id': 'reset-utility', 'name': 'Utilitas', 'section': 'needs'},
    {'id': 'reset-health', 'name': 'Kesehatan', 'section': 'needs'},
    {'id': 'reset-grocery', 'name': 'Belanja Bulanan', 'section': 'needs'},
    {'id': 'reset-transport', 'name': 'Transport', 'section': 'needs'},
    {'id': 'income-other', 'name': 'Lainnya', 'section': 'income'},
]


class CategoryRulesTests(unittest.TestCase):
    def test_electricity_event_uses_current_catalog_id(self):
        self.assertEqual(resolve({'event_type': 'electricity_payment'}),
                         ('reset-utility', 'rule'))

    def test_only_expense_compatible_sections_are_resolved(self):
        parsed = {'event_type': 'electricity_payment'}
        for tx_type in ('transfer', 'income', 'unknown', None):
            with self.subTest(tx_type=tx_type):
                self.assertEqual(resolve(parsed, tx_type), (None, None))
        for section in ('income', 'expense', 'unknown', None):
            with self.subTest(section=section):
                self.assertEqual(resolve(parsed, catalog=[
                    {'id': 'wrong', 'name': 'Utilitas', 'section': section}]),
                    (None, None))
        for section in ('needs', 'wants', 'savings'):
            with self.subTest(section=section):
                self.assertEqual(resolve(parsed, catalog=[
                    {'id': section, 'name': 'Utilitas', 'section': section}]),
                    (section, 'rule'))

    def test_scoped_electricity_product_patterns(self):
        for raw in ({'transaction_subtype': 'Isi ulang Token PLN'},
                    {'Produk': 'Token Listrik'},
                    {'labelled_fields': {'Produk': 'PLN Prabayar'}},
                    {'Merchant/Biller': 'PLN'}):
            with self.subTest(raw=raw):
                self.assertEqual(resolve({'raw_fields': raw}), ('reset-utility', 'rule'))
        for note in ('Pembelian Token PLN Berhasil', 'Pembayaran Listrik Berhasil'):
            with self.subTest(note=note):
                self.assertEqual(resolve({'note': note}), ('reset-utility', 'rule'))

    def test_healthcare_requires_explicit_bpjs_health_or_pharmacy(self):
        for parsed in ({'raw_fields': {'Institusi': 'BPJS Kesehatan'}},
                       {'note': 'Pembayaran BPJS Kesehatan Berhasil'},
                       {'raw_fields': {'labelled_fields': {'Nama Merchant': 'APOTEK ALPRO'}}},
                       {'event_type': 'qris_payment', 'raw_fields': {'To': 'APOTEK ALPRO • 9360000000000000001'}}):
            with self.subTest(parsed=parsed):
                self.assertEqual(resolve(parsed), ('reset-health', 'rule'))
        for parsed in ({'raw_fields': {'Institusi': 'BPJS'}},
                       {'note': 'Pembayaran BPJS Berhasil'},
                       {'note': 'Pembayaran BPJS Ketenagakerjaan Berhasil'},
                       {'raw_fields': {'Institusi': 'BPJS Ketenagakerjaan'}}):
            with self.subTest(parsed=parsed):
                self.assertEqual(resolve(parsed), (None, None))

    def test_grocery_merchants_use_monthly_shopping_not_food(self):
        for merchant in ('INDOMARET', 'Alfamart Kota Contoh', 'HERO SUPERMARKET'):
            with self.subTest(merchant=merchant):
                self.assertEqual(resolve({'raw_fields': {'Merchant': merchant}}),
                                 ('reset-grocery', 'rule'))
        self.assertEqual(resolve({'raw_fields': {'labelled_fields': {
            'Nama Merchant': 'INDOMARET', 'Lokasi Merchant': 'KOTA CONTOH'}}}),
            ('reset-grocery', 'rule'))

    def test_known_fuel_merchants_are_transport_not_utilities(self):
        for merchant in ('SPBU CONTOH', 'PERTAMINA SPBU 31.12702',
                         'SHELL BSD', 'SPBU BP CIATER RAYA'):
            with self.subTest(merchant=merchant):
                self.assertEqual(resolve({'raw_fields': {'merchant': merchant}}),
                                 ('reset-transport', 'rule'))
        self.assertEqual(resolve({'raw_fields': {'merchant': 'PLN'}}),
                         ('reset-utility', 'rule'))

    def test_conflicting_evidence_remains_unclassified(self):
        for parsed in (
            {'event_type': 'electricity_payment', 'raw_fields': {'merchant': 'SPBU CONTOH'}},
            {'raw_fields': {'merchant': 'INDOMARET', 'Produk': 'Token PLN'}},
            {'raw_fields': {'merchant': 'APOTEK ALPRO', 'Merchant/Biller': 'PLN'}},
            {'raw_fields': {'merchant': 'INDOMARET', 'Lokasi Merchant': 'SPBU CONTOH'}},
            {'note': 'Pembayaran BPJS Kesehatan Berhasil',
             'raw_fields': {'Institusi': 'BPJS Ketenagakerjaan'}},
        ):
            with self.subTest(parsed=parsed):
                self.assertEqual(resolve(parsed), (None, None))

    def test_catalog_names_match_exact_semantic_synonyms_only(self):
        for name in (' utilities ', 'UTILITAS', 'Tagihan & Utilitas'):
            with self.subTest(name=name):
                self.assertEqual(resolve({'event_type': 'electricity_payment'}, catalog=[
                    {'id': 'new-id', 'name': name, 'section': 'needs'}]), ('new-id', 'rule'))
        for merchant, name in (('APOTEK ALPRO', 'Health'),
                               ('INDOMARET', 'Groceries'), ('SPBU CONTOH', 'Transportation')):
            with self.subTest(name=name):
                self.assertEqual(resolve({'raw_fields': {'merchant': merchant}}, catalog=[
                    {'id': 'new-id', 'name': name, 'section': 'needs'}]), ('new-id', 'rule'))
        for catalog in ([], [{'id': 'wrong', 'name': 'Utilitas Hiburan', 'section': 'needs'}],
                        CATALOG + [{'id': 'duplicate', 'name': 'Utilities', 'section': 'needs'}]):
            with self.subTest(catalog=catalog):
                self.assertEqual(resolve({'event_type': 'electricity_payment'}, catalog=catalog),
                                 (None, None))

    def test_unscoped_body_footer_and_unknown_codes_do_not_classify(self):
        for parsed in (
            {'raw_fields': {'merchant': 'MITRABL 123456'}},
            {'raw_fields': {'merchant': 'TOKO ABC', 'body_normalized':
                            'Pendidikan BPJS Kesehatan PLN INDOMARET APOTEK SPBU'}},
            {'raw_fields': {'labelled_fields': {'Keterangan': 'PLN', 'Nama Pelanggan': 'APOTEK'}}},
            {'note': 'QRIS education school supermarket APOTEK'},
            {'note': 'Informasi layanan: Pembayaran PLN tersedia'},
            {'note': 'Informasi layanan: Pembayaran BPJS Kesehatan tersedia'},
            {'raw_fields': {'Produk': 'Token', 'merchant': 'shellfish cafe'}},
            {'event_type': 'transfer_out', 'raw_fields': {'To': 'APOTEK ALPRO'}},
            {'category_hint': 'c3'},
        ):
            with self.subTest(parsed=parsed):
                self.assertEqual(resolve(parsed), (None, None))
        self.assertEqual(resolve({'raw_fields': {'merchant': 'MITRABL'}}, 'income'),
                         (None, None))

    def test_malformed_inputs_fail_closed_without_fabricated_ids(self):
        for parsed, catalog in (
            (None, CATALOG), ([], CATALOG),
            ({'raw_fields': 'PLN'}, CATALOG),
            ({'raw_fields': {'labelled_fields': ['PLN']}}, CATALOG),
            ({'note': ['Pembayaran PLN Berhasil']}, CATALOG),
            ({'raw_fields': {3: 'PLN'}}, CATALOG),
            ({'event_type': 'electricity_payment'}, None),
            ({'event_type': 'electricity_payment'}, [None, {'name': None}]),
            ({'event_type': 'electricity_payment'}, [{'name': 'Utilitas', 'section': 'needs'}]),
            ({'event_type': 'electricity_payment'}, [{'id': '', 'name': 'Utilitas', 'section': 'needs'}]),
            ({'event_type': 'electricity_payment'}, [{'id': 3, 'name': 'Utilitas', 'section': 'needs'}]),
        ):
            with self.subTest(parsed=parsed, catalog=catalog):
                from category_rules import resolve_category
                self.assertEqual(resolve_category(parsed, 'expense', catalog), (None, None))

    def test_synthetic_scoped_evidence_regressions(self):
        # Synthetic labels exercise category patterns, not private receipts.
        fixtures = (
            ('synthetic-grocery', {'raw_fields': {'Nama Merchant': 'INDOMARET',
                'labelled_fields': {'Lokasi Merchant': 'KOTA CONTOH'}}}, 'reset-grocery'),
            ('synthetic-utility', {'event_type': 'electricity_payment',
                'raw_fields': {'transaction_subtype': 'Isi ulang Token PLN'}}, 'reset-utility'),
            ('synthetic-health', {'event_type': 'bill_payment',
                'note': 'Pembayaran BPJS Kesehatan Berhasil'}, 'reset-health'),
            ('synthetic-qris', {'event_type': 'qris_payment', 'raw_fields': {
                'To': 'APOTEK CONTOH • 9360000000000000001',
                'Merchant Location': 'KOTA CONTOH'}}, 'reset-health'),
            ('synthetic-transport', {'raw_fields': {'Merchant': 'SPBU CONTOH'}}, 'reset-transport'),
            ('synthetic-unclassified', {'note': 'Pembayaran BPJS Ketenagakerjaan Berhasil',
                'raw_fields': {'Institusi': 'BPJS Ketenagakerjaan'}}, None),
            ('synthetic-transfer', {'event_type': 'transfer_out', 'raw_fields': {
                'Ke': 'APOTEK CONTOH • 1234000011'}}, None),
        )
        for message_id, parsed, category_id in fixtures:
            with self.subTest(message_id=message_id):
                self.assertEqual(resolve(parsed), (category_id, 'rule' if category_id else None))


if __name__ == '__main__':
    unittest.main()
