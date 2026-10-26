"""Synthetic parser contracts only. Never open archives, private email, or config.

Bank domains/subjects describe parser dispatch; every identity, account, reference,
merchant and amount below is invented specifically for offline tests.
"""
import copy
import unittest
from unittest.mock import patch

from mesh_parser import money, normalize_identity, parse_email


REGISTRY = {
    'wallets': {name: {'id': 'synthetic-' + name.lower()} for name in
                ('BRI', 'KROM', 'JAGO', 'SEABANK', 'SUPERBANK')},
    'aliases': {'111100001111': 'BRI', '222200002222': 'KROM',
                '333300003333': 'JAGO', '444400004444': 'SEABANK',
                '555500005555': 'SUPERBANK', '666600006666': 'EXTERNAL'},
    'reporter_aliases': {'SUPERBANK': {'Synthetic Pocket': 'SUPERBANK'}},
}


def receipt(subject, body, sender, **changes):
    row = {'account_id': 'akun-1', 'gmail_message_id': 'synthetic-parser-message',
           'thread_id': 'synthetic-parser-thread', 'from': sender,
           'subject': subject, 'body_normalized': body,
           'date': 'Wed, 07 Oct 2026 07:30:00 +0700'}
    row.update(changes)
    return row


def bri(**changes):
    return receipt('Pembayaran QRIS Berhasil',
                   'Transaksi Berhasil\nSumber Dana: 111100001111\n'
                   'Nama Merchant: SYNTHETIC SHOP\nNominal: Rp12.000,00\n'
                   'Biaya Admin: Rp0,00\nTotal: Rp12.000,00\n'
                   'Nomor Referensi: SYNTHETIC-BRI-REF',
                   'Synthetic BRI <notice@bri.co.id>', **changes)


def krom(**changes):
    return receipt('Transfer Berhasil',
                   'Kamu telah mengirim dana\nDari: Synthetic Krom\n222200002222\n'
                   'Ke: Synthetic BRI\n111100001111\nJumlah: Rp18.000,00\n'
                   'Tanggal & Waktu: 7 Oktober 2026 07:30 WIB',
                   'Synthetic Krom <noreply@krom.id>', **changes)


def jago(**changes):
    return receipt('You have made a payment to Synthetic Shop',
                   'You have successfully paid\nFrom\nSynthetic Pocket\n333300003333\n'
                   'To\nSYNTHETIC SHOP\nAmount\nRp21.000,00\n'
                   'Transaction Status\nsuccessful\nTransaction Date\n7 Oct 2026 07:30 WIB',
                   'Synthetic Jago <notice@jago.com>', **changes)


def sea(**changes):
    return receipt('Notifikasi Transfer SeaBank',
                   'transfer kamu berhasil diproses\nTransfer Dari: 444400004444\n'
                   'Rekening Tujuan: 111100001111\nJumlah: Rp24.000,00\n'
                   'Biaya: Rp0,00\nNo. Referensi: SYNTHETIC-SEA-REF',
                   'Synthetic SeaBank <notice@seabank.co.id>', **changes)


def superbank(**changes):
    return receipt('Transfer ke Synthetic BRI',
                   'Kamu berhasil transfer\nSumber Dana\nSynthetic Pocket\n'
                   'Penerima\nSynthetic Owner\nSynthetic BRI • 111100001111\n'
                   'Nominal Transfer\nRp27.000,00\nTotal\nRp27.000,00\n'
                   'No. Referensi\nSYNTHETIC-SUPER-REF\nID Transaksi\nSYNTHETIC-SUPER-ID',
                   'Synthetic Superbank <noreply@no-reply.superbank.id>', **changes)


class ParserTests(unittest.TestCase):
    def setUp(self):
        self.registry = copy.deepcopy(REGISTRY)

    def parse(self, row):
        return parse_email(row, self.registry)

    def test_bri_qris_dispatch_amount_and_external_merchant(self):
        result = self.parse(bri())
        self.assertTrue(result['eligible'], result['validation_errors'])
        self.assertEqual((result['event_type'], result['amount'], result['source_wallet'],
                          result['destination_wallet']), ('qris_payment', 12000, 'BRI', 'EXTERNAL'))
        self.assertEqual(result['reference'], 'SYNTHETIC-BRI-REF')

    def test_krom_transfer_dispatch_confirmed_endpoints_and_unknown_fee(self):
        result = self.parse(krom())
        self.assertTrue(result['eligible'], result['validation_errors'])
        self.assertEqual((result['event_type'], result['amount'], result['source_wallet'],
                          result['destination_wallet']), ('transfer_out', 18000, 'KROM', 'BRI'))
        self.assertIsNone(result['fee_paid'])
        self.assertIsNone(result['total_debit'])
        self.assertEqual(result['total_credit'], 18000)

    def test_jago_qris_dispatch_uses_explicit_source_alias(self):
        result = self.parse(jago())
        self.assertTrue(result['eligible'], result['validation_errors'])
        self.assertEqual((result['event_type'], result['amount'], result['source_wallet'],
                          result['destination_wallet']), ('qris_payment', 21000, 'JAGO', 'EXTERNAL'))
        self.assertIsNone(result['fee_paid'])

    def test_seabank_transfer_dispatch_and_explicit_zero_fee(self):
        result = self.parse(sea())
        self.assertTrue(result['eligible'], result['validation_errors'])
        self.assertEqual((result['event_type'], result['amount'], result['source_wallet'],
                          result['destination_wallet']), ('transfer_out', 24000, 'SEABANK', 'BRI'))
        self.assertEqual((result['fee_paid'], result['total_debit']), (0, 24000))

    def test_superbank_dispatch_keeps_transaction_id_separate_from_reference(self):
        result = self.parse(superbank())
        self.assertTrue(result['eligible'], result['validation_errors'])
        self.assertEqual((result['event_type'], result['amount'], result['source_wallet'],
                          result['destination_wallet']), ('transfer_out', 27000, 'SUPERBANK', 'BRI'))
        self.assertEqual(result['reference'], 'SYNTHETIC-SUPER-REF')
        self.assertEqual(result['raw_fields']['transaction_id'], 'SYNTHETIC-SUPER-ID')

    def test_unknown_transaction_is_visible_but_not_eligible(self):
        result = self.parse(receipt('Synthetic future receipt', 'transaksi pembayaran\nNominal: Rp30.000,00',
                                    'future@example.invalid'))
        self.assertTrue(result['is_transaction'])
        self.assertFalse(result['eligible'])
        self.assertIn('unknown_template', result['validation_errors'])
        self.assertEqual(result['source_wallet'], 'UNRESOLVED')

    def test_nontransaction_notice_is_not_promoted(self):
        result = self.parse(receipt('Synthetic greeting', 'Have a good day.', 'notice@example.invalid'))
        self.assertFalse(result['is_transaction'])
        self.assertFalse(result['eligible'])
        self.assertIsNone(result['amount'])

    def test_bank_statement_is_excluded_from_generic_receipt_fallback(self):
        result = self.parse(receipt('e-Statement Synthetic', 'transaction\nAmount: Rp30.000,00',
                                    'notice@jago.com'))
        self.assertFalse(result['is_transaction'])

    def test_unknown_source_never_guesses_bank_ownership(self):
        row = bri()
        row['body_normalized'] = row['body_normalized'].replace('111100001111', '777700007777')
        result = self.parse(row)
        self.assertFalse(result['eligible'])
        self.assertEqual(result['source_wallet'], 'UNRESOLVED')
        self.assertIn('unresolved_source', result['validation_errors'])

    def test_unknown_recipient_never_becomes_external_automatically(self):
        row = krom()
        row['body_normalized'] = row['body_normalized'].replace('111100001111', '777700007777')
        result = self.parse(row)
        self.assertFalse(result['eligible'])
        self.assertEqual(result['destination_wallet'], 'UNRESOLVED')
        self.assertIn('unresolved_destination', result['validation_errors'])

    def test_explicit_external_alias_resolves_recipient_without_ownership_guess(self):
        row = krom()
        row['body_normalized'] = row['body_normalized'].replace('111100001111', '666600006666')
        result = self.parse(row)
        self.assertTrue(result['eligible'], result['validation_errors'])
        self.assertEqual(result['destination_wallet'], 'EXTERNAL')

    def test_conflicting_alias_targets_fail_closed(self):
        self.registry['aliases']['111100001111'] = ['BRI', 'JAGO']
        result = self.parse(krom())
        self.assertFalse(result['eligible'])
        self.assertEqual(result['destination_wallet'], 'UNRESOLVED')
        self.assertTrue(result['ownership_candidates'])

    def test_wallet_registration_without_alias_does_not_confirm_ownership(self):
        self.registry['aliases'] = {}
        result = self.parse(bri())
        self.assertEqual(result['source_wallet'], 'UNRESOLVED')
        self.assertFalse(result['eligible'])

    def test_failed_status_overrides_success_wording(self):
        row = bri()
        row['body_normalized'] += '\ntransaksi gagal'
        result = self.parse(row)
        self.assertEqual(result['status'], 'failed')
        self.assertFalse(result['eligible'])
        self.assertIn('status_not_success:failed', result['validation_errors'])

    def test_pending_status_never_eligible(self):
        row = jago()
        row['body_normalized'] = row['body_normalized'].replace('successful', 'pending')
        result = self.parse(row)
        self.assertEqual(result['status'], 'pending')
        self.assertFalse(result['eligible'])

    def test_unknown_status_is_not_inferred_from_subject(self):
        row = krom()
        row['body_normalized'] = row['body_normalized'].replace('Kamu telah mengirim dana', 'Synthetic details')
        result = self.parse(row)
        self.assertEqual(result['status'], 'unknown')
        self.assertFalse(result['eligible'])

    def test_invalid_money_is_not_silently_coerced(self):
        row = bri()
        row['body_normalized'] = row['body_normalized'].replace('Nominal: Rp12.000,00', 'Nominal: Rp12.00,00')
        result = self.parse(row)
        self.assertIsNone(result['amount'])
        self.assertIn('invalid_money:Nominal', result['validation_errors'])
        self.assertFalse(result['eligible'])

    def test_total_conflict_is_not_eligible(self):
        row = bri()
        row['body_normalized'] = row['body_normalized'].replace('Total: Rp12.000,00', 'Total: Rp13.000,00')
        result = self.parse(row)
        self.assertIn('total_debit_conflict', result['validation_errors'])
        self.assertFalse(result['eligible'])

    def test_zero_amount_is_not_eligible(self):
        row = bri()
        row['body_normalized'] = row['body_normalized'].replace('Rp12.000,00', 'Rp0,00')
        result = self.parse(row)
        self.assertIn('nonpositive_amount', result['validation_errors'])
        self.assertFalse(result['eligible'])

    def test_missing_receipt_identity_and_inactive_account_are_blocked(self):
        result = self.parse(bri(gmail_message_id='', account_id='inactive-synthetic'))
        self.assertIn('missing_gmail_message_id', result['validation_errors'])
        self.assertIn('inactive_account', result['validation_errors'])
        self.assertFalse(result['eligible'])

    def test_header_time_is_preserved_as_utc(self):
        result = self.parse(bri())
        self.assertEqual(result['notification_at'], '2026-10-07T00:30:00+00:00')
        self.assertEqual(result['time_source'], 'header_date')

    def test_missing_notification_time_blocks_receipt(self):
        result = self.parse(bri(date=''))
        self.assertIn('missing_notification_time', result['validation_errors'])
        self.assertFalse(result['eligible'])

    def test_unrendered_template_is_not_eligible(self):
        row = bri()
        row['body_normalized'] += '\n$synthetic_placeholder'
        result = self.parse(row)
        self.assertIn('unrendered_placeholder', result['validation_errors'])
        self.assertFalse(result['eligible'])

    def test_money_accepts_integer_idr_only(self):
        for text, expected in [('Rp1.234,00', 1234), ('IDR 1234', 1234), ('0', 0),
                               ('1,50', None), ('1,234.00', None), ('-100', None),
                               ('1.23', None), ('NaN', None), (None, None)]:
            with self.subTest(text=text):
                self.assertEqual(money(text), expected)

    def test_normalize_identity_only_normalizes_spacing_and_case(self):
        self.assertEqual(normalize_identity('  SYNTHETIC   OWNER  '), 'synthetic owner')
        self.assertNotEqual(normalize_identity('Synthetic Owner'), normalize_identity('Other Owner'))

    def test_parser_does_not_read_files_or_mutate_inputs(self):
        row = bri()
        before_row, before_registry = copy.deepcopy(row), copy.deepcopy(self.registry)
        with patch('builtins.open', side_effect=AssertionError('parser must not read fixtures')):
            result = self.parse(row)
        self.assertTrue(result['eligible'])
        self.assertEqual(row, before_row)
        self.assertEqual(self.registry, before_registry)

    def test_invalid_input_shapes_are_rejected(self):
        for row, registry in [(None, self.registry), (bri(), None),
                               (bri(body_normalized=['invalid-body']), self.registry),
                               (bri(), {'wallets': [], 'aliases': {}})]:
            with self.subTest(row=row), self.assertRaises(TypeError):
                parse_email(row, registry)


if __name__ == '__main__':
    unittest.main()
