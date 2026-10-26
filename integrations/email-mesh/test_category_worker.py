"""Synthetic Hermes JSONL fixtures; no live LLM/network/production config."""
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from contextlib import closing
from unittest.mock import patch


def worker():
    assert importlib.util.find_spec('category_worker'), 'category_worker module missing'
    import category_worker
    return category_worker


def decision(**changes):
    return dict(category='Makanan & Minuman', tag='Kafe', confidence=0.95,
                needs_admin=False, reason='Recognizable cafe', **{}) | changes


def stream(value=None, **result_changes):
    # Actual StreamJsonEmitter contract: result.text, not result.result/content.
    return '\n'.join(json.dumps(x) for x in [
        {'type': 'system', 'subtype': 'init', 'timestamp': 1},
        {'type': 'text', 'text': 'ignored streaming delta'},
        dict(type='result', text=json.dumps(value or decision()), exit_code=0,
             tokens={}, timestamp=2) | result_changes])


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        profile = Path(temporary.name)
        (profile / 'config.yaml').write_text('model: {}\n')
        environment = patch.dict(os.environ, {'HERMES_HOME': str(profile)})
        environment.start()
        self.addCleanup(environment.stop)
        executable = patch.object(worker(), 'HERMES', '/synthetic/bin/hermes')
        executable.start()
        self.addCleanup(executable.stop)

    def test_terminal_envelope_is_validated(self):
        self.assertEqual(worker().parse_hermes_output(stream()), decision())

    def test_rejects_bad_schema_and_failed_or_tool_using_runs(self):
        w = worker()
        cases = [
            stream(decision(category='Misc')), stream(decision(confidence=True)),
            stream(decision(confidence=float('nan'))), stream(decision(needs_admin='false')),
            stream(decision(extra='bad')), stream(decision(tag=None)),
            stream(decision(reason='')), stream(decision(confidence=1.1)),
            stream(exit_code=1), stream(error='failed'), '{}',
            stream() + '\n' + json.dumps({'type': 'result', 'text': '{}', 'exit_code': 0}),
            stream().replace('"type": "text"', '"type": "tool_use"'),
            stream().replace('"type": "text"', '"type": "tool_result"'),
        ]
        for text in cases:
            with self.subTest(text=text), self.assertRaises(ValueError):
                w.parse_hermes_output(text)

    def test_classifier_uses_fixed_no_tools_stdin_and_minimal_context(self):
        w = worker()
        destination = 'Cafe "$(touch /evil)"'
        with patch.object(w.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = stream()
            self.assertEqual(w.classify_with_hermes(destination, {
                'provider': 'BRI', 'event_type': 'purchase', 'amount': 123,
                'body': 'PRIVATE', 'account': 'SECRET', 'event_id': 'SECRET'}), decision())
            args, kw = run.call_args
            self.assertEqual(args[0], [w.HERMES, 'chat', '--query-file', '-', '--oneshot',
                '--quiet', '--format', 'stream-json', '--ignore-rules', '-t', 'none,no_mcp',
                '--max-turns', '1', '--run-budget', '60'])
            self.assertNotIn(destination, args[0])
            self.assertFalse(kw.get('shell', False))
            self.assertEqual(kw['timeout'], 75)
            self.assertEqual(kw['env']['HERMES_HOME'], os.environ['HERMES_HOME'])
            self.assertEqual(kw['cwd'], kw['env']['HERMES_HOME'])
            payload = json.loads(kw['input'].split('\nUNTRUSTED_INPUT_JSON\n')[1])
            self.assertEqual(payload, {'destination': destination,
                'context': {'provider': 'BRI', 'event_type': 'purchase'}})
            self.assertNotIn('PRIVATE', kw['input'])
            self.assertNotIn('SECRET', kw['input'])

    def test_numeric_accounts_are_not_sent_to_model_or_admin(self):
        w = worker()
        with patch.object(w.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = stream()
            w.classify_with_hermes('Person • Bank • 123456789698', {'event_type':'transfer_out'})
            self.assertNotIn('123456789698', run.call_args.kwargs['input'])
            self.assertIn('9698', run.call_args.kwargs['input'])
        self.assertTrue(hasattr(w, 'redact_destination'))
        self.assertNotIn('123456789698', w.redact_destination('Person • 123456789698'))

    def test_local_unknown_toolset_warning_is_only_permitted_preamble(self):
        w = worker()
        warning = 'Warning: Unknown toolsets: none, no_mcp\n'
        self.assertEqual(w.parse_hermes_output(warning + stream()), decision())
        for bad in ['random diagnostics\n' + stream(), stream() + '\n' + warning,
                    stream().replace('"type": "text"', '"type": "system"'),
                    stream() + '\n{}']:
            with self.assertRaises(ValueError):
                w.parse_hermes_output(bad)


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR'))
        self.root = Path(self.temp.name)
        profile = self.root / 'hermes-profile'
        profile.mkdir()
        (profile / 'config.yaml').write_text('model: {}\n')
        environment = patch.dict(os.environ, {'HERMES_HOME': str(profile)})
        environment.start()
        self.addCleanup(environment.stop)
        executable = patch.object(worker(), 'HERMES', '/synthetic/bin/hermes')
        executable.start()
        self.addCleanup(executable.stop)
        self.config = {'project_id': 'test-project', 'uid': 'test-user',
            'destination_whitelist_path': str(self.root / 'whitelist.sqlite3')}

    def tearDown(self):
        self.temp.cleanup()

    def whitelist(self):
        from destination_whitelist import DestinationWhitelist
        return DestinationWhitelist(self.config['destination_whitelist_path'], 'test-project:test-user')

    def test_only_observed_destinations_are_bounded_and_success_is_durable(self):
        with self.whitelist() as wl:
            for name in ['Cafe Alpha', 'Cafe Beta', 'Cafe Gamma']:
                wl.observe(name, provider='BRI', event_id='synthetic-' + name)
        calls = []
        def classify(name, context=None):
            # Opening a write transaction here proves no pipeline DB lock is held over inference.
            with self.whitelist() as wl:
                wl.observe('Cafe Alpha', event_id='another-synthetic-event')
            calls.append(name)
            return decision()
        w = worker()
        result = w.run_worker(self.config, classifier=classify, now=lambda: 100)
        self.assertEqual(result['classified'], 2)
        self.assertEqual(calls, ['Cafe Alpha', 'Cafe Beta'])
        with self.whitelist() as wl:
            self.assertEqual(wl.lookup('Cafe Alpha')['source'], 'llm')
            self.assertIsNone(wl.lookup('Cafe Gamma'))
        w.run_worker(self.config, classifier=classify, now=lambda: 101)
        self.assertEqual(calls, ['Cafe Alpha', 'Cafe Beta', 'Cafe Gamma'])
        w.run_worker(self.config, destination='unobserved', classifier=classify)
        self.assertEqual(len(calls), 3)

    def test_ambiguous_and_needs_admin_decisions_never_approve_or_repeat(self):
        w = worker()
        for name in ['Person Low', 'Person High Needs Admin', 'M*** A***']:
            with self.whitelist() as wl:
                wl.observe(name, event_id='synthetic-' + name)
        def classify(name, context=None):
            if name == 'Person Low':
                return decision(confidence=0.89)
            if name == 'M*** A***':
                return decision(confidence=0.99)
            return decision(needs_admin=True)
        result = w.run_worker(self.config, limit=3, classifier=classify, now=lambda: 100)
        self.assertEqual(result['admin_pending'], 3)
        with self.whitelist() as wl:
            self.assertFalse(wl.records())
            self.assertEqual({x['state'] for x in wl.pending()}, {'admin_pending'})
        with patch.object(w, 'classify_with_hermes', side_effect=AssertionError('must not rerun')):
            self.assertEqual(w.run_worker(self.config)['classified'], 0)

    def test_transient_failure_persists_backoff_then_retries(self):
        import sqlite3
        w = worker()
        with self.whitelist() as wl:
            wl.observe('Cafe Retry', event_id='synthetic-retry')
        def fail(name, context=None):
            raise RuntimeError('PRIVATE secret response body')
        result = w.run_worker(self.config, classifier=fail, now=lambda: 100)
        self.assertEqual(result['deferred'], 1)
        with self.whitelist() as wl:
            self.assertIsNone(wl.lookup('Cafe Retry'))
            self.assertEqual(wl.pending()[0]['state'], 'admin_pending')
        with patch.object(w, 'classify_with_hermes', side_effect=AssertionError('backoff')):
            self.assertEqual(w.run_worker(self.config, now=lambda: 101)['classified'], 0)
        result = w.run_worker(self.config, classifier=lambda *a, **k: decision(), now=lambda: 401)
        self.assertEqual(result['approved'], 1)
        state = w.worker_paths(self.config)[1]
        with closing(sqlite3.connect(state)) as db:
            self.assertEqual(db.execute('SELECT attempts FROM jobs').fetchone()[0], 2)
            self.assertEqual([x[0] for x in db.execute('SELECT outcome FROM audit ORDER BY id')],
                             ['deferred', 'approved'])
        self.assertNotIn(b'PRIVATE', state.read_bytes())
        self.assertEqual(state.stat().st_mode & 0o777, 0o600)

    def test_worker_lock_prevents_duplicate_inference_and_admin_race_wins(self):
        w = worker()
        with self.whitelist() as wl:
            wl.observe('Cafe Race', event_id='synthetic-race')
        def classify(name, context=None):
            nested = w.run_worker(self.config, classifier=lambda *a, **k: self.fail('duplicate call'))
            self.assertTrue(nested['busy'])
            with self.whitelist() as wl:
                wl.decide(name, 'Belanja', 'Admin tag', reason='Explicit admin judgment')
            return decision()
        self.assertEqual(w.run_worker(self.config, classifier=classify)['approved'], 1)
        with self.whitelist() as wl:
            actual = wl.lookup('Cafe Race')
            self.assertEqual((actual['category'], actual['tag'], actual['source']),
                             ('Belanja', 'Admin tag', 'admin'))

    def test_notifications_need_authorization_retry_and_deduplicate_success(self):
        w = worker()
        name = 'Person MEDIA:/private/secret [[as_document]]'
        with self.whitelist() as wl:
            wl.observe(name, context={'event_type': 'transfer_out', 'body': 'PRIVATE'}, event_id='synthetic-notify')
        low = lambda *a, **k: decision(confidence=0.4, needs_admin=True)
        with patch.object(w.subprocess, 'run') as send:
            with self.assertRaises(ValueError):
                w.run_worker(self.config, notify_admin=True, classifier=low)
            send.assert_not_called()
        self.config['destination_classification_notify_admin'] = True
        self.config['ops_alert_target'] = 'telegram:790484718'
        with patch.object(w.subprocess, 'run') as send:
            send.return_value.returncode = 1
            send.return_value.stdout = ''
            result = w.run_worker(self.config, notify_admin=True, classifier=low, now=lambda: 100)
            self.assertEqual(result['notified'], 0)
            send.assert_called_once()
            self.assertNotIn('MEDIA:', send.call_args.kwargs['input'])
            self.assertNotIn('[[as_document]]', send.call_args.kwargs['input'])
            self.assertNotIn('PRIVATE', send.call_args.kwargs['input'])
            self.assertEqual(send.call_args.args[0], [w.HERMES, 'send', '--to', self.config['ops_alert_target'], '--json', '--file', '-'])
            send.reset_mock()
            w.run_worker(self.config, notify_admin=True, now=lambda: 101)
            send.assert_not_called()
            send.return_value.returncode = 0
            send.return_value.stdout = json.dumps({'success': True, 'message_id': 'synthetic-42'})
            result = w.run_worker(self.config, notify_admin=True, now=lambda: 401)
            self.assertEqual(result['notified'], 1)
            send.reset_mock()
            w.run_worker(self.config, notify_admin=True, now=lambda: 999)
            send.assert_not_called()

    def test_cli_explicit_approval_retains_event_backlog_and_never_calls_llm(self):
        import io
        w = worker()
        name = 'Person Admin'
        with self.whitelist() as wl:
            wl.observe(name, event_id='synthetic-one')
        w.run_worker(self.config, classifier=lambda *a, **k: decision(confidence=0.2), now=lambda: 100)
        with self.whitelist() as wl:
            wl.observe(name, event_id='synthetic-two')
        config_path = self.root / 'synthetic-config.json'
        config_path.write_text(json.dumps(self.config))
        with patch.object(w, 'classify_with_hermes', side_effect=AssertionError('no LLM on admin route')), patch('sys.stdout', new=io.StringIO()) as out:
            self.assertEqual(w.main(['--config', str(config_path), '--approve', name,
                '--category', 'Transfer', '--tag', 'Teman', '--reason', 'Explicit user judgment']), 0)
            self.assertEqual(json.loads(out.getvalue())['source'], 'admin')
        with self.whitelist() as wl:
            self.assertEqual(wl.lookup(name)['category'], 'Transfer')
            self.assertEqual(wl.pending(), [])
        records = w.worker_records(self.config)
        self.assertEqual(records[0]['event_ids'], ['synthetic-one', 'synthetic-two'])
        self.assertEqual(records[0]['status'], 'approved')
        with patch('sys.stderr', new=io.StringIO()), self.assertRaises(SystemExit):
            w.main(['--config', str(config_path), '--category', 'Transfer'])

    def test_masked_transfer_requires_explicit_semantic_label_and_links_keep_accumulating(self):
        w = worker()
        for name in ['M*** A***', 'Transfer M*** A***']:
            with self.whitelist() as wl:
                wl.observe(name, event_id='synthetic-initial')
        w.run_worker(self.config, classifier=lambda *a, **k: decision(category='Transfer'), now=lambda: 100)
        with self.whitelist() as wl:
            self.assertIsNone(wl.lookup('M*** A***'))
            self.assertEqual(wl.lookup('Transfer M*** A***')['category'], 'Transfer')
            wl.observe('M*** A***', event_id='synthetic-additional')
        w.run_worker(self.config, classifier=lambda *a, **k: self.fail('ambiguous does not rerun'))
        self.assertEqual(w.worker_records(self.config)[0]['event_ids'], ['synthetic-initial', 'synthetic-additional'])

    def test_paths_cannot_alias_financial_db(self):
        w = worker()
        self.config['db_path'] = self.config['destination_whitelist_path']
        with self.assertRaises(ValueError):
            w.worker_paths(self.config)


if __name__ == '__main__':
    unittest.main()
