"""Synthetic reconciliation checks; no production writes."""
import tempfile
import unittest
from pathlib import Path
from mesh import Engine
from test_mesh import config, parsed, row
try:
    from reconciliation import match_incoming
except ImportError:
    match_incoming = None

NAME = 'Pemilik Rekening Sintetis'
NOW = 1791421200


def incoming(name=NAME, **kw):
    return parsed(event_type='transfer_in', source_wallet='UNRESOLVED', source_identity=name,
                  destination_wallet='jago', destination_identity='owned-jago', eligible=False,
                  validation_errors=['unresolved_source'], reference=None,
                  notification_at='2026-10-07T00:30:00+00:00',
                  body_transaction_at='07 Oktober 2026, 07.30', **kw)


def outgoing(**kw):
    return parsed(**dict({'event_type': 'transfer_out', 'body_transaction_at': '7 Okt 2026, 07:30 WIB'}, **kw))


class ReconcileTests(unittest.TestCase):
    def test_unique_owner_receipt_matches_after_grace(self):
        self.assertIsNotNone(match_incoming, 'reconciliation missing')
        p = incoming()
        self.assertEqual(match_incoming(p, [('one', outgoing())], [p], [NAME], {'bri': {}, 'jago': {}}, NOW), 'one')
        self.assertIsNone(match_incoming(p, [('one', outgoing())], [p], [NAME], {'bri': {}, 'jago': {}}, 1791333060))

    def test_two_same_amount_incoming_or_outgoing_are_ambiguous(self):
        p = incoming()
        args = ([NAME], {'bri': {}, 'jago': {}}, NOW)
        self.assertIsNone(match_incoming(p, [('one', outgoing())], [p, incoming('Someone else')], *args))
        self.assertIsNone(match_incoming(p, [('one', outgoing()), ('two', outgoing())], [p], *args))

    def test_conflicting_identity_reference_amount_or_unknown_time_blocks(self):
        p = incoming()
        args = ([p], [NAME], {'bri': {}, 'jago': {}}, NOW)
        for out in [outgoing(destination_wallet='bri'), outgoing(amount=99999, total_credit=99999),
                    outgoing(status='pending'), outgoing(source_wallet='EXTERNAL'),
                    outgoing(body_transaction_at='unknown')]:
            self.assertIsNone(match_incoming(p, [('one', out)], *args))
        other = incoming('Other name')
        self.assertIsNone(match_incoming(other, [('one', outgoing())], [other], [NAME], {'bri': {}, 'jago': {}}, NOW))
        numbered = incoming(NAME + ' • 12345678')
        self.assertIsNone(match_incoming(numbered, [('one', outgoing())], [numbered], [NAME], {'bri': {}, 'jago': {}}, NOW))
        conflict = dict(p, reference='OTHER')
        self.assertIsNone(match_incoming(conflict, [('one', outgoing(reference='SIM-1'))], [conflict], [NAME], {'bri': {}, 'jago': {}}, NOW))

    def test_binding_only_preserves_existing_effects_restart_and_scope(self):
        with tempfile.TemporaryDirectory() as d:
            c = config(Path(d))
            c['owner_names'] = [NAME]
            incoming_row = row('in')
            incoming_row['provider'] = 'JAGO'
            with Engine(c, parser=lambda r, _: incoming() if r['gmail_message_id']=='in' else outgoing()) as e:
                e.ingest([row('out'), incoming_row])
                before = [tuple(r) for r in e.db.execute('SELECT * FROM movements')]
                old_events = e.status()['events']
                e.reconcile_incoming(now=NOW)
                r = e.db.execute("SELECT reason,event_id FROM candidates WHERE message='in'").fetchone()
                self.assertEqual(r['reason'], 'ready')
                self.assertIsNotNone(r['event_id'])
                self.assertEqual(e.status()['events'], old_events)
                self.assertEqual([tuple(r) for r in e.db.execute('SELECT * FROM movements')], before)
            with Engine(c) as e:
                e.reconcile_incoming(now=NOW)
                self.assertEqual(e.db.execute('SELECT count(*) FROM event_evidence').fetchone()[0], 2)
                self.assertEqual(e.status()['events'], 1)
                self.assertEqual(e.status()['movements'], 2)

if __name__ == '__main__':
    unittest.main()
