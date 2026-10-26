"""Demo-only whitelist mirror and category/tag correction. Dry-run unless --apply."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from datetime import datetime, timezone
from contextlib import closing

EXPENSE_SECTIONS = {'needs', 'wants', 'savings', 'expense'}


def plan_categories(catalog, sections):
    """Exact taxonomy additions; never rename/reassign an existing catalog."""
    additions = []
    palette = next((c['color'] for c in catalog if c.get('color')), None)
    if not palette:
        raise ValueError('existing catalog palette required')
    for name, section in sections.items():
        hits = [c for c in catalog if c.get('name') == name and c.get('section') in EXPENSE_SECTIONS]
        if len(hits) > 1:
            raise ValueError('ambiguous taxonomy category')
        if not hits:
            cid = 'destination-' + hashlib.sha256(name.encode()).hexdigest()[:20]
            if any(c['id'] == cid for c in catalog):
                raise ValueError('category ID collision')
            additions.append({'id': cid, 'name': name, 'section': section, 'icon': '🏷️', 'color': palette})
    return additions
PATCH_FIELDS = {'categoryId', 'category_source', 'category_status', 'tags',
                'destination_category', 'destination_tag', 'destination_name', 'destination_source'}


def authoritative_decision(local, cloud):
    if cloud and cloud.get('source') == 'admin' and (not local or local.get('source') != 'admin'):
        return cloud
    return local


def managed_matches(actual, expected):
    return isinstance(actual, dict) and all(actual.get(k) == v for k, v in expected.items())


def decision_id(destination):
    return hashlib.sha256(' '.join(destination.casefold().split()).encode()).hexdigest()


def build_patch(tx, decision, catalog):
    """Admin edits win; immutable transaction and accounting fields never included."""
    if tx.get('category_source') == 'manual' or not decision:
        return {}
    patch = {'destination_category': decision['category'], 'destination_tag': decision['tag'],
             'destination_name': decision['destination'], 'destination_source': decision['source']}
    tags = list(tx.get('tags') or [])
    old = tx.get('destination_tag')
    if old and tx.get('destination_source') in ('admin', 'llm') and old != decision['tag']:
        tags = [t for t in tags if t != old]
    if decision['tag'] and decision['tag'] not in tags:
        tags.append(decision['tag'])
    patch['tags'] = tags
    kind = tx.get('type')
    if kind == 'transfer':
        patch['categoryId'] = None
    elif kind == 'expense':
        matches = [c['id'] for c in catalog if c.get('name') == decision['category']
                   and c.get('section') in EXPENSE_SECTIONS]
        if len(matches) != 1:
            return {}  # Missing or ambiguous category IDs are never guessed.
        patch['categoryId'] = matches[0]
    else:
        return {}  # A destination's business sector does not classify income.
    patch['category_source'] = 'whitelist_' + decision['source']
    patch['category_status'] = 'classified' if patch['categoryId'] else 'unclassified'
    assert set(patch) <= PATCH_FIELDS
    return {k: v for k, v in patch.items() if tx.get(k) != v}


def execute_patches(publisher, patches):
    """Compare-and-set only approved classification fields on observed documents."""
    for snapshot, patch in patches:
        if not patch or not set(patch) <= PATCH_FIELDS:
            raise ValueError('non-classification write rejected')
        @publisher.runner
        def correct(transaction):
            current = snapshot.reference.get(transaction=transaction)
            if not current.exists or current.update_time != snapshot.update_time:
                raise ValueError('transaction changed after plan')
            body = current.to_dict()
            if body.get('category_source') == 'manual':
                raise ValueError('manual edit protected')
            cid = patch.get('categoryId', body.get('categoryId'))
            kind = body.get('type')
            if kind == 'transfer' and cid is not None:
                raise ValueError('internal transfer cannot have category')
            if cid is not None:
                cat = publisher.db.document(publisher.base + '/categories/' + cid).get(transaction=transaction)
                allowed = {'income'} if kind == 'income' else EXPENSE_SECTIONS
                label = patch.get('destination_category', body.get('destination_category'))
                if not cat.exists or cat.to_dict().get('section') not in allowed or (label and cat.to_dict().get('name') != label):
                    raise ValueError('category changed or incompatible')
            name = patch.get('destination_name', body.get('destination_name'))
            if name:
                decision = publisher.db.document(publisher.base + '/destination_whitelist/' + decision_id(name)).get(transaction=transaction)
                if decision.exists and decision.to_dict().get('source') == 'admin' and patch.get('destination_source', body.get('destination_source')) != 'admin':
                    raise ValueError('cloud admin decision protected')
            option = publisher.db.write_option(last_update_time=snapshot.update_time)
            transaction.update(snapshot.reference, patch, option=option)
        correct(publisher.db.transaction())


def private_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as out:
        json.dump(value, out, ensure_ascii=False, indent=2, default=str)
        out.flush()
        os.fsync(out.fileno())


def collection_snapshot(publisher, name):
    return {s.id: s for s in publisher.db.collection(publisher.base + '/' + name).stream()}


def body_map(snapshots):
    return {key: value.to_dict() for key, value in snapshots.items()}


def apply_demo(config, apply=False, event_ids=None, mirror=True, observe=False, destinations=None):
    """Finite demo-only correction; no Gmail runs or replay. Targeted mode for worker."""
    from mesh import FirestorePublisher
    from destination_whitelist import DestinationWhitelist, CATEGORY_SECTIONS, extract_destination
    import fcntl
    import sqlite3
    scope = config['project_id'] + ':' + config['uid']
    pub = FirestorePublisher(config)  # Verifies project and current Auth identity.
    lock_path = str(config['db_path']) + '.lock'
    with open(lock_path, 'a') as lock:
        os.chmod(lock_path, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)  # Exclude the existing financial engine, not its scheduler.
        with DestinationWhitelist(config['destination_whitelist_path'], scope) as store:
            before = {name: collection_snapshot(pub, name) for name in ('wallets', 'categories', 'mesh_state')}
            if event_ids is None:
                txs = collection_snapshot(pub, 'transactions')
                markers = collection_snapshot(pub, 'mesh_events')
            else:
                event_ids = set(event_ids)
                if any(len(e) != 64 or any(c not in '0123456789abcdef' for c in e) for e in event_ids):
                    raise ValueError('invalid event IDs')
                tx_refs = [pub.db.document(pub.base + '/transactions/demo-mesh-' + e + '-0') for e in event_ids]
                marker_refs = [pub.db.document(pub.base + '/mesh_events/demo-' + e) for e in event_ids]
                txs = {s.id: s for s in pub.db.get_all(tx_refs) if s.exists} if tx_refs else {}
                markers = {s.id: s for s in pub.db.get_all(marker_refs) if s.exists} if marker_refs else {}
            before['transactions'] = txs
            before['mesh_events'] = markers
            catalog = [dict(s.to_dict(), id=s.id) for s in before['categories'].values()]
            category_sections = CATEGORY_SECTIONS
            if destinations is not None:
                selected = [store.lookup(d) for d in destinations]
                category_sections = {d['category']: CATEGORY_SECTIONS[d['category']] for d in selected if d}
            elif event_ids is not None:
                category_sections = {}  # Runtime hook never broadens catalog outside bootstrap.
            additions = plan_categories(catalog, category_sections)
            planned_catalog = catalog + additions
            parsed_by_event = {s.to_dict().get('event_id'): s.to_dict().get('parsed') or {} for s in markers.values()}
            patches, skipped, unknown = [], [], []
            for tid, snap in txs.items():
                tx = snap.to_dict()
                eid = tx.get('mesh', {}).get('eventId')
                # Only original primary components; fees and manual/legacy records untouched.
                if tid != 'demo-mesh-' + str(eid) + '-0' or tx.get('mesh', {}).get('scope') != scope:
                    skipped.append(tid)
                    continue
                parsed = parsed_by_event.get(eid)
                if not parsed:
                    skipped.append(tid)
                    continue
                identity = parsed.get('destination_identity') or ''
                if identity.startswith('BRIZZI • '):
                    skipped.append(tid)  # Preserve explicit card-specific policy.
                    continue
                destination = extract_destination(parsed)
                if not destination:
                    skipped.append(tid)
                    continue
                if destinations is not None and decision_id(destination) not in {decision_id(d) for d in destinations}:
                    skipped.append(tid)
                    continue
                remote = pub.db.document(pub.base + '/destination_whitelist/' + decision_id(destination)).get()
                decision = authoritative_decision(store.lookup(destination), remote.to_dict() if remote.exists else None)
                if not decision:
                    unknown.append(destination)
                    if observe:
                        store.observe(destination, provider=parsed.get('provenance', {}).get('provider'),
                                      event_id=eid, context={'event_type': parsed.get('event_type')})
                    continue
                patch = build_patch(tx, decision, planned_catalog)
                if patch:
                    patches.append((snap, patch))
            mirror_changes = []
            if mirror:
                decisions = store.records() if destinations is None else [store.lookup(d) for d in destinations]
                decisions = [d for d in decisions if d]
                def doc_id(decision):
                    return hashlib.sha256(' '.join(decision['destination'].casefold().split()).encode()).hexdigest()
                refs = [pub.db.document(pub.base + '/destination_whitelist/' + doc_id(d)) for d in decisions]
                observed_mirrors = {s.id: s for s in pub.db.get_all(refs)} if refs else {}
                for decision, ref in zip(decisions, refs):
                    name = decision['destination']
                    body = {k: decision[k] for k in ('destination', 'category', 'tag', 'source')}
                    for key in ('verification_status', 'row_ids', 'confidence', 'reason'):
                        if key in decision:
                            body[key] = decision[key]
                    body['scope'] = scope
                    snap = observed_mirrors[ref.id]
                    if not snap.exists or not managed_matches(snap.to_dict(), body):
                        if snap.exists and snap.to_dict().get('source') == 'admin' and body['source'] != 'admin':
                            continue  # Remote admin decision remains authoritative.
                        mirror_changes.append((ref, snap, body))
            result = {'scope': scope, 'apply': apply, 'categories_added': len(additions),
                      'whitelist_writes': len(mirror_changes), 'transaction_updates': len(patches),
                      'unknown_destinations': sorted(set(unknown)), 'skipped': len(skipped),
                      'patches': [{'id': s.id, 'fields': p} for s, p in patches]}
            if not apply:
                return result
            changed = bool(additions or mirror_changes or patches)
            bundle = None
            if changed:
                stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
                bundle = Path(config['db_path']).parent / 'category-backups' / stamp
                private_json(bundle / 'cloud-before.json', {k: body_map(v) for k, v in before.items()})
                private_json(bundle / 'whitelist-before.json', [
                    {'id': ref.id, 'exists': snap.exists, 'body': snap.to_dict()} for ref, snap, _ in mirror_changes])
                private_json(bundle / 'plan.json', result)
                private_json(bundle / 'config-before.json', config)
                # Recoverable SQLite snapshot; never copy a live WAL file.
                for src, filename in ((config['db_path'], 'ledger.sqlite3'),
                                      (config['destination_whitelist_path'], 'whitelist.sqlite3')):
                    with closing(sqlite3.connect(Path(src).as_uri() + '?mode=ro', uri=True)) as source, closing(sqlite3.connect(bundle / filename)) as dest:
                        source.backup(dest)
                        assert dest.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
                    os.chmod(bundle / filename, 0o600)
                for cat in additions:
                    pub.db.document(pub.base + '/categories/' + cat['id']).create({k: v for k, v in cat.items() if k != 'id'})
                # Small batches with create or update-time guards; rerun recovers partial progress.
                for start in range(0, len(mirror_changes), 300):
                    batch = pub.db.batch()
                    for ref, snap, body in mirror_changes[start:start + 300]:
                        if snap.exists:
                            batch.update(ref, body, option=pub.db.write_option(last_update_time=snap.update_time))
                        else:
                            batch.create(ref, body)
                    batch.commit()
                execute_patches(pub, patches)
            # Read exact affected docs AND immutable finance snapshots before claiming success.
            for snap, patch in patches:
                actual = snap.reference.get().to_dict()
                if any(actual.get(k) != v for k, v in patch.items()):
                    raise RuntimeError('transaction patch readback mismatch')
                expected = dict(snap.to_dict(), **patch)
                if actual != expected:
                    raise RuntimeError('concurrent/unexpected transaction fields changed')
            for cat in additions:
                actual = pub.db.document(pub.base + '/categories/' + cat['id']).get().to_dict()
                if actual != {k: v for k, v in cat.items() if k != 'id'}:
                    raise RuntimeError('category readback mismatch')
            for start in range(0, len(mirror_changes), 300):
                items = mirror_changes[start:start + 300]
                actual = {s.id: s.to_dict() for s in pub.db.get_all([ref for ref, _, _ in items])}
                if any(not managed_matches(actual.get(ref.id), body) for ref, _, body in items):
                    raise RuntimeError('whitelist readback mismatch')
            for name in ('wallets', 'mesh_state'):
                if body_map(collection_snapshot(pub, name)) != body_map(before[name]):
                    raise RuntimeError('financial/checkpoint invariant changed: ' + name)
            for tid, old in txs.items():
                actual = old.reference.get().to_dict()
                if {k: v for k, v in actual.items() if k not in PATCH_FIELDS} != {k: v for k, v in old.to_dict().items() if k not in PATCH_FIELDS}:
                    raise RuntimeError('transaction accounting invariant changed')
            if event_ids is None and set(collection_snapshot(pub, 'transactions')) != set(txs):
                raise RuntimeError('transaction document set changed')
            for old in markers.values():
                if old.reference.get().to_dict() != old.to_dict():
                    raise RuntimeError('financial marker changed')
            result['verified'] = {'wallets_unchanged': True, 'financial_fields_unchanged': True,
                                  'markers_unchanged': True, 'checkpoint_unchanged': True, 'readback': True}
            result['backup'] = str(bundle) if bundle else None
            if bundle:
                private_json(bundle / 'result.json', result)
            return result


def main():
    from mesh import load_config
    os.umask(0o077)
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config', required=True)
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--observe', action='store_true', help='enqueue real unknown destinations, no LLM calls')
    args = ap.parse_args()
    print(json.dumps(apply_demo(load_config(args.config), apply=args.apply, observe=args.observe), ensure_ascii=False))


if __name__ == '__main__':
    main()
