"""Offline regressions for Gmail messages disappearing after history enumeration."""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import mesh
from test_mesh import FakeGmail, NOW, Request, config, parsed


class GmailFailure(Exception):
    def __init__(self, status):
        super().__init__('synthetic Gmail failure')
        self.resp = SimpleNamespace(status=status)


class FetchGmail(FakeGmail):
    def __init__(self, failed_format='metadata', status=404):
        super().__init__()
        self.failed_format = failed_format
        self.failure = GmailFailure(status)
        self.pages = {'': {'history': [{'messagesAdded': [
            {'message': {'id': 'a-missing'}}, {'message': {'id': 'new'}},
        ]}], 'historyId': '13'}}

    def get(self, **kwargs):
        self.calls.append(('get', kwargs))
        if kwargs['id'] == 'a-missing' and kwargs['format'] == self.failed_format:
            return Request(self.failure)
        return Request({
            'id': kwargs['id'], 'labelIds': ['label-trx'],
            'internalDate': '1791333000000',
            'payload': {'headers': [
                {'name': 'From', 'value': 'bri@example.invalid'},
                {'name': 'Date', 'value': 'Wed, 07 Oct 2026 07:30:00 +0700'},
            ], 'mimeType': 'text/plain', 'body': {'data': 'U3ludGhldGlj'}},
        })


class MissingMessageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cfg = config(Path(self.tmp.name))

    def engine(self):
        return mesh.Engine(self.cfg, parser=lambda *_: parsed(), now=lambda: NOW)

    def test_metadata_404_is_audited_without_blocking_next_message(self):
        gmail = FetchGmail()
        with self.engine() as engine:
            engine.bootstrap(gmail)
            checkpoint = tuple(engine.db.execute('SELECT * FROM checkpoints').fetchone())
            try:
                engine.run(gmail)
            except GmailFailure:
                self.fail('A missing message must not block the next available message')
            status = engine.status()
            self.assertEqual(status['mailbox']['cursor'], '13')
            self.assertEqual(status['evidence'], 1)
            self.assertEqual(status['events'], 1)
            self.assertEqual(status['outbox_pending'], 1)
            audit = engine.db.execute('SELECT status,detail FROM job_runs').fetchone()
            self.assertEqual(audit['status'], 'success')
            self.assertEqual(json.loads(audit['detail']), {
                'fetched': 1, 'delta_ids': 2,
                'unavailable_messages': [{'message': 'a-missing', 'stage': 'metadata'}],
            })
            self.assertEqual(tuple(engine.db.execute('SELECT * FROM checkpoints').fetchone()), checkpoint)
            self.assertIsNone(engine.db.execute("SELECT 1 FROM evidence WHERE message='a-missing'").fetchone())
            self.assertIsNone(engine.db.execute("SELECT 1 FROM candidates WHERE message='a-missing'").fetchone())

    def test_full_404_after_metadata_is_audited_and_restart_keeps_dedup(self):
        gmail = FetchGmail(failed_format='full')
        with self.engine() as engine:
            engine.bootstrap(gmail)
            try:
                engine.run(gmail)
            except GmailFailure:
                self.fail('A message disappearing after metadata must not block delta')
            detail = json.loads(engine.db.execute('SELECT detail FROM job_runs').fetchone()[0])
            self.assertEqual(detail['unavailable_messages'], [{'message': 'a-missing', 'stage': 'full'}])
            self.assertEqual(detail['fetched'], 1)
            self.assertEqual(engine.status()['mailbox']['cursor'], '13')
            self.assertEqual(engine.status()['events'], 1)
        gmail.pages = {'': {'history': [{'messagesAdded': [{'message': {'id': 'new'}}]}], 'historyId': '14'}}
        gmail.calls.clear()
        with self.engine() as engine:
            engine.run(gmail)
            self.assertEqual(engine.status()['mailbox']['cursor'], '14')
            self.assertEqual(engine.status()['evidence'], 1)
            self.assertEqual(engine.status()['events'], 1)
            self.assertEqual(engine.status()['outbox_pending'], 1)
            self.assertFalse(any(kind == 'get' for kind, _ in gmail.calls))
            audits = [json.loads(r[0]) for r in engine.db.execute('SELECT detail FROM job_runs ORDER BY id')]
            self.assertEqual(audits[0]['unavailable_messages'], [{'message': 'a-missing', 'stage': 'full'}])
            self.assertEqual(audits[1]['unavailable_messages'], [])

    def test_non_404_message_failures_preserve_cursor_and_all_evidence(self):
        for stage in ('metadata', 'full'):
            for code in (400, 401, 403, 429, 500, 503):
                with self.subTest(stage=stage, code=code):
                    self.cfg['db_path'] = str(Path(self.tmp.name) / f'{stage}-{code}.sqlite3')
                    gmail = FetchGmail(failed_format=stage, status=code)
                    # One healthy row is fetched before the failure: no partial commit.
                    gmail.pages['']['history'][0]['messagesAdded'] = [
                        {'message': {'id': '0-good'}}, {'message': {'id': 'a-missing'}},
                    ]
                    with self.engine() as engine:
                        engine.bootstrap(gmail)
                        before = engine.status()
                        with self.assertRaises(GmailFailure) as raised:
                            engine.run(gmail)
                        self.assertIs(raised.exception, gmail.failure)
                        self.assertEqual(engine.status(), before)
                        self.assertEqual(engine.db.execute('SELECT status FROM job_runs').fetchone()[0], 'failed')

    def test_message_timeout_is_not_treated_as_unavailable(self):
        gmail = FetchGmail()
        gmail.failure = TimeoutError('synthetic timeout')
        with self.engine() as engine:
            engine.bootstrap(gmail)
            before = engine.status()
            with self.assertRaises(TimeoutError):
                engine.run(gmail)
            self.assertEqual(engine.status(), before)

    def test_all_unavailable_messages_advance_cursor_without_financial_records(self):
        gmail = FetchGmail()
        gmail.pages['']['history'][0]['messagesAdded'] = [
            {'message': {'id': 'a-missing'}}, {'message': {'id': 'a-missing'}},
        ]
        with self.engine() as engine:
            engine.bootstrap(gmail)
            engine.run(gmail)
            status = engine.status()
            self.assertEqual(status['mailbox']['cursor'], '13')
            for key in ('events', 'movements', 'evidence', 'candidates', 'outbox_pending'):
                self.assertEqual(status[key], 0)
            detail = json.loads(engine.db.execute('SELECT detail FROM job_runs').fetchone()[0])
            self.assertEqual(detail['fetched'], 0)
            self.assertEqual(detail['delta_ids'], 1)
            self.assertEqual(detail['unavailable_messages'], [{'message': 'a-missing', 'stage': 'metadata'}])

    def test_error_after_missing_message_does_not_commit_partial_progress(self):
        class LaterFailureGmail(FetchGmail):
            def get(self, **kwargs):
                if kwargs['id'] == 'new':
                    return Request(GmailFailure(503))
                return super().get(**kwargs)
        gmail = LaterFailureGmail()
        with self.engine() as engine:
            engine.bootstrap(gmail)
            before = engine.status()
            with self.assertRaises(GmailFailure):
                engine.run(gmail)
            self.assertEqual(engine.status(), before)

    def test_label_404_is_not_treated_as_missing_message(self):
        class MissingLabelGmail(FetchGmail):
            def labels(self):
                return self

            def list(self, **kwargs):
                if 'startHistoryId' in kwargs:
                    return super().list(**kwargs)
                return Request(GmailFailure(404))
        gmail = MissingLabelGmail()
        with self.engine() as engine:
            engine.bootstrap(gmail)
            before = engine.status()
            with self.assertRaises(GmailFailure):
                engine.run(gmail)
            self.assertEqual(engine.status(), before)

    def test_attachment_404_preserves_cursor_for_incomplete_mime(self):
        class MissingAttachmentGmail(FetchGmail):
            def __init__(self):
                super().__init__()
                self.pages = {'': {'history': [{'messagesAdded': [{'message': {'id': 'new'}}]}], 'historyId': '13'}}

            def get(self, **kwargs):
                request = super().get(**kwargs)
                if kwargs['format'] == 'full':
                    request.value['payload']['body'] = {'attachmentId': 'synthetic-body'}
                return request

            def attachments(self):
                class Attachments:
                    def get(self, **kwargs):
                        return Request(GmailFailure(404))
                return Attachments()
        gmail = MissingAttachmentGmail()
        with self.engine() as engine:
            engine.bootstrap(gmail)
            before = engine.status()
            with self.assertRaisesRegex(ValueError, 'MIME extraction failed'):
                engine.run(gmail)
            self.assertEqual(engine.status(), before)

    def test_cli_keeps_missing_message_ids_out_of_output(self):
        import contextlib
        import io
        from unittest.mock import patch
        gmail = FetchGmail()
        path = Path(self.tmp.name) / 'config.json'
        path.write_text(json.dumps(self.cfg))
        path.chmod(0o600)
        with self.engine() as engine:
            engine.bootstrap(gmail)
        output = io.StringIO()
        with patch('mesh.build_gmail', return_value=gmail), patch('mesh.FirestorePublisher') as publisher, contextlib.redirect_stdout(output):
            code = mesh.main(['--config', str(path), '--no-publish', 'run'])
        self.assertEqual(code, 0)
        publisher.assert_not_called()
        self.assertNotIn('a-missing', output.getvalue())
        self.assertNotIn('unavailable_messages', output.getvalue())
        self.assertEqual(json.loads(output.getvalue())['mailbox']['cursor'], '13')

    def test_sqlite_write_failure_rolls_back_evidence_cursor_and_success_audit(self):
        import sqlite3
        gmail = FetchGmail()
        with self.engine() as engine:
            engine.bootstrap(gmail)
            before = engine.status()
            engine.db.executescript("""
                CREATE TRIGGER fail_success_audit BEFORE UPDATE OF status ON job_runs
                WHEN NEW.status='success'
                BEGIN SELECT RAISE(ABORT, 'synthetic audit write failure'); END;
            """)
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'synthetic audit write failure'):
                engine.run(gmail)
            self.assertEqual(engine.status(), before)
            self.assertEqual(engine.db.execute('SELECT status FROM job_runs').fetchone()[0], 'failed')
            engine.db.execute('DROP TRIGGER fail_success_audit')
            engine.run(gmail)
            self.assertEqual(engine.status()['mailbox']['cursor'], '13')
            self.assertEqual(engine.status()['evidence'], 1)
            self.assertEqual(engine.status()['events'], 1)
            detail = json.loads(engine.db.execute("SELECT detail FROM job_runs WHERE status='success'").fetchone()[0])
            self.assertEqual(detail['unavailable_messages'], [{'message': 'a-missing', 'stage': 'metadata'}])


if __name__ == '__main__':
    unittest.main()
