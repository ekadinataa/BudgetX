"""Offline profile-isolation regressions for classifier and notification subprocesses."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import category_worker as worker
from test_category_worker import decision, stream


class CategoryProfileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.profile = self.root / 'active profile'
        self.profile.mkdir()
        (self.profile / 'config.yaml').write_text('model: {}\n')
        executable = patch.object(worker, 'HERMES', '/synthetic/bin/hermes')
        executable.start()
        self.addCleanup(executable.stop)

    def test_classifier_uses_active_profile_for_credentials_and_cwd(self):
        with patch.dict(os.environ, {'HERMES_HOME': str(self.profile)}), patch.object(worker.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = stream()
            result = worker.classify_with_hermes('Synthetic Cafe')
        self.assertEqual(result, decision())
        self.assertEqual(run.call_args.kwargs['env']['HERMES_HOME'], str(self.profile))
        self.assertEqual(run.call_args.kwargs['cwd'], str(self.profile))

    def test_notifier_uses_same_active_profile_without_changing_target(self):
        from destination_whitelist import DestinationWhitelist
        config = {'project_id': 'synthetic-project', 'uid': 'synthetic-user',
                  'destination_whitelist_path': str(self.root / 'whitelist.sqlite3'),
                  'destination_classification_notify_admin': True,
                  'ops_alert_target': 'telegram:790484718'}
        with DestinationWhitelist(config['destination_whitelist_path'], 'synthetic-project:synthetic-user') as whitelist:
            whitelist.observe('Synthetic Ambiguous Person', event_id='synthetic-event')
        with patch.dict(os.environ, {'HERMES_HOME': str(self.profile)}), patch.object(worker.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = json.dumps({'success': True, 'message_id': 'synthetic-42'})
            result = worker.run_worker(config, notify_admin=True,
                classifier=lambda *_args, **_kwargs: decision(confidence=0.4, needs_admin=True), now=lambda: 100)
        self.assertEqual(result['notified'], 1)
        self.assertEqual(run.call_args.kwargs['env']['HERMES_HOME'], str(self.profile))
        self.assertEqual(run.call_args.kwargs['cwd'], str(self.profile))
        self.assertEqual(run.call_args.args[0], [worker.HERMES, 'send', '--to', config['ops_alert_target'], '--json', '--file', '-'])

    def test_invalid_or_missing_profile_fails_closed_before_subprocess(self):
        no_config = self.root / 'no-config'
        no_config.mkdir()
        values = (None, '', 'relative-profile', str(self.root / 'missing'), str(no_config))
        for value in values:
            with self.subTest(value=value), patch.dict(os.environ, {}, clear=False), patch.object(worker.subprocess, 'run') as run:
                if value is None:
                    os.environ.pop('HERMES_HOME', None)
                else:
                    os.environ['HERMES_HOME'] = value
                run.return_value.returncode = 0
                run.return_value.stdout = stream()
                with self.assertRaisesRegex(ValueError, 'HERMES_HOME'):
                    worker.classify_with_hermes('Synthetic Cafe')
                run.assert_not_called()

    def test_profile_selection_is_resolved_for_each_call_not_at_import(self):
        other = self.root / 'another-profile'
        other.mkdir()
        (other / 'config.yaml').write_text('model: {}\n')
        for profile in (self.profile, other):
            with patch.dict(os.environ, {'HERMES_HOME': str(profile)}), patch.object(worker.subprocess, 'run') as run:
                run.return_value.returncode = 0
                run.return_value.stdout = stream()
                worker.classify_with_hermes('Synthetic Cafe')
                self.assertEqual(run.call_args.kwargs['cwd'], str(profile))
                self.assertEqual(run.call_args.kwargs['env']['HERMES_HOME'], str(profile))

    def test_parent_dispatch_context_is_removed_without_mutating_parent_env(self):
        values = {'HERMES_HOME': str(self.profile), 'HERMES_KANBAN_BOARD': 'synthetic-board',
                  'HERMES_PARENT_SESSION_ID': 'synthetic-parent', 'HERMES_DELEGATION_ID': 'synthetic-child'}
        with patch.dict(os.environ, values):
            env = worker._hermes_env()
            self.assertEqual(env['HERMES_HOME'], str(self.profile))
            for key in values:
                if key != 'HERMES_HOME':
                    self.assertNotIn(key, env)
                    self.assertEqual(os.environ[key], values[key])

    def test_notifier_with_missing_profile_defers_without_sending(self):
        from destination_whitelist import DestinationWhitelist
        config = {'project_id': 'synthetic-project', 'uid': 'synthetic-user',
                  'destination_whitelist_path': str(self.root / 'whitelist.sqlite3'),
                  'destination_classification_notify_admin': True}
        with DestinationWhitelist(config['destination_whitelist_path'], 'synthetic-project:synthetic-user') as whitelist:
            whitelist.observe('Synthetic Ambiguous Person', event_id='synthetic-event')
        with patch.dict(os.environ, {}, clear=False), patch.object(worker.subprocess, 'run') as run:
            os.environ.pop('HERMES_HOME', None)
            result = worker.run_worker(config, notify_admin=True,
                classifier=lambda *_args, **_kwargs: decision(confidence=0.4, needs_admin=True), now=lambda: 100)
        self.assertEqual(result['notified'], 0)
        run.assert_not_called()
        import sqlite3
        from contextlib import closing
        with closing(sqlite3.connect(worker.worker_paths(config)[1])) as db:
            self.assertEqual(db.execute('SELECT notified_at FROM jobs').fetchone()[0], None)
            self.assertEqual(db.execute('SELECT outcome FROM audit ORDER BY id DESC LIMIT 1').fetchone()[0], 'notification_deferred')


if __name__ == '__main__':
    unittest.main()
