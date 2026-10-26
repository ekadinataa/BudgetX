"""Conservative owner-name fallback: evidence-only, never creates money effects."""
import re
from datetime import datetime
from zoneinfo import ZoneInfo

MONTHS = {'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'mei': 5, 'jun': 6,
          'jul': 7, 'agu': 8, 'sep': 9, 'okt': 10, 'nov': 11, 'des': 12}


def transaction_time(p):
    value = str(p.get('body_transaction_at') or '').casefold()
    m = re.fullmatch(r'\s*(\d{1,2})\s+(\w+)\s+(\d{4}),?\s+(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(?:wib)?\s*', value)
    if not m:
        return None
    day, month, year, hour, minute, second = m.groups()
    try:
        return datetime(int(year), MONTHS[month[:3]], int(day), int(hour), int(minute), int(second or 0), tzinfo=ZoneInfo('Asia/Jakarta')).timestamp()
    except (KeyError, ValueError):
        return None


def compatible(p, q):
    a, b = transaction_time(p), transaction_time(q)
    return (a is not None and b is not None and abs(a - b) <= 120
            and p.get('destination_wallet') == q.get('destination_wallet')
            and p.get('currency') == q.get('currency')
            and p.get('amount') == (q.get('total_credit') if q.get('total_credit') is not None else q.get('amount')))


def match_incoming(p, events, incoming, names, wallets, now):
    # User-confirmed name establishes possible ownership, NOT a specific bank.
    name = ' '.join(str(p.get('source_identity') or '').split()).casefold()
    if (name not in {' '.join(n.split()).casefold() for n in names}
            or p.get('event_type') != 'transfer_in' or p.get('status') != 'success'
            or p.get('source_wallet') != 'UNRESOLVED' or p.get('destination_wallet') not in wallets
            or set(p.get('validation_errors') or []) != {'unresolved_source'}):
        return None
    at = transaction_time(p)
    if at is None or now - at < 86400:
        return None  # Receipt arrival order is not identity; allow late collisions.
    matches = [(eid, q) for eid, q in events if q.get('event_type') == 'transfer_out'
               and q.get('status') == 'success' and q.get('eligible')
               and q.get('source_wallet') in wallets and compatible(p, q)]
    if len(matches) != 1:
        return None
    eid, q = matches[0]
    if p.get('reference') and q.get('reference') and p['reference'] != q['reference']:
        return None
    # Count ALL incoming receipts in the window, including other names/previously bound.
    candidates = [r for r in incoming if r.get('event_type') == 'transfer_in'
                  and r.get('status') == 'success' and compatible(r, q)]
    if len(candidates) != 1:
        return None
    # Missing/pending outgoings remain blockers; caller passes them alongside events.
    blockers = [r for _, r in events if r is not q and compatible(p, r)]
    if blockers:
        return None
    for r in (p, q):
        try:
            if now - datetime.fromisoformat(r['notification_at']).timestamp() < 86400:
                return None
        except (KeyError, ValueError, TypeError):
            return None
    return eid
