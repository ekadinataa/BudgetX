"""Offline portability and safety contracts; all profiles/receipts are synthetic."""
import contextlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import category_worker as worker
import financial_review_admin as admin
import mesh
import ops
import reset_checkpoint as reset
from test_category_worker import stream
from test_mesh import FakeGmail, config


class PortabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def profile(self, name='devops-budgetx'):
        profile = self.root / 'portable-home' / 'profiles' / name
        profile.mkdir(parents=True, exist_ok=True)
        (profile / 'config.yaml').write_text('# synthetic configured profile\n')
        return profile

    def admin_request(self, profile, **changes):
        return dict(profile_home=str(profile), actor=dict(admin.ACTOR),
                    message_id='42', bot_username=None, text='/bxreview') | changes

    def private_config(self):
        path = self.root / 'config.json'
        path.write_text(json.dumps(config(self.root)))
        path.chmod(0o600)
        return path

    def test_fetch_uses_bundled_harvester_without_private_directory(self):
        real_spec = importlib.util.spec_from_file_location
        paths = []

        def record_spec(name, path):
            paths.append(Path(path))
            return real_spec(name, path)

        with mesh.Engine(config(self.root)) as engine, patch.object(
                importlib.util, 'spec_from_file_location', side_effect=record_spec):
            result = engine.fetch_row(FakeGmail(), 'new', 'label-trx')
        self.assertEqual(paths, [Path(mesh.__file__).resolve().with_name('harvest.py')])
        self.assertIsNotNone(result)
        self.assertEqual(result['body_normalized'], 'Synthetic')

    def test_explicit_harvest_directory_remains_supported(self):
        harvest_dir = self.root / 'custom-harvester'
        harvest_dir.mkdir()
        (harvest_dir / 'harvest.py').write_text(
            'def extract_bodies(payload, attachment):\n'
            "    return 'synthetic custom plain', '', 'synthetic custom body', []\n")
        c = config(self.root) | {'harvest_dir': str(harvest_dir)}
        with mesh.Engine(c) as engine:
            result = engine.fetch_row(FakeGmail(), 'new', 'label-trx')
        self.assertIsNotNone(result)
        self.assertEqual(result['body_normalized'], 'synthetic custom body')

    def test_missing_explicit_harvester_does_not_fall_back(self):
        c = config(self.root) | {'harvest_dir': str(self.root / 'missing-harvester')}
        with mesh.Engine(c) as engine, self.assertRaises(FileNotFoundError):
            engine.fetch_row(FakeGmail(), 'new', 'label-trx')

    def test_classifier_requires_discoverable_executable(self):
        with patch.dict(os.environ, {'HERMES_HOME': str(self.profile())}), patch.object(
                worker, 'HERMES', None), patch.object(worker.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'Hermes executable'):
                worker.classify_with_hermes('Synthetic shop')
        run.assert_not_called()

    def test_hermes_path_is_discovered_without_launching_on_import(self):
        spec = importlib.util.spec_from_file_location('synthetic_category_worker', worker.__file__)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        with patch('shutil.which', return_value='/synthetic/bin/hermes') as which, patch(
                'subprocess.run') as run:
            spec.loader.exec_module(module)
        which.assert_called_once_with('hermes')
        self.assertEqual(module.HERMES, '/synthetic/bin/hermes')
        run.assert_not_called()

    def test_classifier_uses_discovered_executable_not_destination_data(self):
        with patch.dict(os.environ, {'HERMES_HOME': str(self.profile())}), patch.object(
                worker, 'HERMES', '/synthetic/bin/hermes'), patch.object(worker.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = stream()
            worker.classify_with_hermes('/untrusted/bin/hermes Synthetic Shop')
        self.assertEqual(run.call_args.args[0][0], '/synthetic/bin/hermes')
        self.assertNotIn('/untrusted/bin/hermes', run.call_args.args[0])
        self.assertFalse(run.call_args.kwargs['shell'])

    def test_ops_alert_without_explicit_target_never_sends(self):
        with patch.object(ops.subprocess, 'run') as run:
            self.assertFalse(ops.send('Synthetic issue'))
        run.assert_not_called()

    def test_ops_alert_uses_explicit_target_profile_and_discovered_executable(self):
        profile = self.profile()
        with patch.dict(os.environ, {'HERMES_HOME': str(profile)}), patch.object(
                worker, 'HERMES', '/synthetic/bin/hermes'), patch.object(ops.subprocess, 'run') as run:
            run.return_value.returncode = 0
            self.assertTrue(ops.send('Synthetic issue', {'ops_alert_target': 'telegram:12345'}))
        self.assertEqual(run.call_args.args[0], ['/synthetic/bin/hermes', 'send', '--to',
                         'telegram:12345', '--quiet', '--file', '-'])
        self.assertEqual(run.call_args.kwargs['input'], 'Synthetic issue')
        self.assertEqual(run.call_args.kwargs['cwd'], str(profile))
        self.assertEqual(run.call_args.kwargs['env']['HERMES_HOME'], str(profile))
        self.assertFalse(run.call_args.kwargs['shell'])

    def test_ops_missing_profile_or_executable_never_sends(self):
        with patch.dict(os.environ), patch.object(ops.subprocess, 'run') as run:
            os.environ.pop('HERMES_HOME', None)
            self.assertFalse(ops.send('Synthetic issue', {'ops_alert_target': 'telegram:12345'}))
        run.assert_not_called()
        with patch.dict(os.environ, {'HERMES_HOME': str(self.profile())}), patch.object(
                worker, 'HERMES', None), patch.object(ops.subprocess, 'run') as run:
            self.assertFalse(ops.send('Synthetic issue', {'ops_alert_target': 'telegram:12345'}))
        run.assert_not_called()

    def test_admin_ingress_accepts_configured_runtime_devops_profile(self):
        profile = self.profile()
        with patch.dict(os.environ, {'HERMES_HOME': str(profile)}):
            admin._validate_request(self.admin_request(profile))

    def test_admin_ingress_resolves_profile_each_request_not_import(self):
        for parent in ('portable-a', 'portable-b'):
            profile = self.root / parent / 'profiles' / 'devops-budgetx'
            profile.mkdir(parents=True)
            (profile / 'config.yaml').write_text('# synthetic profile\n')
            with patch.dict(os.environ, {'HERMES_HOME': str(profile)}):
                admin._validate_request(self.admin_request(profile))

    def test_admin_ingress_requires_explicit_existing_configured_profile(self):
        profile = self.profile()
        no_config = self.root / 'unconfigured' / 'profiles' / 'devops-budgetx'
        no_config.mkdir(parents=True)
        for value in (None, '', 'relative/profiles/devops-budgetx', str(no_config),
                      str(self.root / 'missing' / 'profiles' / 'devops-budgetx'),
                      str(self.profile('default')), str(self.profile('dev-budgetx'))):
            with self.subTest(profile=value), patch.dict(os.environ):
                if value is None:
                    os.environ.pop('HERMES_HOME', None)
                else:
                    os.environ['HERMES_HOME'] = value
                with self.assertRaisesRegex(ValueError, 'trusted_profile_required'):
                    admin._validate_request(self.admin_request(profile))

    def test_admin_ingress_cannot_switch_profile_from_request_data(self):
        with patch.dict(os.environ, {'HERMES_HOME': str(self.profile())}), self.assertRaisesRegex(
                ValueError, 'trusted_profile_required'):
            admin._validate_request(self.admin_request(self.profile('other-role')))

    def test_admin_ingress_preserves_trusted_private_actor_gate(self):
        profile = self.profile()
        for actor in (dict(admin.ACTOR, user_id='12345'), dict(admin.ACTOR, chat_id='12345'),
                      dict(admin.ACTOR, is_bot=True), dict(admin.ACTOR, chat_type='group'),
                      dict(admin.ACTOR, platform='discord')):
            with self.subTest(actor=actor), patch.dict(os.environ, {'HERMES_HOME': str(profile)}):
                with self.assertRaisesRegex(ValueError, 'trusted_private_admin_required'):
                    admin._validate_request(self.admin_request(profile, actor=actor))

    def test_admin_ingress_rejects_symlink_to_another_profile_role(self):
        target = self.profile('other-role')
        alias = self.root / 'aliases' / 'profiles' / 'devops-budgetx'
        alias.parent.mkdir(parents=True)
        alias.symlink_to(target, target_is_directory=True)
        with patch.dict(os.environ, {'HERMES_HOME': str(alias)}), self.assertRaisesRegex(
                ValueError, 'trusted_profile_required'):
            admin._validate_request(self.admin_request(alias))

    def test_reset_preview_never_invokes_apply_or_cloud(self):
        output = io.StringIO()
        with patch.object(reset, 'apply') as apply, patch.object(
                reset, 'FirestorePublisher') as publisher, contextlib.redirect_stdout(output):
            self.assertEqual(reset.main(['--config', str(self.private_config())]), 0)
        self.assertFalse(json.loads(output.getvalue())['apply'])
        apply.assert_not_called()
        publisher.assert_not_called()
        self.assertFalse((self.root / 'state.sqlite3').exists())

    def test_reset_requires_explicit_absolute_config(self):
        for args in ([], ['--apply'], ['--config', 'relative-config.json']):
            with self.subTest(args=args), patch.object(reset, 'apply') as apply, contextlib.redirect_stderr(
                    io.StringIO()), self.assertRaises(SystemExit):
                reset.main(args)
            apply.assert_not_called()

    def test_reset_apply_is_only_called_with_explicit_apply_flag(self):
        path = self.private_config()
        with patch.object(reset, 'apply') as apply:
            self.assertEqual(reset.main(['--config', str(path), '--apply']), 0)
        apply.assert_called_once_with(path)

    def test_reset_cli_help_is_offline_and_no_argument_invocation_fails(self):
        result = subprocess.run([sys.executable, '-B', reset.__file__, '--help'],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('--apply', result.stdout)
        result = subprocess.run([sys.executable, '-B', reset.__file__],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 2)
        self.assertIn('--config', result.stderr)


if __name__ == '__main__':
    unittest.main()
