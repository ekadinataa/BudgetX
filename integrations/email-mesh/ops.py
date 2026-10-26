"""Private stdlib operations wrapper. Never resets cursor or applies balances."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import time
from datetime import datetime
from contextlib import contextmanager, closing
from mesh import load_config

HERE = Path(__file__).resolve().parent


def atomic(path, data):
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_suffix('.new')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(data, f, sort_keys=True)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temporary, path)


def read_json(path):
    return json.loads(Path(path).read_text()) if Path(path).exists() else {}


@contextmanager
def connect(path):
    with closing(sqlite3.connect(Path(path).as_uri() + '?mode=ro', uri=True, timeout=10)) as db:
        yield db


def snapshot(c):
    # Include idempotency tables and cursor, not just row counts.
    result = {}
    with connect(c['db_path']) as db:
        db.execute('BEGIN')
        tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        for table in tables:
            rows = sorted(json.dumps(r, ensure_ascii=True) for r in db.execute('SELECT * FROM "' + table.replace('"', '""') + '"'))
            result[table] = {'rows': len(rows), 'sha256': hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
    return result


def backup(config_path, root, now=None, keep=7):
    c = load_config(str(config_path))
    now = time.time() if now is None else now
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    name = 'backup-' + str(int(now * 1000000))
    staging = root / ('.' + name)
    final = root / name
    staging.mkdir(mode=0o700)
    try:
        dest = staging / 'state.sqlite3'
        with connect(c['db_path']) as source, closing(sqlite3.connect(dest)) as target:
            source.backup(target)
            if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('state backup integrity failure')
        os.chmod(dest, 0o600)
        whitelist = c.get('destination_whitelist_path')
        if whitelist:
            with connect(whitelist) as source, closing(sqlite3.connect(staging / 'whitelist.sqlite3')) as target:
                source.backup(target)
                if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('whitelist backup integrity failure')
            os.chmod(staging / 'whitelist.sqlite3', 0o600)
            worker_path = Path(c.get('category_worker_state_path') or str(whitelist) + '.category-worker.sqlite3')
            if worker_path.exists():
                with connect(worker_path) as source, closing(sqlite3.connect(staging / 'category-worker.sqlite3')) as target:
                    source.backup(target)
                    if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                        raise ValueError('category-worker backup integrity failure')
                os.chmod(staging / 'category-worker.sqlite3', 0o600)
        review_path = c.get('financial_review_state_path')
        if review_path and Path(review_path).exists():
            with connect(review_path) as source, closing(sqlite3.connect(staging / 'financial-review.sqlite3')) as target:
                source.backup(target)
                if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('financial review backup integrity failure')
            os.chmod(staging / 'financial-review.sqlite3', 0o600)
        for optional in ('category-worker-state.json', 'category-corrections.json'):
            path = Path(c['db_path']).parent / optional
            if path.exists():
                shutil.copyfile(path, staging / optional)
                os.chmod(staging / optional, 0o600)
        shutil.copyfile(config_path, staging / 'config.json')
        for path in [staging / 'config.json']:
            os.chmod(path, 0o600)
        for name in ('mesh.py', 'mesh_parser.py', 'category_rules.py', 'reconciliation.py', 'ops.py', 'README.md',
                     'destination_whitelist.py', 'category_worker.py', 'category_hook.py', 'apply_destination_demo.py',
                     'financial_review.py', 'financial_review_apply.py', 'financial_review_hook.py', 'financial_review_admin.py',
                     'financial_review_web.py', 'harvest.py', 'requirements.txt', 'requirements.lock'):
            if not (HERE / name).exists():
                continue
            shutil.copyfile(HERE / name, staging / name)
            os.chmod(staging / name, 0o600)
        copy_config = dict(c, db_path=str(dest))
        manifest = {'created': now, 'scope': c['project_id'] + ':' + c['uid'],
                    'snapshot': snapshot(copy_config),
                    'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in staging.iterdir()}}
        atomic(staging / 'manifest.json', manifest)
        verify_backup(staging)
        for p in staging.iterdir():
            with p.open('rb') as f:
                os.fsync(f.fileno())
        os.replace(staging, final)
        # Retain seven daily snapshots; no credentials copied.
        for old in sorted((p for p in root.glob('backup-*') if p.name[7:].isdigit()), key=lambda p: int(p.name[7:]))[:-keep]:
            if old.is_dir() and not old.is_symlink():
                shutil.rmtree(old)
        return final
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def verify_backup(bundle):
    bundle = Path(bundle)
    m = read_json(bundle / 'manifest.json')
    if not m.get('files'):
        raise ValueError('backup manifest missing')
    for name, expected in m['files'].items():
        if Path(name).name != name or hashlib.sha256((bundle / name).read_bytes()).hexdigest() != expected:
            raise ValueError('backup checksum mismatch')
    c = read_json(bundle / 'config.json')
    c['db_path'] = str(bundle / 'state.sqlite3')
    with connect(c['db_path']) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('backup integrity failure')
    if (bundle / 'whitelist.sqlite3').exists():
        with connect(bundle / 'whitelist.sqlite3') as db:
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('whitelist backup integrity failure')
    for optional_db in ('financial-review.sqlite3', 'category-worker.sqlite3'):
        if (bundle / optional_db).exists():
            with connect(bundle / optional_db) as db:
                if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('review worker backup integrity failure')
    actual = snapshot(c)
    if actual != m['snapshot']:
        raise ValueError('backup state mismatch')
    return actual


def assess(c, run_state, now):
    issues = []
    if c.get('publish_enabled') is not True:
        issues.append('Publikasi dinonaktifkan; delta tidak dikirim ke BudgetX')
    if now - run_state.get('finished', 0) > 900:
        issues.append('Tidak ada run selesai >15 menit')
    if run_state.get('failures', 0) >= 3:
        issues.append('Pipeline gagal 3 kali berurutan')
    if run_state.get('financial_review_error'):
        issues.append('Review transaksi tertahan (' + run_state['financial_review_error'] + '); periksa antrean approval')
    if run_state.get('category_error'):
        issues.append('Klasifikasi destination tertahan (' + run_state['category_error'] + '); antrean tersimpan, saldo tidak diubah')
    if run_state.get('error') == 'RefreshError':
        issues.append('OAuth gagal refresh; periksa otorisasi Gmail. Jangan reset cursor.')
    scope = c['project_id'] + ':' + c['uid']
    with connect(c['db_path']) as db:
        mailbox = db.execute('SELECT last_success FROM mailbox WHERE account=?', (c['account_id'],)).fetchone()
        if not mailbox or now - datetime.fromisoformat(mailbox[0]).timestamp() > 900:
            issues.append('Pengambilan delta Gmail tertinggal >15 menit')
        failed = db.execute("SELECT count(*) FROM outbox WHERE scope=? AND state!='sent' AND attempts>=3", (scope,)).fetchone()[0]
        if failed:
            issues.append(f'Outbox gagal terkirim: {failed} event')
        old = db.execute("SELECT count(*) FROM outbox o JOIN events e ON e.scope=o.scope AND e.id=o.event_id WHERE o.scope=? AND o.state!='sent' AND e.at<?", (scope, now - 900)).fetchone()[0]
        if old:
            issues.append(f'Outbox tertahan >15 menit: {old} event')
        quarantined = db.execute("SELECT count(*) FROM candidates WHERE scope=? AND reason NOT IN ('ready','archive','pre_checkpoint','not_transaction')", (scope,)).fetchone()[0]
        if quarantined:
            issues.append(f'Transaksi tertahan untuk review: {quarantined} receipt')
    return issues


def notify(issues, path, send, now):
    previous = read_json(path)
    if issues == previous.get('issues', []) and (not issues or now - previous.get('sent', 0) < 21600):
        return False
    text = 'BudgetX ops: ' + ('\n'.join(issues) if issues else 'pulih; masalah sebelumnya selesai.')
    if not send(text):
        return False  # Retry next watchdog tick, not a false delivered marker.
    atomic(path, {'issues': issues, 'sent': now})
    return True


def execute_mesh(config_path):
    try:
        r = subprocess.run([sys.executable, str(HERE / 'mesh.py'), '--config', str(config_path), 'run'],
                           cwd=HERE, capture_output=True, text=True, timeout=110)
        try:
            result = json.loads(r.stdout.strip().splitlines()[-1])
        except (ValueError, IndexError):
            result = {'error': 'InvalidRunOutput'}
        return r.returncode, result
    except subprocess.TimeoutExpired:
        return 1, {'error': 'RunTimeout'}


def execute_category_hook(config_path):
    try:
        r = subprocess.run([sys.executable, str(HERE / 'category_hook.py'), '--config', str(config_path)],
                           cwd=HERE, capture_output=True, text=True, timeout=100)
        try:
            result = json.loads(r.stdout.strip().splitlines()[-1])
        except (ValueError, IndexError):
            result = {'error': 'InvalidCategoryOutput'}
        return r.returncode, result
    except subprocess.TimeoutExpired:
        return 1, {'error': 'CategoryTimeout'}


def execute_financial_review_hook(config_path, allow_publication=True):
    command = [sys.executable, str(HERE / 'financial_review_hook.py'), '--config', str(config_path)]
    if not allow_publication:
        command.append('--notify-only')
    try:
        result = subprocess.run(command, cwd=HERE, capture_output=True, text=True, timeout=110)
        try:
            payload = json.loads(result.stdout.strip().splitlines()[-1])
            if not isinstance(payload, dict):
                raise ValueError('invalid hook result')
        except (ValueError, IndexError):
            payload = {'error': 'InvalidFinancialReviewOutput'}
        return result.returncode, payload
    except subprocess.TimeoutExpired:
        return 1, {'error': 'FinancialReviewTimeout'}


def run(config_path, execute=execute_mesh, now=None, category_execute=None, financial_execute=None):
    c = load_config(str(config_path))
    path = Path(c['db_path']).parent / 'ops-run.json'
    previous = read_json(path)
    code, result = execute(config_path)
    now = time.time() if now is None else now
    state = {'finished': now, 'code': code, 'failures': previous.get('failures', 0) + 1 if code else 0,
             'error': str(result.get('error') or result.get('publication_error') or '')[:64],
             'outbox_pending': result.get('outbox_pending')}
    if code == 0 and c.get('destination_classification_enabled') is True:
        category_code, categories = (category_execute or execute_category_hook)(config_path)
        state['category_error'] = str(categories.get('error') or ('CategoryFailure' if category_code else ''))[:64]
        state['category_corrections_pending'] = categories.get('corrections_pending')
        state['category_transaction_updates'] = categories.get('transaction_updates', 0)
    if c.get('financial_review_enabled') is True:
        review_code, review = (financial_execute or execute_financial_review_hook)(config_path, allow_publication=code == 0)
        state['financial_review_error'] = str(review.get('error') or review.get('publication_error') or review.get('notification_error') or review.get('web_error') or ('FinancialReviewFailure' if review_code else ''))[:64]
        state['financial_review_pending'] = review.get('pending')
        state['financial_review_approved'] = review.get('approved')
        state['financial_review_posted'] = review.get('posted', 0)
    atomic(path, state)
    return state


def send(text, config=None):
    """Send only to an explicitly configured target; no implicit private recipient."""
    config = config or {}
    target = config.get('ops_alert_target')
    if not isinstance(target, str) or not target or target != target.strip() or any(ord(c) < 32 for c in target):
        return False
    try:
        from category_worker import HERMES, _hermes_env
        env = _hermes_env()
        return subprocess.run([HERMES, 'send', '--to', target, '--quiet', '--file', '-'],
                              input=text, text=True, shell=False, env=env, cwd=env['HERMES_HOME'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=45).returncode == 0
    except (ValueError, subprocess.TimeoutExpired, OSError):
        return False


def watch(config_path, force_backup=False):
    c = load_config(str(config_path))
    root = Path(c['db_path']).parent
    now = time.time()
    issues = assess(c, read_json(root / 'ops-run.json'), now)
    gateway = subprocess.run(['systemctl', '--user', 'is-active', '--quiet', 'hermes-gateway.service'], timeout=10).returncode
    if gateway:
        issues.append('Gateway tidak aktif; jadwal delta terhenti')
    if shutil.disk_usage(root).free < 1024 ** 3:
        issues.append('Ruang disk tersisa <1 GiB')
    backup_root = root / 'backups'
    bundles = sorted(backup_root.glob('backup-*'), key=lambda p: int(p.name[7:]))
    latest = read_json(bundles[-1] / 'manifest.json').get('created', 0) if bundles else 0
    if force_backup or now - latest >= 86400:
        try:
            bundle = backup(config_path, backup_root, now)
            latest = now
            print(json.dumps({'backup': str(bundle), 'verified': True}))
        except Exception:
            issues.append('Backup lokal gagal; periksa log privat')
    if now - latest > 90000:
        issues.append('Backup terverifikasi tertinggal >25 jam')
    delivered = notify(issues, root / 'ops-alerts.json', lambda text: send(text, c), now)
    print(json.dumps({'issues': issues, 'alert_delivered': delivered, 'backup_age_seconds': int(now - latest)}))


def main():
    os.umask(0o077)
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config', required=True)
    ap.add_argument('command', choices=('run', 'watch', 'backup'))
    args = ap.parse_args()
    c = load_config(args.config)
    lock = Path(c['db_path']).parent / ('ops-' + args.command + '.lock')
    with lock.open('a') as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        if args.command == 'run':
            state = run(args.config)
            print(json.dumps(state))
            return state['code']
        try:
            watch(args.config, force_backup=args.command == 'backup')
        except Exception as exc:
            issue = 'Watchdog gagal (' + type(exc).__name__ + '); periksa state privat.'
            notify([issue], Path(c['db_path']).parent / 'ops-alerts.json', lambda text: send(text, c), time.time())
            print(json.dumps({'error': type(exc).__name__}))
            return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
