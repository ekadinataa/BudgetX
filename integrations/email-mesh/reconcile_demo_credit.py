"""One-time demo reconciliation. Default dry-run; --apply writes demo only."""
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, auth, firestore
from migrate_credit import PROJECT, UID, plan
from mesh import load_config, validate_config


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--apply', action='store_true')
    args.add_argument('--config', required=True)
    args.add_argument('--facilities', required=True, help='Private JSON object: wallet ID -> [name, credit/paylater, approved legacy limit]')
    options = args.parse_args()
    apply = options.apply
    config = load_config(options.config)
    validate_config(config)
    facilities_path = Path(options.facilities)
    if not facilities_path.is_absolute() or facilities_path.is_symlink() or facilities_path.stat().st_mode & 0o077:
        raise ValueError('Private absolute facilities file required')
    facilities = json.loads(facilities_path.read_text())
    if not isinstance(facilities, dict) or not facilities:
        raise ValueError('Explicit nonempty approved facilities required')
    for key, item in facilities.items():
        if not isinstance(key, str) or not key or '/' in key or not isinstance(item, list) or len(item) != 3:
            raise ValueError('Invalid approved facility identity')
        name, kind, limit = item
        if not isinstance(name, str) or not name or kind not in ('credit', 'paylater') or type(limit) is not int or limit <= 0:
            raise ValueError('Invalid approved facility position')
    cred = credentials.Certificate(config['firebase_admin_path'])
    if cred.project_id != PROJECT:
        raise ValueError('Wrong project')
    firebase_admin.initialize_app(cred)
    user = auth.get_user_by_email('demo@budgetx.id')
    if user.uid != UID or user.disabled:
        raise ValueError('Wrong target UID')
    db = firestore.client()
    root = db.collection('users').document(UID)
    refs = {i: root.collection('wallets').document(i) for i in facilities}
    snapshots = {d.id: d for d in db.get_all(refs.values())}
    if any(not d.exists for d in snapshots.values()) or len(snapshots) != len(facilities):
        raise ValueError('Missing facility')
    rows = [{'id': d.id, **d.to_dict()} for d in snapshots.values()]
    changes = plan(rows, facilities=facilities)
    txs = list(root.collection('transactions').stream(timeout=30))
    linked = [d.id for d in txs if d.to_dict().get('walletId') in changes or d.to_dict().get('toWalletId') in changes]
    if linked:
        raise ValueError('Existing facility transactions require reconciliation before migration')
    print(json.dumps({'project': PROJECT, 'uid': UID, 'apply': apply, 'changes': changes}, indent=2))
    if not apply or not changes:
        return
    t0 = datetime.now(timezone.utc)
    folder = Path(config['db_path']).parent / 'backups'
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    backup = folder / f'credit-before-{t0.strftime("%Y%m%dT%H%M%S%fZ")}.json'
    with backup.open('x') as f:
        os.chmod(backup, 0o600)
        json.dump({'project': PROJECT, 'uid': UID, 't0': t0.isoformat(), 'wallets': rows}, f, default=str, indent=2)
        f.flush()
        os.fsync(f.fileno())
    batch = db.batch()
    for i, change in changes.items():
        # Increment with update-time precondition: never clobber a concurrent edit.
        batch.update(refs[i], {'creditLimit': change['creditLimit'], 'balance': firestore.Increment(change['balance_delta']), 'heldAmount': 0, 'positionBasis': 'estimated', 'positionCheckpointAt': t0, 'positionOrigin': 'demo-simulation', 'creditSchemaVersion': 1}, option=db.write_option(last_update_time=snapshots[i].update_time))
    marker = root.collection('meshCheckpoints').document('credit-schema-v1')
    batch.create(marker, {'origin': 'demo-simulation', 'checkpointAt': t0, 'facilities': list(changes), 'openingOutstanding': 0})
    batch.commit()
    for i in changes:
        value = refs[i].get(timeout=30).to_dict()
        if value.get('balance') != 0 or value.get('creditLimit') != changes[i]['creditLimit']:
            raise ValueError('Post-write verification mismatch')
    print('Verified migrated facilities:', len(changes), 'backup:', backup)


if __name__ == '__main__':
    main()
