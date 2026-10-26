"""Ordinary collector must not publish receipt-review-owned canonical events."""
from pathlib import Path
import tempfile
import unittest

import mesh
from test_mesh import config, parsed, row


class ReviewDrainTests(unittest.TestCase):
    def test_normal_drain_defers_review_owned_event_even_with_force(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = config(Path(tmp))
            def parser(raw, registry):
                if raw['gmail_message_id'] == 'review':
                    return parsed(financial_review={'review_id': 'synthetic', 'version': 'synthetic'})
                return parsed(reference='SIM-ORDINARY', notification_at='2026-10-07T00:45:00+00:00')
            with mesh.Engine(cfg, parser=parser) as engine:
                with engine.db:
                    engine._ingest(row('review'))
                    engine._ingest(row('ordinary'))
                ids = {r['message']: r['event_id'] for r in engine.db.execute('SELECT message,event_id FROM candidates')}
                calls = []
                class Publisher:
                    def apply(self, payload):
                        calls.append(payload['event_id'])
                engine.drain(Publisher())
                self.assertEqual(calls, [ids['ordinary']])
                self.assertEqual(engine.db.execute('SELECT state FROM outbox WHERE event_id=?', (ids['review'],)).fetchone()[0], 'pending')
                engine.drain(Publisher(), force=True)
                self.assertEqual(calls, [ids['ordinary']])


if __name__ == '__main__':
    unittest.main()
