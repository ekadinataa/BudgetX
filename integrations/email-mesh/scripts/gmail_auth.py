#!/usr/bin/env python3
"""Explicit Gmail read-only authorization from a trusted local terminal.

No collector, importer, worker, checkpoint or registry changes are performed.
Token replacement can allow an already enabled scheduler to resume; this command
never starts that scheduler. Use a local browser or an operator-managed SSH tunnel;
never paste authorization URLs, callback codes or credentials into chat/logs.
"""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import os
from pathlib import Path
import stat
import sys
import tempfile

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']


def authorize(config_path, *, port=8767, timeout=300):
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise ValueError('trusted_local_terminal_required')
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError('invalid_loopback_port')
    if type(timeout) is not int or not 30 <= timeout <= 1200:
        raise ValueError('invalid_consent_timeout')
    _private_file(Path(config_path))
    # Direct execution from scripts/ must still use this checkout's canonical mesh.
    source = str(Path(__file__).resolve().parents[1])
    if source not in sys.path:
        sys.path.insert(0, source)
    from mesh import load_config, validate_config
    config = load_config(config_path)
    validate_config(config)
    token = Path(config['token_path'])
    _no_symlinks(token)
    parent = token.parent.stat()
    if (not stat.S_ISDIR(parent.st_mode) or stat.S_IMODE(parent.st_mode) != 0o700 or
            parent.st_uid != os.getuid()):
        raise ValueError('token_directory_must_be_owned_0700')
    for key in ('client_secret_path', 'firebase_admin_path'):
        _private_file(Path(config[key]))
    protected = [Path(config_path)] + [Path(value) for key, value in config.items()
                  if (key.endswith('_path') or key.endswith('_dir')) and key != 'token_path'
                  and isinstance(value, str)]
    lock = token.with_name(token.name + '.auth.lock')
    _no_symlinks(lock)
    for owned in (token, lock):
        for path in protected:
            if (owned.resolve() == path.resolve() or
                    (owned.exists() and path.exists() and os.path.samefile(owned, path))):
                raise ValueError('token_and_lock_must_be_separate_from_other_state')
    with _token_lock(token), _quiet_sdk_logs():
        original = _token_bytes(token)
        _verify_target(config)
        credentials = _consent(config, port=port, timeout=timeout)
        _validate_credentials(credentials)
        if _gmail_profile(credentials).get('emailAddress') != config['mailbox_email']:
            raise ValueError('unexpected_gmail_account')
        _refresh(credentials)
        _validate_credentials(credentials)
        if _gmail_profile(credentials).get('emailAddress') != config['mailbox_email']:
            raise ValueError('unexpected_refreshed_gmail_account')
        _install(token, credentials.to_json(), original)


def _no_symlinks(path):
    if not path.is_absolute() or '..' in path.parts:
        raise ValueError('absolute_canonical_path_required')
    for part in (path, *path.parents):
        if part.is_symlink():
            raise ValueError('symlink_path_refused')


def _private_file(path):
    _no_symlinks(path)
    info = path.stat()
    if (not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or
            info.st_nlink != 1 or info.st_uid != os.getuid()):
        raise ValueError('private_owned_regular_file_required')


def _token_bytes(token):
    _no_symlinks(token)
    try:
        fd = os.open(token, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return None
    with os.fdopen(fd, 'rb') as source:
        info = os.fstat(source.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or
                info.st_nlink != 1 or info.st_uid != os.getuid()):
            raise ValueError('private_regular_token_required')
        return source.read()


@contextmanager
def _token_lock(token):
    lock = token.with_name(token.name + '.auth.lock')
    fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or
                info.st_nlink != 1 or info.st_uid != os.getuid()):
            raise ValueError('private_regular_lock_required')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        # Keep the lock inode: unlinking it allows a second independent lock.
        os.close(fd)


def _same_token(token, original):
    current = _token_bytes(token)
    if ((original is None) != (current is None) or
            (original is not None and hashlib.sha256(current).digest() != hashlib.sha256(original).digest())):
        raise ValueError('token_changed_concurrently')


def _fsync_directory(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _install(token, serialized, original):
    _same_token(token, original)
    if original is not None:
        directory = Path(tempfile.mkdtemp(prefix='gmail-auth-backup-', dir=token.parent))
        directory.chmod(0o700)
        fd = os.open(directory / token.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as backup:
            backup.write(original)
            backup.flush()
            os.fsync(backup.fileno())
        _fsync_directory(directory)
        _fsync_directory(token.parent)
    fd, temporary = tempfile.mkstemp(prefix='.gmail-auth-', dir=token.parent)
    try:
        with os.fdopen(fd, 'w') as output:
            output.write(serialized)
            output.flush()
            os.fsync(output.fileno())
        _same_token(token, original)
        os.replace(temporary, token)
        _fsync_directory(token.parent)
    finally:
        Path(temporary).unlink(missing_ok=True)


def _verify_target(config):
    # Identity read only: never construct FirestorePublisher or a collector.
    from firebase_admin import auth, credentials, delete_app, initialize_app
    import uuid
    certificate = credentials.Certificate(config['firebase_admin_path'])
    if certificate.project_id != config['project_id']:
        raise ValueError('unexpected_admin_project')
    app = initialize_app(certificate, {'projectId': config['project_id'], 'httpTimeout': 20},
                         name='gmail-auth-' + uuid.uuid4().hex)
    try:
        user = auth.get_user(config['uid'], app=app)
        if user.uid != config['uid'] or user.email != config['email'] or user.disabled is not False:
            raise ValueError('unexpected_enabled_target_identity')
    finally:
        delete_app(app)


def _consent(config, *, port, timeout):
    # The supported library validates OAuth state and performs S256 PKCE. Its
    # default URL prompt and callback handler log sensitive URLs at INFO, so
    # suppress SDK logging and print the authorization URL only to this terminal.
    from google_auth_oauthlib.flow import InstalledAppFlow
    with _quiet_sdk_logs():
        flow = InstalledAppFlow.from_client_secrets_file(
            config['client_secret_path'], SCOPES, autogenerate_code_verifier=True)
        original_url = flow.authorization_url
        original_fetch = flow.fetch_token
        def terminal_url(**kwargs):
            url, state = original_url(**kwargs)
            print('Open this URL only in your trusted local browser (or tunneled browser). '
                  'Do not share it in chat or logs:\n' + url, flush=True)
            return url, state
        def bounded_fetch(**kwargs):
            kwargs['timeout'] = 20
            return original_fetch(**kwargs)
        flow.authorization_url = terminal_url
        flow.fetch_token = bounded_fetch
        try:
            return flow.run_local_server(
                host='127.0.0.1', bind_addr='127.0.0.1', port=port,
                open_browser=False, timeout_seconds=timeout,
                authorization_prompt_message=None,
                success_message='Consent received. You may close this tab. Verification is still in progress.',
                prompt='consent', login_hint=config['mailbox_email'], access_type='offline',
                include_granted_scopes='false')
        finally:
            flow.authorization_url = original_url
            flow.fetch_token = original_fetch


@contextmanager
def _quiet_sdk_logs():
    import logging
    previous = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    try:
        yield
    finally:
        logging.disable(previous)


def _refresh(credentials):
    from google.auth.transport.requests import Request
    request = Request()
    def bounded(*args, **kwargs):
        kwargs['timeout'] = 20
        return request(*args, **kwargs)
    credentials.refresh(bounded)


def _gmail_profile(credentials):
    import httplib2
    from google_auth_httplib2 import AuthorizedHttp
    from googleapiclient.discovery import build
    http = AuthorizedHttp(credentials, http=httplib2.Http(timeout=20))
    service = build('gmail', 'v1', http=http, cache_discovery=False)
    return service.users().getProfile(userId='me').execute(num_retries=0)


def _validate_credentials(credentials):
    if not credentials.refresh_token:
        raise ValueError('missing_refresh_token')
    scopes = credentials.granted_scopes
    if scopes is None:
        scopes = credentials.scopes
    if set(scopes or ()) != set(SCOPES):
        raise ValueError('unexpected_scope')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, help='Absolute private mesh JSON config')
    parser.add_argument('--authorize', required=True, action='store_true',
                        help='Explicitly allow identity checks, OAuth consent and token installation')
    parser.add_argument('--port', type=int, default=8767, help='Loopback callback port (default: 8767)')
    parser.add_argument('--timeout', type=int, default=300, help='Bounded consent wait, 30–1200 seconds')
    args = parser.parse_args(argv)
    try:
        authorize(args.config, port=args.port, timeout=args.timeout)
    except Exception as error:
        # OAuth exceptions can contain codes, URLs and credentials. Never echo them.
        print('GMAIL_AUTH_FAILED exception_class=' + type(error).__name__, file=sys.stderr)
        return 1
    print('GMAIL_AUTH_OK mailbox_verified=true refresh_verified=true no_worker_executed=true')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
