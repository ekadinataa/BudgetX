"""Offline OAuth guard regressions. Synthetic fixtures only; never authenticates."""
import contextlib
import importlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).parent / 'scripts' / 'gmail_auth.py'


class GuardTests(unittest.TestCase):
    def module(self):
        return importlib.import_module('scripts.gmail_auth')

    def test_help_needs_no_sdk_config_terminal_or_profile(self):
        result = subprocess.run([sys.executable, '-B', str(SCRIPT), '--help'],
                                capture_output=True, text=True, timeout=10,
                                env={k: v for k, v in os.environ.items() if k != 'HERMES_HOME'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('--config', result.stdout)
        self.assertIn('--authorize', result.stdout)

    def test_nonterminal_refuses_before_config_or_cloud_access(self):
        module = self.module()
        with patch.object(sys.stdin, 'isatty', return_value=False):
            with self.assertRaisesRegex(ValueError, 'terminal'):
                module.authorize('/nonexistent/synthetic.json')

    def test_cli_redacts_exception_details(self):
        module = self.module()
        output = io.StringIO()
        with patch.object(module, 'authorize', side_effect=ValueError('SECRET?code=private')):
            with contextlib.redirect_stderr(output):
                self.assertEqual(module.main(['--config', '/synthetic', '--authorize']), 1)
        self.assertIn('ValueError', output.getvalue())
        self.assertNotIn('SECRET', output.getvalue())

    def test_missing_authorization_refuses_before_loading_config(self):
        module = self.module()
        with patch.object(module, 'authorize') as authorize:
            with self.assertRaises(SystemExit) as error, contextlib.redirect_stderr(io.StringIO()):
                module.main(['--config', '/nonexistent/synthetic.json'])
            self.assertEqual(error.exception.code, 2)
            authorize.assert_not_called()


class AuthorizationTests(unittest.TestCase):
    def setUp(self):
        from types import SimpleNamespace
        import json
        import mesh
        self.module = importlib.import_module('scripts.gmail_auth')
        self.temp = tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR'))
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root.chmod(0o700)
        self.config = dict(project_id=mesh.PROJECT, uid=mesh.UID, email=mesh.EMAIL,
                           account_id='akun-1', mailbox_email='synthetic@example.invalid',
                           checkpoint_at='2026-10-07T00:00:00+00:00',
                           db_path=str(self.root / 'ledger.db'),
                           token_path=str(self.root / 'token.json'),
                           client_secret_path=str(self.root / 'client.json'),
                           firebase_admin_path=str(self.root / 'admin.json'),
                           sender_allowlist={'synthetic@example.invalid': 'ANY'},
                           registry={'wallets': {'bri': {'id': 'wb'}}, 'aliases': {}})
        self.config_path = self.root / 'config.json'
        self.config_path.write_text(json.dumps(self.config))
        self.config_path.chmod(0o600)
        for key in ('client_secret_path', 'firebase_admin_path'):
            path = Path(self.config[key])
            path.write_text('{}')
            path.chmod(0o600)
        self.calls = []
        scopes = ['https://www.googleapis.com/auth/gmail.readonly']
        fixture = self
        class Credentials:
            refresh_token = 'SYNTHETIC-REFRESH'
            granted_scopes = scopes
            def refresh(self, request):
                fixture.calls.append('refresh')
                self.refreshed = True
            def to_json(self):
                return json.dumps({'refresh_token': self.refresh_token,
                                   'scopes': self.granted_scopes, 'refreshed': self.refreshed})
        self.credentials = Credentials()
        def profile(creds):
            self.calls.append('profile')
            return {'emailAddress': self.config['mailbox_email']}
        def verify(config):
            self.calls.append('identity')
        def consent(config, *, port, timeout):
            self.calls.append('consent')
            return self.credentials
        self.addCleanup(patch.stopall)
        patch.object(sys.stdin, 'isatty', return_value=True).start()
        patch.object(sys.stdout, 'isatty', return_value=True).start()
        self.identity = patch.object(self.module, '_verify_target', side_effect=verify, create=True).start()
        self.consent = patch.object(self.module, '_consent', side_effect=consent, create=True).start()
        self.profile = patch.object(self.module, '_gmail_profile', side_effect=profile, create=True).start()
        patch.object(self.module, '_refresh', side_effect=lambda creds: creds.refresh(None), create=True).start()

    def run_auth(self):
        return self.module.authorize(str(self.config_path))

    def test_rejects_symlinks_permissions_and_path_aliases_before_cloud(self):
        import json
        for key in ('token_path', 'client_secret_path', 'firebase_admin_path'):
            path = Path(self.config[key])
            real = self.root / (key + '-target')
            real.write_text('{}')
            real.chmod(0o600)
            path.unlink(missing_ok=True)
            path.symlink_to(real)
            with self.subTest(symlink=key), self.assertRaises((ValueError, OSError)):
                self.run_auth()
            self.identity.assert_not_called()
            path.unlink()
            path.write_text('{}')
            path.chmod(0o644)
            with self.subTest(permissions=key), self.assertRaises(ValueError):
                self.run_auth()
            self.identity.assert_not_called()
            path.chmod(0o600)
        token = Path(self.config['token_path'])
        token.unlink()
        original = self.config['token_path']
        for alias in ('db_path', 'client_secret_path', 'firebase_admin_path'):
            self.config['token_path'] = self.config[alias]
            self.config_path.write_text(json.dumps(self.config))
            with self.subTest(alias=alias), self.assertRaises(ValueError):
                self.run_auth()
            self.identity.assert_not_called()
        self.config['token_path'] = original

    def test_symlinked_parent_and_public_directory_are_refused(self):
        import json
        alias = self.root / 'alias'
        real = self.root / 'real'
        real.mkdir(mode=0o700)
        alias.symlink_to(real, target_is_directory=True)
        self.config['token_path'] = str(alias / 'token.json')
        self.config_path.write_text(json.dumps(self.config))
        with self.assertRaises(ValueError):
            self.run_auth()
        self.identity.assert_not_called()
        self.config['token_path'] = str(real / 'token.json')
        self.config_path.write_text(json.dumps(self.config))
        real.chmod(0o755)
        with self.assertRaises(ValueError):
            self.run_auth()
        self.identity.assert_not_called()

    def test_parallel_authorization_is_locked_before_identity_or_consent(self):
        import fcntl
        token = Path(self.config['token_path'])
        lock = token.with_name(token.name + '.auth.lock')
        fd = os.open(lock, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.run_auth()
            self.identity.assert_not_called()
        finally:
            os.close(fd)

    def test_lock_path_cannot_collide_with_ledger_or_credentials(self):
        import json
        self.config['db_path'] = self.config['token_path'] + '.auth.lock'
        self.config_path.write_text(json.dumps(self.config))
        with self.assertRaises(ValueError):
            self.run_auth()
        self.identity.assert_not_called()
        self.assertFalse(Path(self.config['db_path']).exists())

    def test_atomic_replace_failure_preserves_token_and_cleans_temporary_file(self):
        token = Path(self.config['token_path'])
        token.write_text('synthetic-original')
        token.chmod(0o600)
        with patch.object(self.module.os, 'replace', side_effect=OSError('synthetic failure')):
            with self.assertRaises(OSError):
                self.run_auth()
        self.assertEqual(token.read_text(), 'synthetic-original')
        self.assertEqual(list(self.root.glob('.gmail-auth-*')), [])
        backup = list(self.root.glob('gmail-auth-backup-*'))[0] / token.name
        self.assertEqual(backup.read_text(), 'synthetic-original')

    def test_invalid_boundaries_refuse_before_cloud(self):
        for kwargs in (dict(port=0), dict(port=65536), dict(port=True),
                       dict(timeout=0), dict(timeout=1201), dict(timeout=True)):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.module.authorize(str(self.config_path), **kwargs)
            self.identity.assert_not_called()

    def test_existing_token_has_private_exact_backup_before_replacement(self):
        token = Path(self.config['token_path'])
        original = b'{"synthetic_old_token":true}'
        token.write_bytes(original)
        token.chmod(0o600)
        self.run_auth()
        backups = list(self.root.glob('gmail-auth-backup-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].stat().st_mode & 0o777, 0o700)
        backup = backups[0] / token.name
        self.assertEqual(backup.read_bytes(), original)
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        self.assertNotEqual(token.read_bytes(), original)

    def test_concurrent_token_change_or_creation_refuses_replacement(self):
        token = Path(self.config['token_path'])
        for existing in (True, False):
            token.unlink(missing_ok=True)
            if existing:
                token.write_text('old')
                token.chmod(0o600)
            def consent(*args, **kwargs):
                token.write_text('concurrent')
                token.chmod(0o600)
                return self.credentials
            self.consent.side_effect = consent
            with self.subTest(existing=existing), self.assertRaises(ValueError):
                self.run_auth()
            self.assertEqual(token.read_text(), 'concurrent')

    def test_missing_refresh_token_and_extra_scopes_never_install(self):
        cases = [('refresh_token', None), ('granted_scopes', self.module.SCOPES + ['openid'])]
        for attribute, invalid in cases:
            original = getattr(self.credentials, attribute)
            with self.subTest(attribute=attribute):
                setattr(self.credentials, attribute, invalid)
                with self.assertRaises(ValueError):
                    self.run_auth()
                self.assertFalse(Path(self.config['token_path']).exists())
            setattr(self.credentials, attribute, original)

    def test_mailbox_mismatch_before_or_after_refresh_never_installs(self):
        for responses in ([{'emailAddress': 'other@example.invalid'}],
                          [{'emailAddress': self.config['mailbox_email']},
                           {'emailAddress': 'other@example.invalid'}]):
            with self.subTest(responses=responses):
                self.profile.side_effect = responses
                with self.assertRaises(ValueError):
                    self.run_auth()
                self.assertFalse(Path(self.config['token_path']).exists())

    def test_identity_failure_does_not_start_consent(self):
        self.identity.side_effect = ValueError('synthetic identity mismatch')
        with self.assertRaises(ValueError):
            self.run_auth()
        self.consent.assert_not_called()

    def test_refresh_failure_preserves_existing_token_and_restores_log_policy(self):
        import logging
        token = Path(self.config['token_path'])
        token.write_text('synthetic-original')
        token.chmod(0o600)
        previous = logging.root.manager.disable
        def refresh(credentials):
            self.assertEqual(logging.root.manager.disable, logging.CRITICAL)
            raise ValueError('PRIVATE refresh payload')
        with patch.object(self.module, '_refresh', side_effect=refresh), self.assertRaises(ValueError):
            self.run_auth()
        self.assertEqual(token.read_text(), 'synthetic-original')
        self.assertEqual(list(self.root.glob('gmail-auth-backup-*')), [])
        self.assertEqual(logging.root.manager.disable, previous)

    def test_invalid_target_config_is_rejected_before_identity(self):
        import json
        self.config['uid'] = 'foreign'
        self.config_path.write_text(json.dumps(self.config))
        with self.assertRaises(ValueError):
            self.run_auth()
        self.identity.assert_not_called()
        self.consent.assert_not_called()

    def test_new_token_installed_only_after_target_mailbox_and_refresh_verified(self):
        import json
        self.run_auth()
        self.assertEqual(self.calls, ['identity', 'consent', 'profile', 'refresh', 'profile'])
        token = Path(self.config['token_path'])
        self.assertEqual(json.loads(token.read_text())['refreshed'], True)
        self.assertEqual(token.stat().st_mode & 0o777, 0o600)
        self.assertEqual(token.parent.stat().st_mode & 0o777, 0o700)
        self.assertFalse(Path(self.config['db_path']).exists())
        self.assertEqual(self.config_path.read_text(), __import__('json').dumps(self.config))


class SDKHelperTests(unittest.TestCase):
    def setUp(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        self.NS = SimpleNamespace
        self.Mock = Mock
        self.module = importlib.import_module('scripts.gmail_auth')

    def test_admin_project_uid_email_and_disabled_checked_then_app_closed(self):
        from unittest.mock import Mock
        config = dict(project_id='budgetku-app-v1', uid='synthetic-uid', email='demo@budgetx.id',
                      firebase_admin_path='/synthetic/admin.json')
        certificate = Mock(project_id=config['project_id'])
        app = object()
        user = self.NS(uid=config['uid'], email=config['email'], disabled=False)
        sdk = self.NS(credentials=self.NS(Certificate=Mock(return_value=certificate)),
                      auth=self.NS(get_user=Mock(return_value=user)),
                      initialize_app=Mock(return_value=app), delete_app=Mock())
        with patch.dict(sys.modules, {'firebase_admin': sdk}):
            self.module._verify_target(config)
            sdk.auth.get_user.assert_called_with(config['uid'], app=app)
            self.assertEqual(sdk.initialize_app.call_args.args[1]['projectId'], config['project_id'])
            self.assertEqual(sdk.initialize_app.call_args.args[1]['httpTimeout'], 20)
            sdk.delete_app.assert_called_with(app)
            for field, invalid in [('uid', 'foreign'), ('email', 'foreign@example.invalid'), ('disabled', True)]:
                setattr(user, field, invalid)
                with self.subTest(field=field), self.assertRaises(ValueError):
                    self.module._verify_target(config)
                setattr(user, field, config.get(field, False))
            sdk.initialize_app.reset_mock()
            certificate.project_id = 'foreign'
            with self.assertRaises(ValueError):
                self.module._verify_target(config)
            sdk.initialize_app.assert_not_called()

    def test_consent_uses_library_pkce_state_loopback_and_terminal_only_url(self):
        from unittest.mock import Mock
        import logging
        flow = self.NS(authorization_url=Mock(return_value=('https://synthetic.invalid/auth?state=private', 'state')),
                       fetch_token=Mock(return_value={}))
        def run_local_server(**kwargs):
            self.assertEqual(logging.root.manager.disable, logging.CRITICAL)
            url, state = flow.authorization_url(prompt=kwargs['prompt'])
            flow.fetch_token(authorization_response='https://127.0.0.1/?code=synthetic&state=state')
            return 'synthetic-credentials'
        flow.run_local_server = Mock(side_effect=run_local_server)
        factory = self.Mock(return_value=flow)
        sdk = self.NS(InstalledAppFlow=self.NS(from_client_secrets_file=factory))
        output = io.StringIO()
        with patch.dict(sys.modules, {'google_auth_oauthlib.flow': sdk}), contextlib.redirect_stdout(output):
            result = self.module._consent({'client_secret_path': '/synthetic/client.json',
                                           'mailbox_email': 'synthetic@example.invalid'}, port=8767, timeout=120)
        self.assertEqual(result, 'synthetic-credentials')
        factory.assert_called_with('/synthetic/client.json', self.module.SCOPES, autogenerate_code_verifier=True)
        kwargs = flow.run_local_server.call_args.kwargs
        self.assertEqual(kwargs['host'], '127.0.0.1')
        self.assertEqual(kwargs['bind_addr'], '127.0.0.1')
        self.assertEqual(kwargs['port'], 8767)
        self.assertEqual(kwargs['timeout_seconds'], 120)
        self.assertIs(kwargs['open_browser'], False)
        self.assertIsNone(kwargs['authorization_prompt_message'])
        self.assertEqual(kwargs['access_type'], 'offline')
        self.assertEqual(kwargs['prompt'], 'consent')
        self.assertEqual(kwargs['include_granted_scopes'], 'false')
        self.assertEqual(flow.fetch_token.call_args.kwargs['timeout'], 20)
        self.assertIn('https://synthetic.invalid/auth?state=private', output.getvalue())
        self.assertNotIn('code=synthetic', output.getvalue())

    def test_library_state_validation_and_s256_pkce_are_not_bypassed(self):
        # Real library, synthetic installed-client document, no socket/network.
        from google_auth_oauthlib.flow import InstalledAppFlow
        from oauthlib.oauth2 import MismatchingStateError
        from urllib.parse import parse_qs, urlsplit
        flow = InstalledAppFlow.from_client_config({'installed': {
            'client_id': 'synthetic.apps.googleusercontent.com', 'client_secret': 'synthetic',
            'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
            'token_uri': 'https://oauth2.googleapis.com/token',
            'redirect_uris': ['http://127.0.0.1']}}, self.module.SCOPES,
            autogenerate_code_verifier=True)
        flow.redirect_uri = 'http://127.0.0.1:8767/'
        url, state = flow.authorization_url()
        parameters = parse_qs(urlsplit(url).query)
        self.assertEqual(parameters['scope'], self.module.SCOPES)
        self.assertEqual(parameters['code_challenge_method'], ['S256'])
        self.assertTrue(flow.code_verifier)
        self.assertTrue(state)
        with patch.object(flow.oauth2session, 'request') as request:
            with self.assertRaises(MismatchingStateError):
                flow.fetch_token(authorization_response='https://127.0.0.1:8767/?state=foreign&code=synthetic')
            request.assert_not_called()

    def test_refresh_request_is_bounded(self):
        transport = self.Mock(return_value=object())
        credentials = self.Mock()
        with patch.dict(sys.modules, {'google.auth.transport.requests': self.NS(Request=lambda: transport)}):
            self.module._refresh(credentials)
        request = credentials.refresh.call_args.args[0]
        request(url='https://synthetic.invalid', timeout=999)
        self.assertEqual(transport.call_args.kwargs['timeout'], 20)

    def test_profile_is_readonly_bounded_and_no_retry(self):
        build = self.Mock()
        http = self.Mock(return_value=object())
        authorized = self.Mock(return_value=object())
        with patch.dict(sys.modules, {
                'googleapiclient.discovery': self.NS(build=build),
                'google_auth_httplib2': self.NS(AuthorizedHttp=authorized),
                'httplib2': self.NS(Http=http)}):
            credentials = object()
            self.module._gmail_profile(credentials)
        http.assert_called_with(timeout=20)
        authorized.assert_called_with(credentials, http=http.return_value)
        build.assert_called_with('gmail', 'v1', http=authorized.return_value, cache_discovery=False)
        build.return_value.users.return_value.getProfile.assert_called_with(userId='me')
        build.return_value.users.return_value.getProfile.return_value.execute.assert_called_with(num_retries=0)


if __name__ == '__main__':
    unittest.main()
