"""Hermetic portability regressions; never inspect the installed profile/state."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location('portable_' + name, HERE / (name + '.py'))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PortabilityTests(unittest.TestCase):
    def test_generator_has_no_build_host_paths_and_shell_quotes_trusted_root(self):
        builder = load('build_workflows')
        for action, workflow in builder.build_workflows().items():
            command = next(n for n in workflow['nodes'] if n['type'].endswith('.executeCommand'))['parameters']['command']
            self.assertNotIn(str(HERE), command)
            self.assertIn('BUDGETX_MESH_ROOT', command)
            prefix, _ = json.JSONDecoder().raw_decode(command[4:])
            with tempfile.TemporaryDirectory(prefix='mesh root ; literal-') as directory:
                root = Path(directory)
                (root / '.venv/bin').mkdir(parents=True)
                (root / 'n8n').mkdir()
                (root / '.venv/bin/python').symlink_to(sys.executable)
                (root / 'n8n/adapter.py').write_text('import json,sys; print(json.dumps(sys.argv[1:]))')
                result = subprocess.run(prefix + 'preview', shell=True, capture_output=True, text=True,
                                        env=dict(os.environ, BUDGETX_MESH_ROOT=str(root)))
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout), [action, '--mode', 'preview'])
            for invalid in ['', 'relative/path']:
                result = subprocess.run(prefix + 'preview', shell=True, capture_output=True, text=True,
                                        env=dict(os.environ, BUDGETX_MESH_ROOT=invalid))
                self.assertNotEqual(result.returncode, 0)

    def test_runtime_paths_are_explicit_and_resolved_at_call_time(self):
        adapter = load('adapter')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile = root / 'devops-budgetx'
            profile.mkdir()
            (profile / 'config.yaml').write_text('{}')
            config = root / 'private config.json'
            config.write_text(json.dumps({'project_id': 'budgetku-app-v1', 'uid': 'VCqdnx9zvJVrZQSNp6gyGm6Zzhr2'}))
            env = dict(BUDGETX_MESH_ROOT=str(root), BUDGETX_MESH_CONFIG=str(config), HERMES_HOME=str(profile))
            calls = []
            def run(command, **kwargs):
                calls.append((command, kwargs))
                return subprocess.CompletedProcess(command, 0, '{"code":0}', '')
            with patch.dict(os.environ, env, clear=True):
                paths = adapter.runtime_paths(require_profile=True)
                self.assertEqual(paths, (root, config, profile))
                with patch.object(adapter, 'legacy_is_active', return_value=False):
                    self.assertEqual(adapter.dispatch('pipeline', 'live', runner=run)['error'], 'LiveExecutionNotArmed')
                    os.environ['BUDGETX_N8N_ALLOW_LIVE'] = '1'
                    self.assertTrue(adapter.dispatch('pipeline', 'live', runner=run)['executed'])
            self.assertEqual(calls[0][0][0], sys.executable)
            self.assertEqual(calls[0][0][1:], [str(root / 'ops.py'), '--config', str(config), 'run'])
            self.assertEqual(calls[0][1]['env']['HERMES_HOME'], str(profile))
            self.assertIs(calls[0][1]['shell'], False)
            with patch.dict(os.environ, {'XDG_CONFIG_HOME': str(root)}, clear=True):
                self.assertEqual(adapter.runtime_paths()[1], root / 'budgetx-email-mesh/config.json')
                with self.assertRaises(ValueError):
                    adapter.runtime_paths(require_profile=True)

    def test_root_defaults_to_adapter_parent_without_inherited_profile(self):
        adapter = load('adapter')
        with patch.dict(os.environ, {}, clear=True):
            root, _, profile = adapter.runtime_paths()
        self.assertEqual(root, HERE.parent)
        self.assertIsNone(profile)

    def test_preview_never_resolves_paths_or_reads_state(self):
        adapter = load('adapter')
        with patch.object(adapter, 'runtime_paths', side_effect=AssertionError('state access')):
            for action in adapter.STAGES:
                self.assertTrue(adapter.dispatch(action)['ok'])


if __name__ == '__main__':
    unittest.main()
