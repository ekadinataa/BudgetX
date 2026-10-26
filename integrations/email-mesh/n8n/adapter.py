"""Allowlisted n8n orchestration of the existing canonical email-mesh engine."""
import argparse
import json
import os
import sqlite3
import subprocess
import sys
from contextlib import closing
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
SCOPE = 'budgetku-app-v1:VCqdnx9zvJVrZQSNp6gyGm6Zzhr2'


def runtime_paths(*, require_profile=False):
    """Resolve only trusted service environment, never workflow/chat-selected paths."""
    root = Path(os.environ.get('BUDGETX_MESH_ROOT', str(PROJECT)))
    config_home = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config')))
    config = Path(os.environ.get('BUDGETX_MESH_CONFIG', str(config_home / 'budgetx-email-mesh/config.json')))
    if not root.is_absolute() or not root.is_dir() or not config.is_absolute():
        raise ValueError('invalid_mesh_paths')
    profile = None
    if require_profile:
        selected = os.environ.get('HERMES_HOME', '')
        profile = Path(selected)
        if not selected or not profile.is_absolute() or not profile.is_dir() or not (profile / 'config.yaml').is_file():
            raise ValueError('explicit_existing_hermes_profile_required')
        profile = profile.resolve()
    return root.resolve(), config, profile


def scoped_config(config_path):
    config = json.loads(config_path.read_text())
    if config['project_id'] + ':' + config['uid'] != SCOPE:
        raise ValueError('demo_scope_required')
    return config


STAGES = {
    'pipeline': [
        'gmail_delta_parse_deduplicate_publish',
        'destination_classification_and_correction',
        'financial_review_and_approved_publication',
        'persist_sanitized_ops_run',
    ],
    'watchdog': ['ledger_health_and_staleness', 'backup_if_older_than_24h', 'deduplicated_ops_alert'],
    'backup': ['force_verified_private_backup', 'retain_seven_snapshots', 'canonical_watchdog'],
    'classification': ['bounded_destination_classification', 'admin_precedence_and_correction_only'],
    'review': ['discover_quarantined_receipts', 'notify_admin_with_revision', 'notify_only_no_publication'],
    'status': ['read_only_ledger_and_review_counts'],
    'verify-backup': ['verify_latest_backup_checksums_and_database_snapshot'],
}


def dispatch(action, mode='preview', *, runner=None):
    result = {'ok': True, 'action': action, 'mode': mode, 'executed': False}
    if action not in STAGES or mode not in ('preview', 'live', 'inspect'):
        return dict(result, ok=False, error='InvalidActionOrMode')
    result['stages'] = STAGES[action]
    if mode == 'inspect':
        if action not in ('status', 'verify-backup'):
            return dict(result, ok=False, error='InspectionNotAllowed')
        try:
            root, config_path, _ = runtime_paths()
            config = scoped_config(config_path)
            scope = SCOPE
            path = Path(config['db_path'])
            if action == 'verify-backup':
                bundles = sorted((p for p in (path.parent / 'backups').glob('backup-*')
                                  if p.is_dir() and p.name[7:].isdigit()), key=lambda p: int(p.name[7:]))
                if not bundles:
                    raise FileNotFoundError('No backup')
                sys.path.insert(0, str(root))
                from ops import verify_backup
                snapshot = verify_backup(bundles[-1])
                return dict(result, read_only=True, verified=True, metrics={'verified_tables': len(snapshot)})
            with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=10)) as db:
                db.execute('BEGIN')
                metrics = {'events': db.execute('SELECT count(*) FROM events WHERE scope=?', (scope,)).fetchone()[0],
                           'outbox_pending': db.execute("SELECT count(*) FROM outbox WHERE scope=? AND state!='sent'", (scope,)).fetchone()[0],
                           'quarantined': db.execute("SELECT count(*) FROM candidates WHERE scope=? AND reason NOT IN ('ready','archive','pre_checkpoint','not_transaction')", (scope,)).fetchone()[0]}
            review_path = Path(config['financial_review_state_path']) if config.get('financial_review_state_path') else None
            if review_path and review_path.exists():
                with closing(sqlite3.connect(review_path.as_uri() + '?mode=ro', uri=True, timeout=10)) as db:
                    for state in ('pending', 'approved', 'posted'):
                        metrics['reviews_' + state] = db.execute('SELECT count(*) FROM reviews WHERE scope=? AND state=?', (scope, state)).fetchone()[0]
            return dict(result, read_only=True, metrics=metrics)
        except Exception as exc:
            return dict(result, ok=False, read_only=True, error=type(exc).__name__)
    if mode == 'preview':
        return dict(result, note='Preview only; no collection, cloud writes, inference or notifications.')
    if os.environ.get('BUDGETX_N8N_ALLOW_LIVE') != '1':
        return dict(result, ok=False, error='LiveExecutionNotArmed')
    if legacy_is_active(action):
        return dict(result, ok=False, error='LegacySchedulerStillEnabled')
    try:
        root, config_path, profile = runtime_paths(require_profile=True)
        scoped_config(config_path)
        environment = {k: v for k, v in os.environ.items()
                       if k in ('PATH', 'LANG', 'HOME', 'LOGNAME', 'USER', 'SHELL',
                                'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS')}
        environment['HERMES_HOME'] = str(profile)
        environment['XDG_RUNTIME_DIR'] = '/run/user/' + str(os.getuid())
        environment['DBUS_SESSION_BUS_ADDRESS'] = 'unix:path=' + environment['XDG_RUNTIME_DIR'] + '/bus'
        script, arguments = {
            'pipeline': ('ops.py', ['run']),
            'watchdog': ('ops.py', ['watch']),
            'backup': ('ops.py', ['backup']),
            'classification': ('category_hook.py', []),
            'review': ('financial_review_hook.py', ['--notify-only']),
        }[action]
        command = [sys.executable, str(root / script), '--config', str(config_path), *arguments]
        completed = (runner or subprocess.run)(command, cwd=root, env=environment, shell=False,
                                              capture_output=True, text=True, timeout=400)
        if not completed.stdout.strip() and completed.returncode == 0:
            return dict(result, skipped=True, reason='CanonicalLockBusy')
        if not completed.stdout.strip():
            return dict(result, ok=False, executed=True, error='CanonicalCommandFailed', exit_code=completed.returncode)
        payload = json.loads(completed.stdout.strip().splitlines()[-1])
        if not isinstance(payload, dict):
            raise ValueError('Invalid output')
        metric_keys = ('code', 'outbox_pending', 'financial_review_posted', 'financial_review_pending',
                       'financial_review_approved', 'category_corrections_pending', 'category_transaction_updates',
                       'failures', 'finished', 'pending', 'processed', 'posted', 'approved', 'transaction_updates',
                       'whitelist_writes', 'corrections_pending', 'backup_age_seconds', 'alert_delivered', 'verified')
        metrics = {key: payload[key] for key in metric_keys if key in payload and
                   (payload[key] is None or type(payload[key]) in (int, float, bool))}
        if isinstance(payload.get('issues'), list):
            metrics['issue_count'] = len(payload['issues'])
        error_fields = [key for key in ('error', 'publication_error', 'category_error', 'financial_review_error') if payload.get(key)]
        return dict(result, ok=completed.returncode == 0 and not error_fields, executed=True,
                    exit_code=completed.returncode, metrics=metrics, failed_components=error_fields)
    except Exception as exc:
        return dict(result, ok=False, error=type(exc).__name__)


def legacy_is_active(action, jobs_path=None):
    """Read only; never alter another profile's scheduler. Ambiguity blocks cutover."""
    try:
        if action in ('watchdog', 'backup'):
            state = subprocess.run(['systemctl', '--user', 'is-active', 'budgetx-mesh-watch.timer'],
                                   capture_output=True, text=True, timeout=10)
            enabled = subprocess.run(['systemctl', '--user', 'is-enabled', 'budgetx-mesh-watch.timer'],
                                     capture_output=True, text=True, timeout=10)
            return not (state.returncode == 3 and state.stdout.strip() == 'inactive' and
                        enabled.returncode == 1 and enabled.stdout.strip() == 'disabled')
        selected = os.environ.get('HERMES_HOME', '')
        profile = Path(selected)
        if (not selected or not profile.is_absolute() or not profile.is_dir() or
                not (profile / 'config.yaml').is_file()):
            return True
        path = Path(jobs_path) if jobs_path else profile / 'cron/jobs.json'
        data = json.loads(path.read_text())
        jobs = data if isinstance(data, list) else data.get('jobs', [])
        if isinstance(jobs, dict):
            jobs = list(jobs.values())
        matches = [job for job in jobs if job.get('name') == 'budgetx-email-mesh-demo']
        return not matches or any(job.get('enabled') is not False for job in matches)
    except Exception:
        return True


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=tuple(STAGES))
    parser.add_argument('--mode', choices=('preview', 'inspect', 'live'), default='preview')
    args = parser.parse_args()
    result = dispatch(args.action, args.mode)
    # Always emit only sanitized JSON; the n8n IF/Stop node handles result.ok.
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
