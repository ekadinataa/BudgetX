"""Optional bounded post-delta classifier; no financial event replay or new schedule."""
import argparse
import fcntl
import json
import os
from pathlib import Path


def run_hook(config, worker=None, publisher=None):
    if config.get('destination_classification_enabled') is not True:
        return {'enabled': False}
    from mesh import validate_config
    from destination_whitelist import DestinationWhitelist
    from ops import atomic, read_json
    validate_config(config)
    root = Path(config['db_path']).parent
    scope = config['project_id'] + ':' + config['uid']
    state_path = root / 'category-corrections.json'
    lock_path = root / 'category-hook.lock'
    with open(lock_path, 'a') as lock:
        os.chmod(lock_path, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'enabled': True, 'busy': True}
        state = read_json(state_path) or {'scope': scope, 'destinations': {}}
        if state.get('scope') != scope:
            raise ValueError('correction scope mismatch')
        backlog = state['destinations']
        with DestinationWhitelist(config['destination_whitelist_path'], scope) as store:
            for entry in store.pending():
                old = backlog.setdefault(entry['destination'], [])
                backlog[entry['destination']] = list(dict.fromkeys(old + entry['event_ids']))
        # Persist event targets BEFORE LLM approval; failure/restart/admin decisions retain them.
        atomic(state_path, state)
        if worker is None:
            from category_worker import run_worker
            worker = lambda c: run_worker(c, limit=1, notify_admin=c.get('destination_classification_notify_admin') is True)
        work = worker(config)
        from category_worker import worker_records
        completed = state.setdefault('completed', {})
        approvals = {}
        for record in worker_records(config):
            approval = record.get('approval')
            if not approval:
                continue
            name = record['destination']
            stamp = json.dumps([sorted(record['event_ids']), approval['category'], approval['tag'], approval['source']], ensure_ascii=False)
            approvals[name] = stamp
            if completed.get(name) != stamp:
                backlog[name] = list(dict.fromkeys(backlog.get(name, []) + record['event_ids']))
        atomic(state_path, state)
        # Sync admin approvals from completed → destination_approvals whitelist.
        # Entries added via corrections.json (not via --approve CLI) are recorded
        # in completed but never call wl.decide(), so lookup() returns None and
        # the Firestore write is never triggered. Fix: backfill here, idempotent.
        with DestinationWhitelist(config['destination_whitelist_path'], scope) as store:
            for destination, stamp in completed.items():
                try:
                    parts = json.loads(stamp)  # [event_ids, category, tag, source]
                    if len(parts) == 4 and parts[3] == 'admin' and not store.lookup(destination):
                        store.decide(destination, parts[1], parts[2],
                                     source='admin', reason='synced from admin corrections')
                except Exception:
                    pass  # malformed stamp; skip silently
        approved = []
        with DestinationWhitelist(config['destination_whitelist_path'], scope) as store:
            for destination in backlog:
                if store.lookup(destination):
                    approved.append(destination)
                    if len(approved) >= 2:
                        break
        result = {'enabled': True, 'processed': work.get('classified', work.get('processed', 0)),
                  'transaction_updates': 0, 'whitelist_writes': 0}
        if approved and config.get('publish_enabled') is True:
            if publisher is None:
                from apply_destination_demo import apply_demo
                publisher = apply_demo
            events = list(dict.fromkeys(eid for d in approved for eid in backlog[d]))
            applied = publisher(config, apply=True, event_ids=events, mirror=True, destinations=approved)
            if not applied.get('verified', {}).get('readback'):
                raise RuntimeError('correction readback missing')
            result.update({k: applied[k] for k in ('transaction_updates', 'whitelist_writes')})
            for destination in approved:
                if destination in approvals:
                    completed[destination] = approvals[destination]
                backlog.pop(destination)
            atomic(state_path, state)
        result['corrections_pending'] = len(backlog)
        return result


def main():
    from mesh import load_config
    os.umask(0o077)
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config', required=True)
    args = ap.parse_args()
    try:
        print(json.dumps(run_hook(load_config(args.config))))
        return 0
    except Exception as exc:
        print(json.dumps({'error': type(exc).__name__, 'action': 'category queue retained; financial pipeline unchanged'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
