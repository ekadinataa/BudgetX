"""Offline operations checks; no production DB or network."""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from test_mesh import config, parsed, row
from mesh import Engine
import ops


class OpsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.c = config(self.root)
        self.c['publish_enabled'] = True
        self.cp = self.root / 'config.json'
        self.cp.write_text(json.dumps(self.c))
        self.cp.chmod(0o600)
        with Engine(self.c, parser=lambda *_: parsed()) as e:
            e.db.execute('INSERT INTO mailbox VALUES(?,?,?,?)', ('akun-1', 'simulation@example.invalid', '123', '2026-10-07T00:30:00+00:00'))
            e.db.commit()
            e.ingest([row('new')])

    def tearDown(self):
        self.tmp.cleanup()

    def test_backup_restore_keeps_cursor_outbox_markers_and_restart(self):
        original = ops.snapshot(self.c)
        bundle = ops.backup(self.cp, self.root / 'backups', now=1000, keep=2)
        self.assertEqual(ops.verify_backup(bundle), original)
        self.assertEqual(bundle.stat().st_mode & 0o777, 0o700)
        self.assertEqual((bundle / 'state.sqlite3').stat().st_mode & 0o777, 0o600)
        restored = json.loads((bundle / 'config.json').read_text())
        restored['db_path'] = str(bundle / 'state.sqlite3')
        for _ in range(2):
            with Engine(restored) as e:
                self.assertEqual(e.status()['outbox_pending'], 1)
                self.assertEqual(e.status()['mailbox']['cursor'], '123')
        self.assertEqual(ops.snapshot(restored), original)
        (bundle / 'config.json').write_text('{}')
        with self.assertRaises(ValueError):
            ops.verify_backup(bundle)

    def test_retention_keeps_recent_verified_backups(self):
        for now in (1000, 2000, 3000):
            ops.backup(self.cp, self.root / 'backups', now=now, keep=2)
        self.assertEqual(len(list((self.root / 'backups').glob('backup-*'))), 2)

    def test_health_no_delta_is_healthy_and_failed_publication_visible(self):
        now = 1791333600  # 2026-10-07 00:40 UTC
        with sqlite3.connect(self.c['db_path']) as db:
            db.execute("UPDATE outbox SET state='sent'")
        run = {'finished': now - 60, 'code': 0, 'failures': 0}
        self.assertEqual(ops.assess(self.c, run, now), [])
        stale = ops.assess(self.c, dict(run, finished=now - 901), now)
        self.assertIn('Tidak ada run selesai >15 menit', stale)
        failed = ops.assess(self.c, dict(run, code=1, failures=3), now)
        self.assertIn('Pipeline gagal 3 kali berurutan', failed)
        with sqlite3.connect(self.c['db_path']) as db:
            db.execute("UPDATE outbox SET state='pending', attempts=3, error='Exception'")
        self.assertTrue(any('Outbox' in x for x in ops.assess(self.c, run, now)))

    def test_old_pending_outbox_is_alerted_before_three_attempts(self):
        now = 1791333600
        with sqlite3.connect(self.c['db_path']) as db:
            db.execute('UPDATE events SET at=?', (now - 1000,))
        self.assertTrue(any('Outbox tertahan' in x for x in ops.assess(self.c, {'finished': now, 'code': 0}, now)))

    def test_alert_dedup_delivery_retry_recovery_no_private_details(self):
        state = self.root / 'alerts.json'
        calls = []
        send = lambda text: calls.append(text) or True
        issues = ['Pipeline gagal 3 kali berurutan']
        self.assertTrue(ops.notify(issues, state, send, 1000))
        self.assertFalse(ops.notify(issues, state, send, 1001))
        self.assertTrue(ops.notify(issues, state, send, 1000 + 21600))
        self.assertTrue(ops.notify([], state, send, 22601))
        self.assertIn('pulih', calls[-1])
        self.assertFalse(ops.notify(issues, state, lambda _: False, 23000))
        self.assertTrue(ops.notify(issues, state, send, 23001))
        self.assertNotIn('simulation@example.invalid', ''.join(calls))

    def test_disabled_publication_is_not_healthy(self):
        self.c['publish_enabled'] = False
        now = 1791333600
        issues = ops.assess(self.c, {'finished': now, 'code': 0}, now)
        self.assertIn('Publikasi dinonaktifkan; delta tidak dikirim ke BudgetX', issues)

    def test_runner_records_failures_without_exposing_process_output(self):
        def fail(_):
            return 1, {'error': 'RefreshError', 'mailbox': {'email': 'private@example.invalid'}}
        for _ in range(3):
            result = ops.run(self.cp, execute=fail, now=1000)
        self.assertEqual(result['failures'], 3)
        text = (self.root / 'ops-run.json').read_text()
        self.assertNotIn('private@example.invalid', text)
        self.assertEqual(result['error'], 'RefreshError')
        result = ops.run(self.cp, execute=lambda _: (0, {}), now=1001)
        self.assertEqual(result['failures'], 0)

    def test_category_hook_failure_does_not_replay_or_fail_financial_job(self):
        self.c['destination_classification_enabled'] = True
        self.cp.write_text(json.dumps(self.c))
        calls=[]
        result=ops.run(self.cp, execute=lambda _: (0, {'outbox_pending':0}), now=1001,
                       category_execute=lambda p: calls.append(str(p)) or (1, {'error':'SyntheticCategoryFailure'}))
        self.assertEqual(calls,[str(self.cp)])
        self.assertEqual(result['code'],0)
        self.assertEqual(result['failures'],0)
        self.assertEqual(result['category_error'],'SyntheticCategoryFailure')
        self.assertTrue(any('Klasifikasi' in x for x in ops.assess(self.c,result,1001)))

    def test_backup_includes_whitelist_database_when_configured(self):
        wl = self.root / 'whitelist.sqlite3'
        with sqlite3.connect(wl) as db:
            db.execute('CREATE TABLE test(destination TEXT)')
            db.execute('INSERT INTO test VALUES(?)', ('Synthetic shop',))
        self.c['destination_whitelist_path'] = str(wl)
        self.cp.write_text(json.dumps(self.c))
        bundle = ops.backup(self.cp, self.root / 'backups', now=9999)
        self.assertTrue((bundle / 'whitelist.sqlite3').exists(), 'whitelist missing from recovery backup')
        with sqlite3.connect(bundle / 'whitelist.sqlite3') as db:
            self.assertEqual(db.execute('SELECT * FROM test').fetchall(), [('Synthetic shop',)])
        self.assertEqual((bundle / 'whitelist.sqlite3').stat().st_mode & 0o777, 0o600)
        ops.verify_backup(bundle)
        worker_db = Path(str(wl) + '.category-worker.sqlite3')
        with sqlite3.connect(worker_db) as db:
            db.execute('CREATE TABLE test(destination TEXT)')
            db.execute('INSERT INTO test VALUES(?)', ('Synthetic audit',))
        bundle2 = ops.backup(self.cp, self.root / 'backups', now=10000)
        self.assertTrue((bundle2 / 'category-worker.sqlite3').exists(), 'LLM audit missing from recovery backup')
        with sqlite3.connect(bundle2 / 'category-worker.sqlite3') as db:
            self.assertEqual(db.execute('SELECT * FROM test').fetchall(), [('Synthetic audit',)])
        ops.verify_backup(bundle2)

if __name__ == '__main__':
    unittest.main()
