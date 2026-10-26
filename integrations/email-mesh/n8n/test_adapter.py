"""Synthetic adapter regressions; no installed scheduler/state access."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ADAPTER = HERE / 'adapter.py'
sys.path.insert(0, str(HERE.parent))


def load():
    spec = importlib.util.spec_from_file_location('mesh_n8n_adapter', ADAPTER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.module = load()
        self.profile = self.root / 'configured-profile'
        self.profile.mkdir()
        (self.profile / 'config.yaml').write_text('{}')
        self.config = self.root / 'config.json'
        self.db_path = self.root / 'state.sqlite3'
        self.review = self.root / 'review.sqlite3'
        self.c = dict(project_id='budgetku-app-v1', uid='VCqdnx9zvJVrZQSNp6gyGm6Zzhr2',
                      db_path=str(self.db_path), financial_review_state_path=str(self.review))
        self.config.write_text(json.dumps(self.c))
        self.env = dict(BUDGETX_MESH_ROOT=str(HERE.parent), BUDGETX_MESH_CONFIG=str(self.config),
                        HERMES_HOME=str(self.profile), BUDGETX_N8N_ALLOW_LIVE='1')
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, self.env, clear=True).start()

    def live(self, action='pipeline', runner=None):
        with patch.object(self.module, 'legacy_is_active', return_value=False):
            return self.module.dispatch(action, 'live', runner=runner)

    def test_pipeline_cli_defaults_to_preview_without_paths_or_state(self):
        env = dict(os.environ, HERMES_HOME='/does-not-exist', BUDGETX_MESH_CONFIG='/does-not-exist')
        result = subprocess.run([sys.executable, str(ADAPTER), 'pipeline'], capture_output=True, text=True, env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertTrue(data['ok'])
        self.assertEqual(data['mode'], 'preview')
        self.assertFalse(data['executed'])
        self.assertIn('financial_review_and_approved_publication', data['stages'])

    def test_live_is_blocked_by_independent_legacy_guard(self):
        with patch.object(self.module, 'legacy_is_active', return_value=True), patch.object(self.module.subprocess, 'run') as run:
            result = self.module.dispatch('pipeline', 'live')
        self.assertEqual(result['error'], 'LegacySchedulerStillEnabled')
        run.assert_not_called()

    def test_live_commands_are_allowlisted_and_output_sanitized(self):
        for action, final in [('pipeline', 'run'), ('watchdog', 'watch'), ('backup', 'backup'),
                              ('classification', str(self.config)), ('review', '--notify-only')]:
            calls = []
            def runner(command, **kwargs):
                calls.append((command, kwargs))
                return subprocess.CompletedProcess(command, 0, '{"code":0,"outbox_pending":0,"secret":"never-export"}', '')
            result = self.live(action, runner)
            self.assertTrue(result['executed'], result)
            self.assertEqual(calls[0][0][-1], final)
            self.assertEqual(calls[0][1]['env']['HERMES_HOME'], str(self.profile))
            self.assertFalse(calls[0][1]['shell'])
            self.assertEqual(result['metrics']['outbox_pending'], 0)
            self.assertNotIn('never-export', json.dumps(result))

    def test_invalid_actions_modes_scope_and_live_arming_fail_closed(self):
        with patch.dict(os.environ, {'BUDGETX_N8N_ALLOW_LIVE': '0'}):
            self.assertEqual(self.module.dispatch('pipeline', 'live')['error'], 'LiveExecutionNotArmed')
        for action, mode in [('reset-checkpoint', 'preview'), ('pipeline', 'LIVE'),
                             ('pipeline; date', 'live'), ('pipeline', 'inspect')]:
            result = self.module.dispatch(action, mode)
            self.assertFalse(result['ok'])
            self.assertFalse(result['executed'])
        self.c['uid'] = 'different-scope'
        self.config.write_text(json.dumps(self.c))
        result = self.live(runner=lambda *a, **k: self.fail('wrong scope executed'))
        self.assertFalse(result['ok'])

    def test_process_errors_and_component_failure_are_sanitized(self):
        for response in [subprocess.CompletedProcess([], 1, '', 'private-error'),
                         subprocess.CompletedProcess([], 0, 'private-error', ''),
                         subprocess.CompletedProcess([], 0, '{"code":0,"category_error":"private-error"}', '')]:
            result = self.live(runner=lambda *a, **k: response)
            self.assertFalse(result['ok'])
            self.assertNotIn('private-error', json.dumps(result))
        def timeout(*a, **k):
            raise subprocess.TimeoutExpired('private-error', 400, stderr='private-error')
        self.assertEqual(self.live(runner=timeout)['error'], 'TimeoutExpired')
        self.assertTrue(self.live(runner=lambda *a, **k: subprocess.CompletedProcess([], 0, '', ''))['skipped'])

    def test_status_inspects_only_scoped_counts_without_mutation(self):
        scope = self.module.SCOPE
        with sqlite3.connect(self.db_path) as db:
            db.executescript('CREATE TABLE events(scope TEXT); CREATE TABLE outbox(scope TEXT,state TEXT); CREATE TABLE candidates(scope TEXT,reason TEXT);')
            db.executemany('INSERT INTO events VALUES (?)', [(scope,), ('other',)])
        with sqlite3.connect(self.review) as db:
            db.execute('CREATE TABLE reviews(scope TEXT,state TEXT)')
            db.executemany('INSERT INTO reviews VALUES (?,?)', [(scope, 'pending'), ('other', 'pending')])
        before = {p: p.read_bytes() for p in (self.config, self.db_path, self.review)}
        result = self.module.dispatch('status', 'inspect')
        self.assertTrue(result['ok'], result)
        self.assertTrue(result['read_only'])
        self.assertEqual(result['metrics']['events'], 1)
        self.assertEqual(result['metrics']['reviews_pending'], 1)
        self.assertEqual(before, {p: p.read_bytes() for p in before})
        self.db_path.unlink()
        self.assertFalse(self.module.dispatch('status', 'inspect')['ok'])
        self.assertFalse(self.db_path.exists(), 'inspect must not create a missing DB')

    def test_backup_verification_uses_only_synthetic_existing_bundle(self):
        import hashlib
        import ops
        bundle = self.root / 'backups/backup-1000000'
        bundle.mkdir(parents=True)
        snapshot_db = bundle / 'state.sqlite3'
        with sqlite3.connect(snapshot_db) as db:
            db.execute('CREATE TABLE synthetic(value TEXT)')
            db.execute('INSERT INTO synthetic VALUES (?)', ('fixture',))
        (bundle / 'config.json').write_text(json.dumps(self.c))
        snapshot = ops.snapshot(dict(self.c, db_path=str(snapshot_db)))
        files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in bundle.iterdir()}
        (bundle / 'manifest.json').write_text(json.dumps(dict(files=files, snapshot=snapshot)))
        before = {p: p.read_bytes() for p in bundle.iterdir()}
        result = self.module.dispatch('verify-backup', 'inspect')
        self.assertTrue(result['ok'], result)
        self.assertTrue(result['read_only'])
        self.assertTrue(result['verified'])
        self.assertEqual(result['metrics']['verified_tables'], 1)
        self.assertEqual(before, {p: p.read_bytes() for p in bundle.iterdir()})
        snapshot_db.write_bytes(b'corrupt synthetic fixture')
        self.assertFalse(self.module.dispatch('verify-backup', 'inspect')['ok'])

    def test_legacy_job_detection_fails_closed_on_missing_or_ambiguous_jobs(self):
        cron = self.profile / 'cron'
        cron.mkdir()
        jobs = cron / 'jobs.json'
        for data, active in [({'jobs': [{'name':'budgetx-email-mesh-demo','enabled':False}]}, False),
                             ({'jobs': {'fixture': {'name':'budgetx-email-mesh-demo','enabled':False}}}, False),
                             ({'jobs': [{'name':'budgetx-email-mesh-demo','enabled':True}]}, True),
                             ({'jobs': [{'name':'budgetx-email-mesh-demo'}]}, True), ({}, True),
                             ({'jobs': [{'name':'budgetx-email-mesh-demo','enabled':False},
                                         {'name':'budgetx-email-mesh-demo','enabled':True}]}, True)]:
            jobs.write_text(json.dumps(data))
            self.assertIs(self.module.legacy_is_active('pipeline'), active)
        with patch.dict(os.environ, {'BUDGETX_MESH_ROOT': 'invalid-relative-root'}), \
                patch.object(self.module, 'runtime_paths', side_effect=AssertionError('guard coupled to runtime paths')):
            jobs.write_text(json.dumps({'jobs': [{'name':'budgetx-email-mesh-demo','enabled':False}]}))
            self.assertFalse(self.module.legacy_is_active('pipeline'))
        jobs.write_text('malformed')
        self.assertTrue(self.module.legacy_is_active('pipeline'))
        jobs.unlink()
        self.assertTrue(self.module.legacy_is_active('pipeline'))

    def test_legacy_timer_must_be_disabled_and_inactive_not_merely_stopped(self):
        for active_code, active, enabled_code, enabled, blocked in [
                (3, 'inactive', 1, 'disabled', False), (3, 'inactive', 0, 'enabled', True),
                (0, 'active', 1, 'disabled', True), (4, 'unknown', 1, 'disabled', True),
                (3, 'inactive', 1, 'not-found', True)]:
            def run(command, **kwargs):
                code, output = (active_code, active) if 'is-active' in command else (enabled_code, enabled)
                return subprocess.CompletedProcess(command, code, output, '')
            with self.subTest(active=active, enabled=enabled), patch.object(self.module.subprocess, 'run', side_effect=run):
                self.assertIs(self.module.legacy_is_active('watchdog'), blocked)
        with patch.object(self.module.subprocess, 'run', side_effect=OSError('no systemctl')):
            self.assertTrue(self.module.legacy_is_active('backup'))


if __name__ == '__main__':
    unittest.main()
