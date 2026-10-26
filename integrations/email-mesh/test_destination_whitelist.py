"""Offline whitelist tests using synthetic data only, never the personal upload."""
import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path


def whitelist(path, scope='synthetic-project:synthetic-uid'):
    assert importlib.util.find_spec('destination_whitelist'), 'destination_whitelist module missing'
    from destination_whitelist import DestinationWhitelist
    return DestinationWhitelist(path, scope)


class WhitelistTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.path = self.root / 'private' / 'whitelist.sqlite3'

    def tearDown(self):
        self.temp.cleanup()

    def csv(self, rows):
        path = self.root / 'synthetic.csv'
        with path.open('w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['row_id', 'destination', 'category', 'subcategory', 'verification_status'])
            writer.writeheader()
            writer.writerows(rows)
        return path

    def test_admin_import_deduplicates_exact_keys_preserves_origin_and_restart(self):
        rows = [dict(row_id=str(i), destination='Synthetic Merchant • 001', category='Belanja',
                     subcategory='Perlu review', verification_status='by system') for i in (1, 2)]
        with whitelist(self.path) as w:
            w.import_csv(self.csv(rows))
            self.assertEqual(len(w.records()), 1)
            r = w.lookup('Synthetic Merchant • 001')
            self.assertEqual((r['category'], r['tag'], r['source'], r['verification_status']),
                             ('Belanja', 'Perlu review', 'admin', 'by system'))
            self.assertEqual(r['row_ids'], ['1', '2'])
            self.assertEqual(w.lookup('synthetic merchant • 001')['destination'], 'Synthetic Merchant • 001')
            self.assertIsNone(w.lookup('Synthetic Merchant • 002'))
        with whitelist(self.path) as w:
            self.assertEqual(w.lookup('Synthetic Merchant • 001')['row_ids'], ['1', '2'])
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.path.parent.stat().st_mode & 0o777, 0o700)
        with whitelist(self.path, 'synthetic-project:another-uid') as w:
            self.assertEqual(w.records(), [])

    def test_safe_case_whitespace_lookup_keeps_literal_rows_and_identity(self):
        rows = [dict(row_id='1', destination='SYNTHETIC MERCHANT • 001', category='Belanja',
                     subcategory='Retail', verification_status='by admin'),
                dict(row_id='2', destination='synthetic  merchant • 001', category='Belanja',
                     subcategory='Retail', verification_status='by system')]
        with whitelist(self.path) as w:
            self.assertEqual(w.import_csv(self.csv(rows))['destinations'], 1)
            r = w.lookup(' Synthetic Merchant • 001 ')
            self.assertEqual(r['destination'], rows[0]['destination'])
            self.assertEqual(r['row_ids'], ['1', '2'])
            self.assertIsNone(w.lookup('Synthetic Merchant 001'))
            self.assertIsNone(w.lookup('Synthetic Merchant • 002'))

    def test_observe_unknown_is_idempotent_durable_and_minimal_context(self):
        with whitelist(self.path) as w:
            self.assertTrue(w.observe('Synthetic New • 001', provider='BRI', event_id='event-1',
                                      context={'event_type': 'qris_payment', 'note': 'secret', 'body_normalized': 'secret'}))
            w.observe(' synthetic new • 001 ', provider='BRI', event_id='event-1', context={'event_type': 'other'})
            w.observe('Synthetic New • 001', provider='Jago', event_id='event-2')
            q = w.pending()[0]
            self.assertEqual(q['destination'], 'Synthetic New • 001')
            self.assertEqual(q['state'], 'pending')
            self.assertEqual(q['provider'], 'BRI')
            self.assertEqual(q['event_ids'], ['event-1', 'event-2'])
            self.assertEqual(q['context'], {'event_type': 'qris_payment'})
        with whitelist(self.path) as w:
            self.assertEqual(len(w.pending()), 1)
            self.assertIsNone(w.lookup('Synthetic New • 001'))

    def test_decisions_gate_llm_and_protect_admin_seed(self):
        with whitelist(self.path) as w:
            w.observe('Synthetic uncertain', provider='BRI', event_id='event-1')
            self.assertIsNone(w.decide('Synthetic uncertain', 'Digital', 'Perlu review', source='llm', confidence=0.89))
            self.assertIsNone(w.lookup('Synthetic uncertain'))
            self.assertEqual(w.pending()[0]['state'], 'admin_pending')
            r = w.decide('Synthetic uncertain', 'Digital', 'Software', source='llm', confidence=0.9)
            self.assertEqual(r['source'], 'llm')
            self.assertEqual(w.pending(), [])
            r = w.decide('Synthetic uncertain', 'Belanja', 'Retail', source='admin')
            self.assertEqual(r['source'], 'admin')
            w.decide('synthetic uncertain', 'Digital', 'Other', source='llm', confidence=1)
            self.assertEqual(w.lookup('Synthetic uncertain')['category'], 'Belanja')
            with self.assertRaises(ValueError):
                w.decide('Synthetic unknown', 'Invented category', 'Other', source='admin')
            self.assertIsNone(w.decide('Synthetic unknown', 'Invented category', 'Other', source='llm', confidence=1))
            self.assertEqual(w.pending()[0]['state'], 'admin_pending')

    def test_import_is_atomic_conflicts_rejected_and_resolves_pending(self):
        with whitelist(self.path) as w:
            w.observe('Synthetic pending', event_id='event-1')
            good = dict(row_id='1', destination='Synthetic pending', category='Belanja',
                        subcategory='Retail', verification_status='by system')
            bad = dict(good, row_id='2', destination='Another', category='Invalid')
            with self.assertRaises(ValueError):
                w.import_csv(self.csv([good, bad]))
            self.assertEqual(w.records(), [])
            conflicting = dict(good, row_id='2', destination='SYNTHETIC  PENDING', category='Digital')
            with self.assertRaises(ValueError):
                w.import_csv(self.csv([good, conflicting]))
            self.assertEqual(w.records(), [])
            w.import_csv(self.csv([good]))
            self.assertEqual(w.pending(), [])
            w.decide('Synthetic pending', 'Digital', 'Other', source='llm', confidence=1)
            self.assertEqual(w.lookup('Synthetic pending')['category'], 'Belanja')

    def test_concurrent_writers_do_not_replace_admin_or_lose_event_links(self):
        from concurrent.futures import ThreadPoolExecutor
        with whitelist(self.path) as w:
            w.decide('Synthetic protected', 'Belanja', 'Retail')
        def write(i):
            with whitelist(self.path) as w:
                w.observe('Synthetic shared', provider='BRI', event_id=f'event-{i}')
                w.decide('Synthetic protected', 'Digital', 'Software', source='llm', confidence=1)
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(write, range(12)))
        with whitelist(self.path) as w:
            self.assertEqual(w.lookup('Synthetic protected')['source'], 'admin')
            self.assertEqual(w.lookup('Synthetic protected')['category'], 'Belanja')
            self.assertEqual(len(w.pending()), 1)
            self.assertEqual(len(w.pending()[0]['event_ids']), 12)
            self.assertEqual(w.db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            for suffix in ('-wal', '-shm'):
                sidecar = Path(str(self.path) + suffix)
                if sidecar.exists():
                    self.assertEqual(sidecar.stat().st_mode & 0o777, 0o600)

    def test_invalid_model_confidences_stay_pending_and_namespaces_are_isolated(self):
        for confidence in (None, True, '1', -1, 1.1, float('nan'), float('inf')):
            with self.subTest(confidence=confidence), whitelist(self.path) as w:
                self.assertIsNone(w.decide('Synthetic uncertain', 'Digital', 'Software', source='llm', confidence=confidence))
                self.assertEqual(w.pending()[0]['state'], 'admin_pending')
                self.assertIsNone(w.lookup('Synthetic uncertain'))
        with whitelist(self.path, 'other-project:other-uid') as w:
            self.assertEqual(w.pending(), [])
            self.assertEqual(w.records(), [])
        for scope in ('uid', ':uid', 'project:', 'project:uid:extra'):
            with self.assertRaises(ValueError):
                whitelist(self.path, scope)
        with self.assertRaises(ValueError):
            whitelist(Path('relative.sqlite3'))

    def test_destination_extraction_is_scoped_literal_and_never_reads_body(self):
        from destination_whitelist import extract_destination
        self.assertEqual(extract_destination({'destination_identity': 'Generic payment', 'raw_fields': {
            'labelled_fields': {'Nama Merchant': 'Synthetic Merchant • 001'}}}), 'Synthetic Merchant • 001')
        self.assertEqual(extract_destination({'destination_identity': 'BRIZZI • 1234000012340001',
            'raw_fields': {'merchant': 'BRIZZI'}}), 'BRIZZI • 1234000012340001')
        self.assertEqual(extract_destination({'destination_identity': 'Synthetic Bank • 0001',
            'raw_fields': {'body_normalized': 'Other'}}), 'Synthetic Bank • 0001')
        for p in (None, [], {'note': 'PLN'}, {'body_normalized': 'merchant PLN'},
                  {'raw_fields': {'body_normalized': 'merchant PLN', 'Keterangan': 'PLN'}},
                  {'raw_fields': 'merchant PLN'}):
            self.assertIsNone(extract_destination(p))

    def test_existing_public_parent_is_rejected_without_chmod_other_directories(self):
        public = self.root / 'public'
        public.mkdir(mode=0o755)
        public.chmod(0o755)
        with self.assertRaises(ValueError):
            with whitelist(public / 'unsafe.sqlite3'):
                pass
        self.assertEqual(public.stat().st_mode & 0o777, 0o755)
        self.assertFalse((public / 'unsafe.sqlite3').exists())


if __name__ == '__main__':
    unittest.main()
