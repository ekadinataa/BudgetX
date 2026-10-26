"""Synthetic Krom ATM regressions; isolated, offline, no operational config."""
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch

import mesh
import mesh_parser
from test_mesh import config

HERE = Path(__file__).resolve().parent
REGISTRY = {'wallets': {'KROM': {'id': 'synthetic-krom'}},
            'aliases': {'**** **** **** 4321': 'KROM'}}
SUBJECT = 'Transaksi Tarik Tunai ATM Berhasil'
SUMMARY = 'Penarikan tunai sebesar Rp240.000 dengan kartu (**** **** **** 4321) berhasil.'
BODY = SUMMARY + '\n\nJika kamu tidak melakukan transaksi tarik tunai ATM, segera hubungi Krom Support di 1500 000.'


def receipt(**changes):
    row = {'account_id': 'akun-1', 'gmail_message_id': 'synthetic-atm-1',
           'thread_id': 'synthetic-thread', 'provider': 'KROM',
           'from': 'Krom <noreply@krom.id>', 'subject': SUBJECT,
           'internalDate': '1792463297000', 'body_normalized': BODY}
    row.update(changes)
    return row


class KromATMParserTests(unittest.TestCase):
    def test_summary_with_confirmed_card_is_expense_without_invented_fields(self):
        row, registry = receipt(), deepcopy(REGISTRY)
        before_row, before_registry = deepcopy(row), deepcopy(registry)
        out = mesh_parser.parse_email(row, registry)
        self.assertTrue(out['is_transaction'])
        self.assertTrue(out['eligible'], out['validation_errors'])
        self.assertEqual((out['event_type'], out['status']), ('expense', 'success'))
        self.assertEqual((out['source_wallet'], out['destination_wallet']), ('KROM', 'EXTERNAL'))
        self.assertEqual(out['source_identity'], '**** **** **** 4321')
        self.assertEqual(out['destination_identity'], 'Tarik tunai ATM Krom')
        self.assertEqual(out['amount'], 240000)
        for field in ('fee_paid', 'fee_displayed', 'total_debit', 'total_credit',
                      'reference', 'body_transaction_at', 'category_hint'):
            self.assertIsNone(out[field], field)
        self.assertEqual(out['note'], SUBJECT)
        self.assertEqual(out['time_source'], 'internalDate')
        self.assertEqual(out['notification_at'], '2026-10-20T02:28:17+00:00')
        self.assertEqual(out['raw_fields']['body_normalized'], BODY)
        self.assertEqual(row, before_row)
        self.assertEqual(registry, before_registry)
        self.assertEqual(Path(mesh_parser.__file__).resolve(), HERE / 'mesh_parser.py')

    def test_summary_must_be_unique_and_complete(self):
        for summary in (SUMMARY + '\n' + SUMMARY,
                        SUMMARY + '\n' + SUMMARY.replace('Rp240.000', 'Rp360.000'),
                        SUMMARY + '\n' + SUMMARY.replace('4321', '6789'),
                        SUMMARY + '\nPenarikan tunai sebesar malformed',
                        'Example: ' + SUMMARY,
                        SUMMARY + ' not the final receipt'):
            with self.subTest(summary=summary):
                out = mesh_parser.parse_email(receipt(body_normalized=summary), REGISTRY)
                self.assertTrue(out['is_transaction'])
                self.assertFalse(out['eligible'])
                self.assertIn('ambiguous_or_missing_atm_summary', out['validation_errors'])

    def test_card_requires_recognized_masked_endpoint_even_if_bad_value_has_alias(self):
        for card in ('', '4321', 'unrecognized', '1234 5678 9012 4321', '**** **** **** 432',
                     '**** **** **** 43210', '**** **** **** 4321 and ****6789'):
            with self.subTest(card=card):
                registry = deepcopy(REGISTRY)
                registry['aliases'][card] = 'KROM'
                out = mesh_parser.parse_email(receipt(body_normalized=BODY.replace(
                    '**** **** **** 4321', card)), registry)
                self.assertTrue(out['is_transaction'])
                self.assertFalse(out['eligible'])
                self.assertEqual(out['source_wallet'], 'UNRESOLVED')

    def test_card_aliases_require_exact_unique_match_including_compact_suffix(self):
        for aliases in ({'**** **** **** 4321': 'KROM'},
                        {'************4321': 'KROM'}, {'****4321': 'KROM'}):
            with self.subTest(aliases=aliases):
                registry = deepcopy(REGISTRY)
                registry['aliases'] = aliases
                out = mesh_parser.parse_email(receipt(), registry)
                self.assertTrue(out['eligible'], out['validation_errors'])
                self.assertEqual(out['source_wallet'], 'KROM')
        for aliases in ({'Krom': 'KROM'}, {'**** **** **** 6789': 'KROM'},
                        {'****4321': ['KROM', 'OTHER']}, {'****4321': 'OTHER'},
                        {'**** **** **** 4321': 'KROM', '****4321': 'OTHER'},
                        {'****4321': 'EXTERNAL'}, {'4321': 'KROM'}, {}):
            with self.subTest(aliases=aliases):
                registry = deepcopy(REGISTRY)
                registry['wallets']['OTHER'] = {'id': 'synthetic-other'}
                registry['aliases'] = aliases
                out = mesh_parser.parse_email(receipt(), registry)
                self.assertEqual(out['source_wallet'], 'UNRESOLVED')
                self.assertFalse(out['eligible'])
        registry = deepcopy(REGISTRY)
        registry['wallets'] = {}
        self.assertFalse(mesh_parser.parse_email(receipt(), registry)['eligible'])

    def test_failed_or_pending_withdrawal_overrides_stale_success_summary(self):
        for marker, expected in (('Penarikan tunai gagal', 'failed'),
                                 ('Transaksi tarik tunai ATM gagal', 'failed'),
                                 ('Penarikan tunai ditolak', 'failed'),
                                 ('Status Transaksi: Gagal', 'failed'),
                                 ('Status\nFailed', 'failed'),
                                 ('Status Penarikan: Ditolak', 'failed'),
                                 ('Penarikan tunai sedang diproses', 'pending'),
                                 ('Transaksi tarik tunai ATM diproses', 'pending'),
                                 ('Status Transaksi: Diproses', 'pending'),
                                 ('Status: Pending', 'pending'),
                                 ('Status Penarikan: Menunggu', 'pending')):
            with self.subTest(marker=marker):
                out = mesh_parser.parse_email(receipt(body_normalized=BODY + '\n' + marker), REGISTRY)
                self.assertEqual(out['status'], expected)
                self.assertFalse(out['eligible'])

    def test_unsupported_withdrawal_subject_stays_transaction_for_review(self):
        for subject in ('Transaksi Tarik Tunai ATM Gagal', 'Transaksi Tarik Tunai ATM Pending',
                        'Transaksi Tarik Tunai ATM format baru', 'Tarik Tunai ATM Berhasil',
                        'Penarikan Tunai ATM Berhasil'):
            with self.subTest(subject=subject):
                out = mesh_parser.parse_email(receipt(subject=subject, body_normalized='Receipt format baru'), REGISTRY)
                self.assertTrue(out['is_transaction'])
                self.assertFalse(out['eligible'])
                self.assertIn('unknown_template', out['validation_errors'])
        out = mesh_parser.parse_email(receipt(body_normalized='Penarikan selesai. Hubungi 1500 000.'), REGISTRY)
        self.assertTrue(out['is_transaction'])
        self.assertFalse(out['eligible'])
        self.assertIsNone(out['amount'])

    def test_amount_is_a_whole_positive_rupiah_summary_not_footer_number(self):
        for value in ('Rp0', 'Rp-240.000', 'Rp240.000,50', 'Rp240.00', 'Rp240.000USD',
                      'Rp240.000 extra', '240.000', 'IDR240.000', 'RpRp240.000', 'Rp', ''):
            with self.subTest(value=value):
                out = mesh_parser.parse_email(receipt(body_normalized=BODY.replace('Rp240.000', value)), REGISTRY)
                self.assertTrue(out['is_transaction'])
                self.assertFalse(out['eligible'])
        out = mesh_parser.parse_email(receipt(body_normalized='Jika kamu tidak melakukan transaksi tarik tunai ATM, hubungi 1500 000.\nJumlah: Rp990.000'), REGISTRY)
        self.assertTrue(out['is_transaction'])
        self.assertFalse(out['eligible'])
        self.assertIsNone(out['amount'])

    def test_marketing_and_statements_are_not_withdrawal_receipts(self):
        for subject in ('Promo Tarik Tunai ATM', 'Cashback penarikan tunai',
                        'Penawaran Transaksi Tarik Tunai ATM', 'Tarik tunai ATM diskon',
                        'e-Statement Tarik Tunai ATM', 'Laporan bulanan penarikan tunai',
                        'Verifikasi tarik tunai ATM', 'Survei tarik tunai ATM'):
            with self.subTest(subject=subject):
                out = mesh_parser.parse_email(receipt(subject=subject), REGISTRY)
                self.assertFalse(out['is_transaction'])
                self.assertFalse(out['eligible'])

    def test_sender_must_be_one_exact_mailbox_not_display_name_or_lookalike(self):
        for sender in ('noreply@krom.id', '"KROM" <NOREPLY@KROM.ID>'):
            with self.subTest(sender=sender):
                out = mesh_parser.parse_email(receipt(**{'from': sender}), REGISTRY)
                self.assertTrue(out['eligible'], out['validation_errors'])
        for sender in ('Krom <noreply@krom.id.evil.invalid>', 'Krom <noreply@evil-krom.id>',
                       '"noreply@krom.id" <fraud@example.invalid>', 'Other <other@krom.id>',
                       'Krom <noreply@krom.id>, fraud@example.invalid',
                       'noreply@krom.id>', '', 'fraud@example.invalid'):
            with self.subTest(sender=sender):
                out = mesh_parser.parse_email(receipt(**{'from': sender}), REGISTRY)
                self.assertFalse(out['eligible'])
                self.assertFalse(out['is_transaction'])

    def test_active_account_message_and_notification_gates_still_apply(self):
        for changes, error in (({'account_id': 'akun-2'}, 'inactive_account'),
                               ({'gmail_message_id': None}, 'missing_gmail_message_id'),
                               ({'internalDate': None}, 'missing_notification_time'),
                               ({'internalDate': 'invalid'}, 'invalid_notification_time:internalDate')):
            with self.subTest(changes=changes):
                out = mesh_parser.parse_email(receipt(**changes), REGISTRY)
                self.assertTrue(out['is_transaction'])
                self.assertFalse(out['eligible'])
                self.assertIn(error, out['validation_errors'])

    def test_valid_amount_variants_plain_fallback_and_footer_caution(self):
        for amount in ('Rp240000', 'Rp240.000', 'Rp 240.000,00'):
            row = receipt(body_normalized='', body_plain=BODY.replace('Rp240.000', amount))
            out = mesh_parser.parse_email(row, REGISTRY)
            with self.subTest(amount=amount):
                self.assertTrue(out['eligible'], out['validation_errors'])
                self.assertEqual(out['amount'], 240000)
                self.assertIsNone(out['total_debit'])
                self.assertIsNone(out['fee_paid'])
                self.assertEqual(out['status'], 'success')


class KromATMEngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cfg = config(Path(self.temp.name))
        self.cfg['registry'] = deepcopy(REGISTRY)
        self.cfg['registry']['aliases'] = {'****4321': 'KROM'}
        self.cfg['sender_allowlist'] = {'noreply@krom.id': 'KROM'}
        self.cfg['categories'] = []
        self.addCleanup(patch.stopall)
        patch('socket.socket', side_effect=AssertionError('network forbidden')).start()
        patch('socket.getaddrinfo', side_effect=AssertionError('network forbidden')).start()

    def engine(self):
        self.assertEqual(Path(mesh.__file__).resolve(), HERE / 'mesh.py')
        self.assertFalse(self.cfg['publish_enabled'])
        return mesh.Engine(self.cfg, now=lambda: datetime(2026, 10, 20, 3, tzinfo=timezone.utc))

    def assert_attacks_rejected(self, additions, error):
        rows = [receipt(gmail_message_id='synthetic-attack-' + str(index),
                        body_normalized=BODY + '\n' + addition)
                for index, addition in enumerate(additions)]
        with self.engine() as engine:
            engine.ingest(rows)
            for row in rows:
                with self.subTest(addition=row['body_normalized'][len(BODY):]):
                    candidate = engine.db.execute(
                        'SELECT parsed,reason,event_id FROM candidates WHERE message=?',
                        (row['gmail_message_id'],)).fetchone()
                    out = json.loads(candidate['parsed'])
                    self.assertTrue(out['is_transaction'])
                    self.assertFalse(out['eligible'], out['validation_errors'])
                    self.assertIn(error, out['validation_errors'])
                    self.assertEqual(candidate['reason'], 'ineligible')
                    self.assertIsNone(candidate['event_id'])
                    for field in ('fee_paid', 'fee_displayed', 'total_debit', 'total_credit',
                                  'reference', 'body_transaction_at', 'category_hint'):
                        self.assertIsNone(out[field], field)
            self.assertEqual(engine.status()['events'], 0)
            self.assertEqual(engine.status()['movements'], 0)
            self.assertEqual(engine.status()['outbox_pending'], 0)
            self.assertEqual(engine.db.execute('SELECT count(*) FROM outbox').fetchone()[0], 0)
            self.assertEqual(engine.db.execute('SELECT count(*) FROM event_evidence').fetchone()[0], 0)
            self.assertEqual(engine.status()['quarantined'], len(rows))

    def test_additional_summary_whitespace_and_case_variants_never_post(self):
        second = SUMMARY.replace('Rp240.000', 'Rp360.000')
        self.assert_attacks_rejected((
            second.replace('Penarikan tunai', 'Penarikan  tunai'),
            second.upper(),
            second.replace(' tunai sebesar ', '\ttunai\tsebesar '),
            second.replace('Penarikan tunai sebesar', 'Penarikan\ntunai\nsebesar'),
            'pEnArIkAn  TuNaI\tSeBeSaR malformed',
            'Example: ' + second.replace('tunai sebesar', 'tunai   sebesar'),
        ), 'ambiguous_or_missing_atm_summary')

    def test_extra_card_and_amount_labels_never_post(self):
        self.assert_attacks_rejected((
            'Nomor Kartu: **** **** **** 6789',
            'nomor  kartu\n**** **** **** 6789',
            'NOMOR\nKARTU : **** **** **** 6789',
            'No. Kartu **** **** **** 6789',
            'Card Number: **** **** **** 6789',
            'card\nnumber\n**** **** **** 6789',
            'Card **** **** **** 6789',
            'Kartu: **** **** **** 6789',
            'Jumlah: Rp360.000',
            'jumlah\nRp360.000',
            'JUMLAH Rp360.000',
            'Nominal Transaksi: Rp360.000',
            'nominal\npenarikan\nRp360.000',
            'Amount: Rp360.000',
            'aMoUnT\nRp360.000',
            'Jumlah: Rp240.000',
            'Nomor Kartu: **** **** **** 4321',
            'Jumlah: not-a-money-value',
        ), 'unsupported_atm_financial_field')

    def test_extra_fee_and_total_labels_never_post_or_infer_amounts(self):
        self.assert_attacks_rejected((
            'Biaya: Rp6.500\nTotal: Rp246.500',
            'Total: Rp360.000',
            'biaya\nRp6.500\ntotal\nRp246.500',
            'BIAYA ADMIN Rp6.500\nTOTAL DEBIT Rp246.500',
            'Biaya\nAdministrasi :\nRp6.500',
            'Fee: Rp6.500',
            'ADMIN\nFEE Rp6.500',
            'Fees Rp6.500',
            'Transaction Charge: Rp6.500',
            'Charges\nRp6.500',
            'Debit: Rp360.000',
            'Debet Rp360.000',
            'Credit: Rp360.000',
            'Kredit\nRp360.000',
            'Total: Rp240.000',
            'Biaya: Rp0',
            'Total: malformed',
            'Detail: Total Rp360.000',
        ), 'unsupported_atm_financial_field')

    def test_any_extra_stated_status_is_unsupported_and_never_posts(self):
        self.assert_attacks_rejected((
            'Status Transaksi: Tidak sukses',
            'STATUS  TRANSAKSI Tidak sukses',
            'status\ntransaksi\nTidak sukses',
            'Status Penarikan: Tidak sukses',
            'status:\nUnrecognized result',
            'Status Unknown',
            'Transaction Status: Unsuccessful',
            'transaction\nstatus\nUnsuccessful',
            'Withdrawal Status Unsuccessful',
            'Detail: Status Transaksi: Tidak sukses',
            'Status Transaksi: Berhasil',
            'Status Success',
            'Status:',
        ), 'unsupported_atm_status_field')

    def test_one_expense_movement_and_restart_duplicate_protection(self):
        row = receipt()
        with self.engine() as engine:
            engine.ingest([row, deepcopy(row)])
            self.assertEqual(engine.status()['events'], 1)
            self.assertEqual(engine.status()['movements'], 1)
            self.assertEqual(engine.status()['evidence'], 1)
            self.assertEqual(engine.status()['quarantined'], 0)
            payload = json.loads(engine.db.execute('SELECT payload FROM outbox').fetchone()[0])
            self.assertEqual(payload['movements'], [{'wallet': 'synthetic-krom', 'field': 'balance', 'delta': -240000}])
            self.assertEqual(len(payload['components']), 1)
            component = payload['components'][0]
            self.assertEqual((component['type'], component['amount'], component['walletId']),
                             ('expense', 240000, 'synthetic-krom'))
            self.assertEqual(component['mesh_type'], 'OUTGOING')
            self.assertIsNone(component['toWalletId'])
            self.assertIsNone(component['categoryId'])
            self.assertEqual(component['note'], SUBJECT)
            self.assertEqual(payload['parsed']['destination_identity'], 'Tarik tunai ATM Krom')
            for field in ('fee_paid', 'fee_displayed', 'total_debit', 'total_credit', 'reference'):
                self.assertIsNone(payload['parsed'][field], field)
            self.assertEqual(json.loads(engine.db.execute('SELECT raw FROM evidence').fetchone()[0]), row)
            event_id = engine.db.execute('SELECT id FROM events').fetchone()[0]
        with self.engine() as engine:
            engine.ingest([row, receipt(gmail_message_id='synthetic-second-evidence')])
            self.assertEqual(engine.status()['events'], 1)
            self.assertEqual(engine.status()['movements'], 1)
            self.assertEqual(engine.status()['evidence'], 2)
            self.assertEqual(engine.status()['outbox_pending'], 1)
            self.assertEqual(engine.db.execute('SELECT count(*) FROM event_evidence').fetchone()[0], 1)
            self.assertEqual(engine.db.execute('SELECT sum(delta) FROM movements').fetchone()[0], -240000)
            self.assertEqual(engine.db.execute('SELECT id FROM events').fetchone()[0], event_id)
            duplicate = engine.db.execute("SELECT reason,event_id FROM candidates WHERE message='synthetic-second-evidence'").fetchone()
            self.assertEqual(duplicate['reason'], 'reference_missing_duplicate_uncertain')
            self.assertIsNone(duplicate['event_id'])

    def test_invalid_and_unsupported_receipts_never_create_financial_plan(self):
        rows = [receipt(gmail_message_id='unknown', subject='Transaksi Tarik Tunai ATM format baru'),
                receipt(gmail_message_id='unknown-card', body_normalized=BODY.replace('4321', '6789')),
                receipt(gmail_message_id='missing-card', body_normalized=BODY.replace(' (**** **** **** 4321)', '')),
                receipt(gmail_message_id='malformed-money', body_normalized=BODY.replace('Rp240.000', 'Rp240.000USD')),
                receipt(gmail_message_id='zero', body_normalized=BODY.replace('Rp240.000', 'Rp0')),
                receipt(gmail_message_id='fraction', body_normalized=BODY.replace('Rp240.000', 'Rp240.000,50')),
                receipt(gmail_message_id='duplicate-summary', body_normalized=BODY + '\n' + SUMMARY),
                receipt(gmail_message_id='failed', body_normalized=BODY + '\nStatus Transaksi: Gagal'),
                receipt(gmail_message_id='pending', body_normalized=BODY + '\nPenarikan tunai sedang diproses'),
                receipt(gmail_message_id='no-time', internalDate=None),
                receipt(gmail_message_id='lookalike', **{'from': 'Krom <noreply@krom.id.evil.invalid>'}),
                receipt(gmail_message_id='two-senders', **{'from': 'Krom <noreply@krom.id>, fraud@example.invalid'}),
                receipt(gmail_message_id='marketing', subject='Promo Tarik Tunai ATM'),
                receipt(gmail_message_id='statement', subject='e-Statement penarikan tunai')]
        with self.engine() as engine:
            engine.ingest(rows)
            self.assertEqual(engine.status()['events'], 0)
            self.assertEqual(engine.status()['movements'], 0)
            self.assertEqual(engine.status()['outbox_pending'], 0)
            for row in rows:
                with self.subTest(message=row['gmail_message_id']):
                    candidate = engine.db.execute('SELECT parsed,reason,event_id FROM candidates WHERE message=?',
                                                  (row['gmail_message_id'],)).fetchone()
                    out = json.loads(candidate['parsed'])
                    self.assertFalse(out['eligible'])
                    self.assertIsNone(candidate['event_id'])
                    self.assertEqual(candidate['reason'], 'ineligible' if out['is_transaction'] else 'not_transaction')
            unknown = json.loads(engine.db.execute("SELECT parsed FROM candidates WHERE message='unknown'").fetchone()[0])
            self.assertIn('unknown_template', unknown['validation_errors'])
            self.assertEqual(engine.status()['quarantined'], 10)
        with self.engine() as engine:
            engine.ingest(rows)
            self.assertEqual(engine.status()['events'], 0)
            self.assertEqual(engine.status()['evidence'], len(rows))

    def test_unconfirmed_or_conflicting_card_alias_never_posts(self):
        for index, aliases in enumerate(({'Krom': 'KROM'}, {'****4321': 'OTHER'},
                                         {'**** **** **** 4321': 'KROM', '****4321': 'OTHER'})):
            with self.subTest(aliases=aliases):
                self.cfg['db_path'] = str(Path(self.temp.name) / ('alias-' + str(index) + '.sqlite3'))
                self.cfg['registry']['wallets']['OTHER'] = {'id': 'synthetic-other'}
                self.cfg['registry']['aliases'] = aliases
                with self.engine() as engine:
                    row = receipt(gmail_message_id='synthetic-case-' + str(len(aliases)) + '-' + str(aliases))
                    engine.ingest([row])
                    self.assertEqual(engine.status()['events'], 0)
                    self.assertEqual(engine.status()['movements'], 0)
                    self.assertEqual(engine.status()['outbox_pending'], 0)
                    candidate = engine.db.execute('SELECT parsed,event_id FROM candidates WHERE message=?',
                                                  (row['gmail_message_id'],)).fetchone()
                    self.assertEqual(json.loads(candidate['parsed'])['source_wallet'], 'UNRESOLVED')
                    self.assertIsNone(candidate['event_id'])

    def test_unlabelled_negative_outcome_whitespace_variants_never_post(self):
        self.assert_attacks_rejected([
            'Penarikan tunai tidak sukses',
            'Penarikan tunai tidak  berhasil',
            'Penarikan tunai tidak\nberhasil',
            'Penarikan tunai BELUM\tSUKSES',
            'Penarikan tunai not successful',
        ], 'unsupported_atm_outcome')

    def test_wrong_evidence_account_is_rejected_before_storage(self):
        with self.engine() as engine:
            with self.assertRaisesRegex(ValueError, 'wrong evidence account'):
                engine.ingest([receipt(account_id='akun-2')])
            self.assertEqual(engine.status()['events'], 0)
            self.assertEqual(engine.status()['evidence'], 0)
            self.assertEqual(engine.status()['movements'], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
