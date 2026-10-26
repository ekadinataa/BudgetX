"""Offline synthetic native Telegram tests. No Hermes or PTB install required."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import ModuleType, SimpleNamespace as NS
from typing import Any
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ADMIN = 790484718


def load():
    spec = importlib.util.spec_from_file_location('budgetx_test_plugin', HERE / '__init__.py')
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PluginTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.profile = self.root / 'profiles/devops-budgetx'
        self.profile.mkdir(parents=True)
        (self.profile / 'config.yaml').write_text('{}')
        self.config = self.root / 'private config.json'
        self.config.write_text('{}')
        self.backend = self.root / 'financial_review_admin.py'
        self.backend.write_text('# synthetic backend')
        self.python = self.root / '.venv/bin/python'
        self.python.parent.mkdir(parents=True)
        self.python.symlink_to(sys.executable)
        self.env = dict(BUDGETX_MESH_ROOT=str(self.root), BUDGETX_MESH_CONFIG=str(self.config),
                        BUDGETX_MESH_PYTHON=str(self.python), HERMES_HOME=str(self.profile))
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, self.env, clear=True).start()
        self.plugin = load()

    def payload(self, text='/bxreview'):
        return dict(profile_home=str(self.profile), actor=dict(platform='telegram', chat_id=str(ADMIN),
                    user_id=str(ADMIN), is_bot=False, chat_type='dm'), message_id='123', text=text,
                    bot_username='synthetic_bot')

    def test_trusted_profile_rejects_same_name_outside_profiles_directory(self):
        other = self.root / 'elsewhere/devops-budgetx'
        other.mkdir(parents=True)
        (other / 'config.yaml').write_text('{}')
        with patch.dict(os.environ, {'HERMES_HOME': str(other)}):
            with self.assertRaises(ValueError):
                self.plugin.trusted_profile()

    def test_portable_profile_is_accepted_by_canonical_backend_protocol(self):
        sys.path.insert(0, str(HERE.parent))
        try:
            import financial_review_admin
            financial_review_admin._validate_request(self.payload())
        finally:
            sys.path.remove(str(HERE.parent))

    def test_real_backend_review_subprocess_is_readonly_on_synthetic_config(self):
        sys.path.insert(0, str(HERE.parent))
        try:
            from test_mesh import config
            c = config(self.root)
        finally:
            sys.path.remove(str(HERE.parent))
        state = self.root / 'review-state.sqlite3'
        c.update(financial_review_enabled=True, financial_review_admin_chat_id=str(ADMIN),
                 financial_review_admin_user_ids=[str(ADMIN)], financial_review_state_path=str(state))
        self.config.write_text(json.dumps(c))
        self.config.chmod(0o600)
        env = dict(self.env, BUDGETX_MESH_ROOT=str(HERE.parent))
        with patch.dict(os.environ, env):
            result = self.plugin.run_backend(self.payload())
        self.assertTrue(result['ok'], result)
        self.assertIn('hanya baca', result['text'])
        self.assertFalse(state.exists(), 'review of missing queue must not initialize a store')
        self.assertFalse((self.root / 'state.sqlite3').exists())

    def test_backend_uses_trusted_environment_argv_and_stdin_not_shell(self):
        payload = self.payload('/bxreview; $(id) --config /untrusted')
        completed = subprocess.CompletedProcess([], 0, b'{"ok":true,"text":"Tersimpan"}')
        with patch.object(self.plugin.subprocess, 'run', return_value=completed) as run:
            self.assertTrue(self.plugin.run_backend(payload)['ok'])
        args, kwargs = run.call_args
        self.assertEqual(args[0], [str(self.python), str(self.backend), '--config', str(self.config)])
        self.assertFalse(kwargs['shell'])
        self.assertEqual(kwargs['cwd'], str(self.root))
        self.assertEqual(json.loads(kwargs['input']), payload)
        self.assertNotIn(payload['text'], args[0])
        self.assertEqual(kwargs['env']['HERMES_HOME'], str(self.profile))
        self.assertEqual(kwargs['stderr'], subprocess.DEVNULL)

    def test_invalid_configuration_fails_closed_without_subprocess(self):
        for key, value in [('HERMES_HOME', ''), ('HERMES_HOME', 'relative/devops-budgetx'),
                           ('HERMES_HOME', str(self.root / 'missing/devops-budgetx')),
                           ('HERMES_HOME', str(self.root)), ('BUDGETX_MESH_ROOT', 'relative'),
                           ('BUDGETX_MESH_CONFIG', 'config.json'), ('BUDGETX_MESH_PYTHON', 'python')]:
            with self.subTest(key=key, value=value), patch.dict(os.environ, {key: value}), \
                    patch.object(self.plugin.subprocess, 'run') as run:
                with self.assertRaises(ValueError):
                    self.plugin.run_backend(self.payload())
                run.assert_not_called()

    def test_request_cannot_select_profile_or_backend_paths(self):
        invalid = [dict(self.payload(), config='/other'), dict(self.payload(), profile_home='/other'),
                   dict(self.payload(), text='x' * 2049), dict(self.payload(), actor={'user_id': 'other'}),
                   dict(self.payload(), message_id='0')]
        for payload in invalid:
            with self.subTest(payload=payload), patch.object(self.plugin.subprocess, 'run') as run:
                with self.assertRaises(ValueError):
                    self.plugin.run_backend(payload)
                run.assert_not_called()

    def test_backend_output_is_validated(self):
        for code, output in [(2, b'private stderr'), (0, b'[]'), (0, b'{"ok":false,"text":"bad"}'),
                             (1, b'{"ok":true,"text":"bad"}'), (0, b'{"ok":true,"text":""}'),
                             (0, b'x' * 16385)]:
            with self.subTest(code=code), patch.object(self.plugin.subprocess, 'run',
                         return_value=subprocess.CompletedProcess([], code, output)):
                with self.assertRaises((ValueError, RuntimeError)):
                    self.plugin.run_backend(self.payload())

    def native(self):
        class Update:
            def __init__(self, message):
                self.message = self.effective_message = message
        class Stop(Exception):
            pass
        class Handler:
            def __init__(self, filter_, callback, block):
                self.callback, self.block = callback, block
        telegram = ModuleType('telegram')
        setattr(telegram, 'Update', Update)
        ext = ModuleType('telegram.ext')
        setattr(ext, 'ApplicationHandlerStop', Stop)
        setattr(ext, 'MessageHandler', Handler)
        setattr(ext, 'filters', NS(Regex=lambda value: value))
        patch.dict(sys.modules, {'telegram': telegram, 'telegram.ext': ext}).start()
        self._update_type, self._stop_type = Update, Stop
        return self.message_update()

    def message_update(self):
        message = NS(from_user=NS(id=ADMIN, is_bot=False), chat=NS(id=ADMIN, type='private'),
                     message_id=123, text='/bxreview', api_kwargs={})
        return self._update_type(message), self._stop_type

    def registered(self):
        factories, handlers = [], []
        adapter = NS(_hermes_profile_name='devops-budgetx', _owner_profile='devops-budgetx')
        native = NS(add_handler=lambda handler, group: handlers.append((handler, group)))
        self.home = self.profile
        patch.object(self.plugin, 'get_hermes_home', side_effect=lambda: self.home).start()
        self.plugin.register(NS(register_telegram_handler=factories.append))
        factories[0](native, adapter)
        self.assertEqual(handlers[0][1], -10000)
        self.assertTrue(handlers[0][0].block)
        return handlers[0][0].callback, adapter

    def test_native_command_intercepts_before_busy_session_and_stops_every_group(self):
        update, stop = self.native()
        callback, _ = self.registered()
        sent = []
        async def send(**kwargs):
            sent.append(kwargs)
        context = NS(bot=NS(username='synthetic_bot', send_message=send), busy=True)
        with patch.object(self.plugin, 'run_backend', return_value={'ok': True, 'text': 'Tersimpan'}) as run:
            with self.assertRaises(stop):
                asyncio.run(callback(update, context))
            self.assertEqual(run.call_args.args[0], self.payload())
        self.assertEqual(sent[0]['parse_mode'], None)
        self.assertEqual(sent[0]['chat_id'], ADMIN)

    def test_spoofed_forwarded_edited_non_native_and_cross_profile_commands_are_swallowed(self):
        update, stop = self.native()
        callback, adapter = self.registered()
        variants: list[Any] = [NS(**update.__dict__)]
        for attr, value in [('sender_chat', NS(id=ADMIN)), ('forward_origin', NS()),
                            ('via_bot', NS()), ('edit_date', 'yesterday'),
                            ('business_connection_id', 'x')]:
            bad, _ = self.message_update()
            setattr(bad.message, attr, value)
            variants.append(bad)
        for field, value in [('is_bot', True), ('id', True), ('id', ADMIN + 1)]:
            bad, _ = self.message_update()
            setattr(bad.message.from_user, field, value)
            variants.append(bad)
        for field, value in [('id', ADMIN + 1), ('id', True), ('type', 'group')]:
            bad, _ = self.message_update()
            setattr(bad.message.chat, field, value)
            variants.append(bad)
        for attr, value in [('edited_message', NS()), ('channel_post', NS()), ('business_message', NS())]:
            bad, _ = self.message_update()
            setattr(bad, attr, value)
            variants.append(bad)
        for mid in [0, True, -1, 10**20]:
            bad, _ = self.message_update()
            bad.message.message_id = mid
            variants.append(bad)
        bad, _ = self.message_update()
        bad.message.api_kwargs['forward_future_field'] = 'x'
        variants.append(bad)
        valid, stop = self.message_update()
        with patch.object(self.plugin, 'run_backend') as run:
            for bad in variants:
                with self.assertRaises(stop):
                    asyncio.run(callback(bad, NS()))
            self.home = self.root
            with self.assertRaises(stop):
                asyncio.run(callback(valid, NS()))
            self.home = self.profile
            adapter._owner_profile = 'other'
            with self.assertRaises(stop):
                asyncio.run(callback(valid, NS()))
            run.assert_not_called()

    def test_backend_failure_does_not_fall_through_to_llm_or_leak_details(self):
        update, stop = self.native()
        callback, _ = self.registered()
        sent = []
        async def send(**kwargs):
            sent.append(kwargs)
        with patch.object(self.plugin, 'run_backend', side_effect=ValueError('private failure detail')):
            with self.assertRaises(stop):
                asyncio.run(callback(update, NS(bot=NS(username='synthetic_bot', send_message=send))))
        self.assertNotIn('private failure detail', sent[0]['text'])


if __name__ == '__main__':
    unittest.main()
