"""Approved demo reset: retain ledger/markers; remap opening wallets, skip old mail."""
import fcntl
import json
import math
import os
import sqlite3
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from mesh import load_config, FirestorePublisher, build_gmail, dumps, digest

NAMES = {'BRI': 'BRI', 'SEABANK': 'Seabank', 'KROM': 'Krom', 'JAGO': 'Jago',
         'SUPERBANK': 'Superbank', 'TOKOPEDIA_CC': 'Tokopedia Card',
         'BRI_PLATINUM': 'BRI Platinuma', 'SPAYLATER': 'Shopee Paylater'}


def remap(config, rows, names):
    out = deepcopy(config)
    for key, name in names.items():
        matches = [r for r in rows if r['name'].casefold() == name.casefold()]
        if len(matches) != 1 or matches[0]['type'] != config['registry']['wallets'][key]['type']:
            raise ValueError('wallet identity/type mismatch: ' + key)
        row = matches[0]
        values = {k: row.get(k, 0) for k in ('balance', 'heldAmount', 'creditLimit')}
        if any(type(v) not in (int, float) or not math.isfinite(v) for v in values.values()):
            raise ValueError('invalid wallet position')
        wallet = dict(id=row['id'], type=row['type'], opening_balance=row['balance'])
        if row['type'] in ('credit', 'paylater'):
            if 'creditLimit' not in row or values['creditLimit'] < 0 or values['heldAmount'] < 0:
                raise ValueError('invalid credit position')
            wallet.update(creditLimit=values['creditLimit'], heldAmount=values['heldAmount'])
        out['registry']['wallets'][key] = wallet
    out['publish_enabled'] = False
    return out


def save_private(path, obj):
    temporary = path.with_suffix('.pending')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as file:
        json.dump(obj, file, ensure_ascii=False, indent=2, default=str)
        file.flush()
        os.fsync(file.fileno())
    os.replace(temporary, path)
    fd = os.open(path.parent, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)


def apply(path):
    from firebase_admin import firestore
    c = load_config(str(path))
    if c['publish_enabled']: raise ValueError('pause scheduler and disable publication first')
    db_path = Path(c['db_path'])
    with os.fdopen(os.open(str(db_path) + '.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), 'r+b') as lock:
        os.fchmod(lock.fileno(), 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        db = sqlite3.connect(db_path)
        try:
            p = FirestorePublisher(c)
            scope = p.scope
            if db.execute("SELECT count(*) FROM outbox WHERE scope=? AND state!='sent'", (scope,)).fetchone()[0] != 0:
                raise ValueError('pending publication requires reconciliation')
            if db.execute('SELECT count(*) FROM holds WHERE scope=? AND final_id IS NULL', (scope,)).fetchone()[0] != 0:
                raise ValueError('open hold requires reconciliation')
            if list(p.db.collection(p.base + '/transactions').limit(1).stream(timeout=30)):
                raise ValueError('reset is no longer empty')
            snaps = list(p.db.collection(p.base + '/wallets').stream(timeout=30))
            rows = [dict(d.to_dict(), id=d.id) for d in snaps]
            new = remap(c, rows, NAMES)
            new['categories'] = [dict(d.to_dict(), id=d.id) for d in p.db.collection(p.base + '/categories').stream(timeout=30)]
            # Cursor boundary precedes all changes; mail after this read remains a delta.
            t0 = datetime.now(timezone.utc).isoformat()
            gmail = build_gmail(c)
            profile = gmail.users().getProfile(userId='me').execute()
            assert profile['emailAddress'].casefold() == c['mailbox_email'].casefold()
            new['checkpoint_at'] = t0
            new['registry']['reporter_aliases'] = {'SUPERBANK': {'Tabungan Utama': 'SUPERBANK'}}
            stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            folder = path.parent / ('reset-' + stamp)
            folder.mkdir(mode=0o700)
            dest = sqlite3.connect(folder / 'state.sqlite3')
            db.backup(dest)
            dest.close()
            os.chmod(folder / 'state.sqlite3', 0o600)
            cp_ref = p.db.document(p.base + '/mesh_state/demo-checkpoint')
            old_cp = cp_ref.get(timeout=30).to_dict()
            if old_cp['checkpoint_at'] != c['checkpoint_at'] or old_cp['scope'] != scope:
                raise ValueError('cloud checkpoint does not match local config')
            audit_ref = p.db.document(p.base + '/mesh_state/reset-' + digest(t0)[:20])
            new_cp = dict(checkpoint_at=t0, scope=scope, basis='demo_reset_simulation',
                          opening_wallets={r['id']: {k: r[k] for k in ('balance', 'creditLimit', 'heldAmount') if k in r} for r in rows},
                          activated_at=t0, gmail_cursor=str(profile['historyId']), previous_checkpoint_at=c['checkpoint_at'])
            save_private(folder / 'plan.json', dict(previous_config=c, next_config=new, previous_cloud_checkpoint=old_cp,
                                                  next_cloud_checkpoint=new_cp, wallets=rows))
            @firestore.transactional
            def update_cloud(t):
                old = cp_ref.get(transaction=t)
                if old.to_dict() != old_cp:
                    raise ValueError('checkpoint changed concurrently')
                current = [d.reference.get(transaction=t) for d in snaps]
                if not all(a.to_dict() == b.to_dict() for a, b in zip(current, snaps)):
                    raise ValueError('wallet changed concurrently')
                t.create(audit_ref, dict(previous_checkpoint=old_cp, new_checkpoint=new_cp, reason='user_approved_reset_delta_only'))
                t.set(cp_ref, new_cp)
            update_cloud(p.db.transaction())
            with db:
                db.execute('UPDATE checkpoints SET at=?,registry=? WHERE scope=?', (t0, dumps(new['registry']), scope))
                db.execute('UPDATE mailbox SET cursor=?,last_success=? WHERE account=?', (str(profile['historyId']), t0, c['account_id']))
                db.execute("UPDATE candidates SET reason='pre_checkpoint' WHERE scope=? AND event_id IS NULL AND reason!='archive'", (scope,))
                db.execute('INSERT OR REPLACE INTO registry VALUES(?,?)', (scope, dumps(new['registry'])))
                db.execute('DELETE FROM category_cache WHERE scope=?', (scope,))
                for cat in new['categories']:
                    db.execute('INSERT INTO category_cache VALUES(?,?,?)', (scope, cat['id'], dumps(cat)))
            save_private(path, new)
            if cp_ref.get(timeout=30).to_dict() != new_cp:
                raise ValueError('post-apply checkpoint verification failed')
            if list(p.db.collection(p.base + '/transactions').limit(1).stream(timeout=30)):
                raise ValueError('post-apply transaction collection unexpectedly non-empty')
            if not all(d.reference.get(timeout=30).to_dict() == d.to_dict() for d in snaps):
                raise ValueError('post-apply wallet verification failed')
            print(dumps(dict(checkpoint_at=t0, cursor=profile['historyId'], remapped_wallets=len(NAMES),
                             transactions=0, balance_changes=0, retained_events=db.execute('SELECT count(*) FROM events').fetchone()[0], backup=str(folder))))
        finally:
            db.close()

def main(argv=None):
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, help='Explicit absolute private mesh config')
    parser.add_argument('--apply', action='store_true', help='Apply approved reset; otherwise preview only')
    args = parser.parse_args(argv)
    path = Path(args.config)
    if not path.is_absolute():
        parser.error('--config must be absolute')
    if args.apply:
        apply(path)
    else:
        # Offline scope/config validation only; no database, Gmail or cloud access.
        c = load_config(str(path))
        print(dumps(dict(apply=False, scope=c['project_id'] + ':' + c['uid'],
                         publication_enabled=c['publish_enabled'],
                         requires='Explicit --apply plus prior reset authorization; pause scheduler and disable publication first',
                         cloud_state_checked=False, changes=0)))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
