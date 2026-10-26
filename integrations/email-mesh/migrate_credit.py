# Demo-only, explicit one-time position reconciliation; no historical replay.
PROJECT = 'budgetku-app-v1'
UID = 'VCqdnx9zvJVrZQSNp6gyGm6Zzhr2'
FACILITIES = {}  # No deployment-specific wallet IDs in versioned source.

def plan(rows, facilities=None):
    facilities = FACILITIES if facilities is None else facilities
    changes = {}
    for row in rows:
        if row['id'] not in facilities:
            continue
        name, kind, limit = facilities[row['id']]
        if row.get('name') != name or row.get('type') != kind:
            raise ValueError('Facility identity mismatch')
        if 'creditLimit' in row:
            if row['creditLimit'] != limit:
                raise ValueError('Previously configured limit differs; manual review required')
            continue
        if row.get('balance') != limit:
            raise ValueError('Legacy position changed; manual review required')
        changes[row['id']] = {'creditLimit': limit, 'balance_delta': -limit}
    return changes
