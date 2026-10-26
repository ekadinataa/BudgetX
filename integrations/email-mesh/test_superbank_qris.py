"""Synthetic Superbank QRIS regressions. Offline only; no operational config."""
from copy import deepcopy
from pathlib import Path
from datetime import datetime, timezone
import json
import tempfile
import unittest
from unittest.mock import patch

import mesh
import mesh_parser

HERE = Path(__file__).resolve().parent
REGISTRY = {
    'wallets': {'SUPERBANK': {'id': 'synthetic-superbank'}},
    'aliases': {'synthetic-owned-account': 'SUPERBANK'},
    'reporter_aliases': {'SUPERBANK': {'Tabungan Utama': 'SUPERBANK'}},
}
BODY = '''Pembayaran QRIS berhasil

Halo USER,

Kamu berhasil bayar Rp46.000,00 ke TOKO CONTOH dari Tabungan Utama.

Detail Transaksi

Nominal Bayar

Rp46.000,00

Total Bayar

Rp46.000,00

Sumber Dana

Tabungan Utama

Metode Pembayaran

QRIS

Penerima

TOKO CONTOH

KOTA CONTOH

Nama Acquirer

BANK CONTOH

Merchant PAN

9360001400000000000

Terminal ID

A01

Tanggal & waktu

20 Okt 2026, 09:28 WIB

ID Transaksi

SYNTHETIC-QRIS-ID

RRN

SYNTHETIC-RRN

Layanan Super Care:
1500 333
care@superbank.id'''


def receipt(**changes):
    row = {'account_id': 'akun-1', 'gmail_message_id': 'synthetic-qris-1',
           'thread_id': 'synthetic-thread', 'provider': 'SUPERBANK',
           'from': 'Superbank <noreply@no-reply.superbank.id>',
           'subject': 'Pembayaran QRIS berhasil', 'internalDate': '1792463297000',
           'body_normalized': BODY}
    row.update(changes)
    return row


class SuperbankQRISTests(unittest.TestCase):
    def test_observed_qris_is_expense_with_nullable_fees_and_distinct_references(self):
        row, registry = receipt(), deepcopy(REGISTRY)
        before_row, before_registry = deepcopy(row), deepcopy(registry)
        out = mesh_parser.parse_email(row, registry)
        self.assertTrue(out['is_transaction'])
        self.assertTrue(out['eligible'], out['validation_errors'])
        self.assertEqual((out['event_type'], out['status']), ('qris_payment', 'success'))
        self.assertEqual((out['source_wallet'], out['destination_wallet']), ('SUPERBANK', 'EXTERNAL'))
        self.assertEqual(out['source_identity'], 'Tabungan Utama')
        self.assertEqual(out['destination_identity'], 'TOKO CONTOH')
        self.assertEqual(out['amount'], 46000)
        self.assertEqual(out['total_debit'], 46000)
        self.assertIsNone(out['fee_paid'])
        self.assertIsNone(out['fee_displayed'])
        self.assertIsNone(out['total_credit'])
        self.assertEqual(out['reference'], 'SYNTHETIC-RRN')
        self.assertEqual(out['raw_fields']['transaction_id'], 'SYNTHETIC-QRIS-ID')
        self.assertEqual(out['raw_fields']['RRN'], 'SYNTHETIC-RRN')
        self.assertEqual(out['body_transaction_at'], '20 Okt 2026, 09:28 WIB')
        self.assertEqual(out['notification_at'], '2026-10-20T02:28:17+00:00')
        self.assertEqual(out['time_source'], 'internalDate')
        self.assertIn('TOKO CONTOH', out['note'])
        self.assertIsNone(out['category_hint'])
        self.assertEqual(out['raw_fields']['body_normalized'], BODY)
        self.assertEqual(row, before_row)
        self.assertEqual(registry, before_registry)
        self.assertEqual(Path(mesh_parser.__file__).resolve(), HERE / 'mesh_parser.py')
    def test_qris_money_labels_must_be_unique_valid_and_consistent(self):
        for label in ('Nominal Bayar', 'Total Bayar'):
            for invalid in ('Rp46.00', 'Rp46.000USD', 'Rp46.000,50', 'Rp46.000,00 extra',
                            'Rp-46.000', 'not money', ''):
                body = BODY.replace(label + '\n\nRp46.000,00', label + '\n\n' + invalid)
                with self.subTest(label=label, invalid=invalid):
                    out = mesh_parser.parse_email(receipt(body_normalized=body), REGISTRY)
                    self.assertTrue(out['is_transaction'])
                    self.assertFalse(out['eligible'], out)
            for extra in ('Rp46.000,00', 'Rp47.000,00'):
                with self.subTest(label=label, duplicate=extra):
                    out = mesh_parser.parse_email(receipt(body_normalized=BODY + '\n\n' + label + '\n\n' + extra), REGISTRY)
                    self.assertFalse(out['eligible'])
        conflict = mesh_parser.parse_email(receipt(body_normalized=BODY.replace(
            'Total Bayar\n\nRp46.000,00', 'Total Bayar\n\nRp47.000,00')), REGISTRY)
        self.assertIn('total_debit_conflict', conflict['validation_errors'])
        self.assertFalse(conflict['eligible'])
        for value in ('Rp0', 'Rp0,00'):
            out = mesh_parser.parse_email(receipt(body_normalized=BODY.replace('Rp46.000,00', value)), REGISTRY)
            self.assertFalse(out['eligible'])

    def test_source_requires_unique_provider_scoped_full_label(self):
        registries = []
        for scoped in ({}, {'KROM': {'Tabungan Utama': 'SUPERBANK'}},
                       {'SUPERBANK': {'Tabungan Utama': 'OTHER'}},
                       {'SUPERBANK': {'Tabungan Utama': 'SUPERBANK', ' tabungan  utama ': 'OTHER'}}):
            registry = deepcopy(REGISTRY)
            registry['reporter_aliases'] = scoped
            registry['aliases']['Tabungan Utama'] = 'SUPERBANK'
            registries.append(registry)
        registry = deepcopy(REGISTRY)
        registry['wallets'] = {}
        registries.append(registry)
        for registry in registries:
            with self.subTest(registry=registry):
                out = mesh_parser.parse_email(receipt(), registry)
                self.assertEqual(out['source_wallet'], 'UNRESOLVED')
                self.assertFalse(out['eligible'])
        for source in ('', 'Unknown Pocket', 'Tabungan Utama\n\n999999999999'):
            with self.subTest(source=source):
                body = BODY.replace('Sumber Dana\n\nTabungan Utama', 'Sumber Dana\n\n' + source)
                out = mesh_parser.parse_email(receipt(body_normalized=body), REGISTRY)
                self.assertEqual(out['source_wallet'], 'UNRESOLVED')
                self.assertFalse(out['eligible'])
                if '999' in source:
                    self.assertIn('999999999999', out['source_identity'])
        duplicate = mesh_parser.parse_email(receipt(body_normalized=BODY + '\nSumber Dana\nTabungan Utama'), REGISTRY)
        self.assertFalse(duplicate['eligible'])

    def test_required_receipt_fields_never_borrow_neighbouring_labels(self):
        blocks = {'Penerima': 'TOKO CONTOH\n\nKOTA CONTOH', 'Metode Pembayaran': 'QRIS',
                  'Tanggal & waktu': '20 Okt 2026, 09:28 WIB'}
        for label, value in blocks.items():
            for replacement in ('', label + '\n\n', label + '\n\n' + value + '\n\n' + label + '\n\n' + value):
                with self.subTest(label=label, replacement=replacement):
                    body = BODY.replace(label + '\n\n' + value, replacement)
                    out = mesh_parser.parse_email(receipt(body_normalized=body), REGISTRY)
                    self.assertFalse(out['eligible'])
        wrong_method = mesh_parser.parse_email(receipt(body_normalized=BODY.replace(
            'Metode Pembayaran\n\nQRIS', 'Metode Pembayaran\n\nTransfer')), REGISTRY)
        self.assertFalse(wrong_method['eligible'])

    def test_reference_requires_rrn_or_id_without_ambiguity(self):
        for label, value, expected in (('RRN', 'SYNTHETIC-RRN', 'SYNTHETIC-QRIS-ID'),
                                       ('ID Transaksi', 'SYNTHETIC-QRIS-ID', 'SYNTHETIC-RRN')):
            body = BODY.replace(label + '\n\n' + value + '\n\n', '')
            out = mesh_parser.parse_email(receipt(body_normalized=body), REGISTRY)
            self.assertTrue(out['eligible'], out['validation_errors'])
            self.assertEqual(out['reference'], expected)
            for extra in (value, 'DIFFERENT-REFERENCE'):
                duplicate = mesh_parser.parse_email(receipt(body_normalized=BODY + '\n' + label + '\n' + extra), REGISTRY)
                self.assertFalse(duplicate['eligible'])
        body = BODY.replace('RRN\n\nSYNTHETIC-RRN\n\n', '').replace('ID Transaksi\n\nSYNTHETIC-QRIS-ID\n\n', '')
        out = mesh_parser.parse_email(receipt(body_normalized=body), REGISTRY)
        self.assertFalse(out['eligible'])
        self.assertIn('missing_reference', out['validation_errors'])
        for bad in ('', 'not a reference', '$rrn'):
            out = mesh_parser.parse_email(receipt(body_normalized=BODY.replace('SYNTHETIC-RRN', bad)), REGISTRY)
            self.assertFalse(out['eligible'])

    def test_unknown_superbank_transaction_templates_are_quarantined(self):
        cases = [receipt(subject='Pembayaran tagihan berhasil', body_normalized='Pembayaran berhasil\nDetail Transaksi\nNominal Bayar\nRp46.000,00'),
                 receipt(subject='Pembayaran QRIS menunggu', body_normalized=BODY.replace('berhasil', 'menunggu')),
                 receipt(subject='Pembayaran QRIS gagal', body_normalized=BODY.replace('berhasil', 'gagal')),
                 receipt(subject='Transaksi format baru', body_normalized='Detail Transaksi\nNilai Transaksi\nRp46.000,00'),
                 receipt(subject='Info akun', body_normalized=BODY)]
        for row in cases:
            with self.subTest(subject=row['subject']):
                out = mesh_parser.parse_email(row, REGISTRY)
                self.assertTrue(out['is_transaction'])
                self.assertFalse(out['eligible'])
                self.assertIn('unknown_template', out['validation_errors'])
        for subject in ('Promo pembayaran QRIS', 'Pembayaran QRIS promo cashback',
                        'e-Statement Oktober', 'Verifikasi Akun', 'Survei pengguna'):
            with self.subTest(subject=subject):
                out = mesh_parser.parse_email(receipt(subject=subject, body_normalized='Coba pembayaran QRIS\nDetail Transaksi\nNominal Bayar\nRp46.000,00'), REGISTRY)
                self.assertFalse(out['is_transaction'])
                self.assertFalse(out['eligible'])

    def test_sender_is_exact_mailbox_not_display_name_or_lookalike(self):
        for sender in ('noreply@no-reply.superbank.id', '"SUPERBANK" <NOREPLY@NO-REPLY.SUPERBANK.ID>'):
            with self.subTest(sender=sender):
                out = mesh_parser.parse_email(receipt(**{'from': sender}), REGISTRY)
                self.assertTrue(out['eligible'], out['validation_errors'])
                unknown = mesh_parser.parse_email(receipt(subject='Transaksi format baru', **{'from': sender}), REGISTRY)
                self.assertIn('unknown_template', unknown['validation_errors'])
        for sender in ('Superbank <noreply@no-reply.superbank.id.evil.invalid>',
                       'Superbank <noreply@evil-superbank.id>',
                       '"noreply@no-reply.superbank.id" <fraud@example.invalid>',
                       'Superbank <noreply@no-reply.superbank.id>, fraud@example.invalid',
                       'Other <other@no-reply.superbank.id>', 'noreply@no-reply.superbank.id>'):
            with self.subTest(sender=sender):
                self.assertFalse(mesh_parser.parse_email(receipt(**{'from': sender}), REGISTRY)['eligible'])

    def test_nonfinal_status_overrides_success_subject_and_stale_intro(self):
        for message, expected in (('Pembayaran QRIS gagal', 'failed'), ('Kamu gagal bayar', 'failed'),
                                  ('Status Transaksi\n\nGagal', 'failed'),
                                  ('Status\n\nDitolak', 'failed'),
                                  ('Status Pembayaran\n\nDiproses', 'pending'),
                                  ('Pembayaran QRIS menunggu', 'pending'),
                                  ('Status\n\nPending', 'pending')):
            with self.subTest(message=message):
                out = mesh_parser.parse_email(receipt(body_normalized=BODY + '\n\n' + message), REGISTRY)
                self.assertEqual(out['status'], expected)
                self.assertFalse(out['eligible'])
        out = mesh_parser.parse_email(receipt(body_normalized=BODY.replace('Kamu berhasil bayar', 'Kamu akan bayar')), REGISTRY)
        self.assertFalse(out['eligible'])
        self.assertEqual(out['status'], 'unknown')

    def test_summary_must_agree_with_structured_amount_merchant_and_source(self):
        intro = 'Kamu berhasil bayar Rp46.000,00 ke TOKO CONTOH dari Tabungan Utama.'
        for replacement in (intro.replace('Rp46.000,00', 'Rp47.000,00'),
                            intro.replace('Rp46.000,00', 'Rp46.000,00USD'),
                            intro.replace('TOKO CONTOH', 'TOKO LAIN'),
                            intro.replace('Tabungan Utama', 'Pocket Lain'),
                            intro + '\n\n' + intro):
            with self.subTest(replacement=replacement):
                out = mesh_parser.parse_email(receipt(body_normalized=BODY.replace(intro, replacement)), REGISTRY)
                self.assertFalse(out['eligible'])
        out = mesh_parser.parse_email(receipt(body_normalized=BODY.replace('Penerima\n\nTOKO CONTOH', 'Penerima')), REGISTRY)
        self.assertFalse(out['eligible'])  # The merchant's city cannot become its name.

    def test_supported_spacing_plain_body_and_bank_named_merchant_remain_external(self):
        for body in (BODY, BODY.replace('\n\n', '\n'),
                     BODY.replace('Nominal Bayar\n', 'Nominal Bayar:\n').replace('Total Bayar\n', 'Total Bayar:\n')):
            for merchant in ('TOKO CONTOH', 'BANK CONTOH'):
                row = receipt(body_normalized='', body_plain=body.replace('TOKO CONTOH', merchant))
                registry = deepcopy(REGISTRY)
                registry['wallets']['BANK CONTOH'] = {'id': 'synthetic-other'}
                registry['aliases'][merchant] = 'BANK CONTOH'
                out = mesh_parser.parse_email(row, registry)
                with self.subTest(merchant=merchant, body=body[:40]):
                    self.assertTrue(out['eligible'], out['validation_errors'])
                    self.assertEqual(out['destination_wallet'], 'EXTERNAL')
                    self.assertEqual(mesh.event_kind(out), 'expense')
                    self.assertIsNone(out['category_hint'])

    def test_notification_and_active_account_gates_still_apply(self):
        for changes, error in (({'gmail_message_id': None}, 'missing_gmail_message_id'),
                               ({'account_id': 'akun-2'}, 'inactive_account'),
                               ({'internalDate': None}, 'missing_notification_time'),
                               ({'internalDate': 'bad'}, 'invalid_notification_time:internalDate')):
            with self.subTest(changes=changes):
                out = mesh_parser.parse_email(receipt(**changes), REGISTRY)
                self.assertFalse(out['eligible'])
                self.assertIn(error, out['validation_errors'])


class SuperbankQRISEngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.config = {'project_id': 'budgetku-app-v1', 'uid': 'VCqdnx9zvJVrZQSNp6gyGm6Zzhr2',
                       'email': 'demo@budgetx.id', 'account_id': 'akun-1',
                       'mailbox_email': 'synthetic@example.invalid',
                       'checkpoint_at': '2026-10-19T00:00:00+00:00',
                       'db_path': str(Path(self.temp.name) / 'isolated.sqlite3'),
                       'publish_enabled': False,
                       'sender_allowlist': {'noreply@no-reply.superbank.id': 'SUPERBANK'},
                       'registry': deepcopy(REGISTRY), 'categories': []}
        # Fail immediately if a future regression accidentally attempts network.
        self.addCleanup(patch.stopall)
        patch('socket.socket', side_effect=AssertionError('network forbidden')).start()
        patch('socket.getaddrinfo', side_effect=AssertionError('network forbidden')).start()

    def engine(self):
        self.assertEqual(Path(mesh.__file__).resolve(), HERE / 'mesh.py')
        return mesh.Engine(self.config, now=lambda: datetime(2026, 10, 20, 3, tzinfo=timezone.utc))

    def test_real_engine_one_expense_one_movement_and_duplicate_idempotency(self):
        row = receipt()
        with self.engine() as engine:
            engine.ingest([row, deepcopy(row)])
            self.assertEqual(engine.status()['events'], 1)
            self.assertEqual(engine.status()['movements'], 1)
            self.assertEqual(engine.status()['evidence'], 1)
            self.assertEqual(engine.status()['quarantined'], 0)
            payload = json.loads(engine.db.execute('SELECT payload FROM outbox').fetchone()[0])
            self.assertEqual(payload['movements'], [{'wallet': 'synthetic-superbank', 'field': 'balance', 'delta': -46000}])
            self.assertEqual(len(payload['components']), 1)
            component = payload['components'][0]
            self.assertEqual((component['type'], component['amount'], component['walletId']),
                             ('expense', 46000, 'synthetic-superbank'))
            self.assertEqual(component['mesh_type'], 'OUTGOING')
            self.assertIsNone(component['toWalletId'])
            self.assertIsNone(component['categoryId'])
            self.assertIn('TOKO CONTOH', component['note'])
            self.assertIsNone(payload['parsed']['fee_paid'])
            stored = json.loads(engine.db.execute('SELECT raw FROM evidence').fetchone()[0])
            self.assertEqual(stored, row)
        with self.engine() as engine:
            engine.ingest([row, receipt(gmail_message_id='synthetic-second-evidence')])
            self.assertEqual(engine.status()['events'], 1)
            self.assertEqual(engine.status()['movements'], 1)
            self.assertEqual(engine.status()['evidence'], 2)
            self.assertEqual(engine.db.execute('SELECT count(*) FROM event_evidence').fetchone()[0], 2)
            self.assertEqual(engine.status()['outbox_pending'], 1)
            self.assertEqual(engine.db.execute('SELECT sum(delta) FROM movements').fetchone()[0], -46000)

    def test_real_engine_unsupported_and_invalid_receipts_never_create_financial_plan(self):
        rows = [receipt(subject='Pembayaran format baru', gmail_message_id='unknown-template'),
                receipt(body_normalized=BODY.replace('Total Bayar\n\nRp46.000,00', 'Total Bayar\n\nRp47.000,00'), gmail_message_id='conflict'),
                receipt(body_normalized=BODY.replace('Sumber Dana\n\nTabungan Utama', 'Sumber Dana\n\nPocket lain'), gmail_message_id='unresolved'),
                receipt(body_normalized=BODY + '\nStatus Transaksi\nGagal', gmail_message_id='failed'),
                receipt(body_normalized=BODY + '\nStatus Transaksi\nPending', gmail_message_id='pending'),
                receipt(**{'from': 'Superbank <noreply@no-reply.superbank.id.evil.invalid>', 'gmail_message_id': 'lookalike'})]
        with self.engine() as engine:
            engine.ingest(rows)
            self.assertEqual(engine.status()['events'], 0)
            self.assertEqual(engine.status()['movements'], 0)
            self.assertEqual(engine.status()['outbox_pending'], 0)
            unknown = engine.db.execute("SELECT parsed,reason,event_id FROM candidates WHERE message='unknown-template'").fetchone()
            self.assertEqual(unknown['reason'], 'ineligible')  # Existing Engine reason contract.
            self.assertIn('unknown_template', json.loads(unknown['parsed'])['validation_errors'])
            self.assertIsNone(unknown['event_id'])
            self.assertEqual(engine.status()['quarantined'], 5)


if __name__ == '__main__':
    unittest.main(verbosity=2)
