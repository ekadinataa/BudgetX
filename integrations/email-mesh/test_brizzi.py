"""Synthetic BRIZZI policy regressions; no network/cloud writes."""
import tempfile
import unittest
from pathlib import Path
from mesh import Engine, event_kind
from mesh_parser import parse_email
from test_mesh import config


def receipt(fee=0, total=100000, card='6013 0000 0000 1101'):
    return {'account_id': 'akun-1', 'gmail_message_id': 'synthetic-brizzi',
            'provider': 'BRI', 'from': 'Bank BRI <BankBRI@bri.co.id>',
            'subject': 'Top Up BRIZZI Berhasil',
            'date': 'Wed, 07 Oct 2026 08:38:56 +0700',
            'body_normalized': f'''Berikut ini adalah informasi transaksi yang telah Anda lakukan di Aplikasi BRImo.
BRI
9999 **** **** 001
BRIZZI
Jenis Transaksi Pembelian Online Brizzi
Nomor Kartu {card}
Nominal Rp100.000
Biaya Admin Rp{fee}
Total Transaksi Rp{total}
No. Ref BRIZZI-SYNTHETIC-1'''}


class BrizziTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.cfg = config(Path(self.temp.name))
        self.cfg['registry'] = {'wallets': {'BRI': {'id': 'bank-bri', 'type': 'bank'}},
                                'aliases': {'9999 **** **** 001': 'BRI'}}

    def tearDown(self):
        self.temp.cleanup()

    def test_brizzi_is_external_expense_not_internal_transfer(self):
        p = parse_email(receipt(), self.cfg['registry'])
        self.assertTrue(p['eligible'], p['validation_errors'])
        self.assertEqual(p['destination_wallet'], 'EXTERNAL')
        self.assertEqual(event_kind(p), 'expense')
        self.assertEqual(p['destination_identity'], 'BRIZZI • 6013000000001101')
        with Engine(self.cfg) as e:
            self.assertEqual(e.reason(p), 'ready')
            payload = e.plan(p, 'a' * 64)
            self.assertEqual(payload['movements'], [{'wallet': 'bank-bri', 'field': 'balance', 'delta': -100000}])
            tx = payload['components'][0]
            self.assertEqual((tx['type'], tx['mesh_type'], tx['toWalletId']), ('expense', 'OUTGOING', None))
            self.assertIsNone(tx['categoryId'])  # BRIZZI spending purpose is not known.
            e.ingest([receipt(), receipt()])
            self.assertEqual(e.status()['events'], 1)
            self.assertEqual(e.status()['movements'], 1)
        with Engine(self.cfg) as e:
            e.ingest([receipt()])
            self.assertEqual(e.status()['events'], 1)
            self.assertEqual(e.status()['movements'], 1)

    def test_user_card_category_uses_current_catalog_only_for_this_card(self):
        self.cfg['destination_category_overrides'] = {'BRIZZI • 6013000000001101': 'Transport'}
        self.cfg['categories'] = [{'id': 'new-transport', 'name': 'Transport', 'section': 'needs'}]
        p = parse_email(receipt(), self.cfg['registry'])
        with Engine(self.cfg) as e:
            self.assertEqual(e.category(p, 'expense'), ('new-transport', 'rule'))
            other = parse_email(receipt(card='6013 0000 0000 1102'), self.cfg['registry'])
            self.assertEqual(e.category(other, 'expense'), (None, None))
            self.assertEqual(e.category(p, 'income'), (None, None))
            self.assertEqual(e.category(p, 'transfer'), (None, None))

    def test_whitelisted_cards_have_distinct_tags_unknown_card_has_none(self):
        self.cfg['destination_category_overrides'] = {
            'BRIZZI • 6013000000001101': 'Transport',
            'BRIZZI • 6013000000002202': 'Transport'}
        self.cfg['destination_tag_overrides'] = {
            'BRIZZI • 6013000000001101': 'brizzi-transit-1101',
            'BRIZZI • 6013000000002202': 'brizzi-parking-2202'}
        self.cfg['categories'] = [{'id': 'current-transport', 'name': 'Transport', 'section': 'needs'}]
        with Engine(self.cfg) as e:
            for card, tag in [('6013 0000 0000 1101', 'brizzi-transit-1101'),
                              ('6013 0000 0000 2202', 'brizzi-parking-2202'),
                              ('6013 0000 0000 2203', None)]:
                with self.subTest(card=card):
                    p = parse_email(receipt(1000, 101000, card), self.cfg['registry'])
                    self.assertEqual(e.reason(p), 'ready')
                    payload = e.plan(p, 'c' * 64)
                    self.assertEqual(payload['components'][0]['categoryId'], 'current-transport' if tag else None)
                    for component in payload['components']:
                        self.assertEqual(component['tags'], [tag] if tag else [])
                    self.assertEqual(payload['movements'][0]['delta'], -101000)

    def test_paid_fee_separate_component_and_invalid_totals_blocked(self):
        with Engine(self.cfg) as e:
            p = parse_email(receipt(1000, 101000), self.cfg['registry'])
            self.assertEqual(e.reason(p), 'ready')
            payload = e.plan(p, 'b' * 64)
            self.assertEqual([x['amount'] for x in payload['components']], [100000, 1000])
            self.assertEqual(payload['movements'][0]['delta'], -101000)
            self.assertFalse(parse_email(receipt(1000, 100000), self.cfg['registry'])['eligible'])

    def test_missing_card_other_topups_and_unknown_source_stay_blocked(self):
        self.assertFalse(parse_email(receipt(card=''), self.cfg['registry'])['eligible'])
        other = receipt()
        other['subject'] = 'Top Up GoPay Berhasil'
        self.assertEqual(parse_email(other, self.cfg['registry'])['destination_wallet'], 'UNRESOLVED')
        unknown = receipt()
        unknown['body_normalized'] = unknown['body_normalized'].replace('9999 **** **** 001', '999999999999999')
        self.assertFalse(parse_email(unknown, self.cfg['registry'])['eligible'])

if __name__ == '__main__':
    unittest.main()
