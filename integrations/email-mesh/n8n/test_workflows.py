"""Validate the complete, inactive n8n package without live integrations."""
import importlib.util
import json
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent


class WorkflowTests(unittest.TestCase):
    def test_complete_workflow_package_is_inactive_safe_and_connected(self):
        path = HERE / 'build_workflows.py'
        self.assertTrue(path.exists(), 'workflow generator has not been implemented')
        spec = importlib.util.spec_from_file_location('builder', path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        workflows = module.build_workflows()
        expected = {'pipeline','watchdog','backup','classification','review','status','verify-backup'}
        self.assertEqual(set(workflows), expected)
        self.assertEqual(len({w['id'] for w in workflows.values()}), len(expected))
        self.assertEqual(workflows, module.build_workflows(), 'workflow IDs must be reproducible')
        for action, workflow in workflows.items():
            with self.subTest(action=action):
                self.assertIs(workflow['active'], False)
                self.assertEqual(workflow['settings']['timezone'], 'Asia/Jakarta')
                nodes = {n['name']: n for n in workflow['nodes']}
                types = [n['type'] for n in nodes.values()]
                self.assertIn('n8n-nodes-base.manualTrigger', types)
                self.assertIn('n8n-nodes-base.executeCommand', types)
                self.assertIn('n8n-nodes-base.stopAndError', types)
                self.assertEqual(types.count('n8n-nodes-base.scheduleTrigger'), int(action in {'pipeline','watchdog'}))
                config = next(n for n in nodes.values() if n['name']=='Safety Mode')
                mode = json.loads(config['parameters']['jsonOutput'])['mode']
                self.assertEqual(mode, 'preview')
                self.assertFalse(any(n.get('credentials') for n in nodes.values()))
                for source, connections in workflow['connections'].items():
                    self.assertIn(source, nodes)
                    for outputs in connections.values():
                        for output in outputs:
                            for connection in output:
                                self.assertIn(connection['node'], nodes)
                command = next(n for n in nodes.values() if n['type']=='n8n-nodes-base.executeCommand')['parameters']['command']
                self.assertIn('adapter.py', command)
                self.assertIn(' --mode ', command)
                self.assertNotIn(' --apply', command)
                self.assertNotIn('reset_checkpoint', json.dumps(workflow))
                self.assertNotIn('private_key', json.dumps(workflow))

    def test_checked_in_exports_match_generator_without_host_or_execution_metadata(self):
        spec = importlib.util.spec_from_file_location('builder', HERE / 'build_workflows.py')
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        workflows = module.build_workflows()
        self.assertTrue((HERE / 'all-workflows.json').is_file(), 'generated portable exports missing')
        self.assertEqual(json.loads((HERE / 'all-workflows.json').read_text()), list(workflows.values()))
        for action, workflow in workflows.items():
            self.assertEqual(json.loads((HERE / 'workflows' / (action + '.json')).read_text()), workflow)
        manifest = json.loads((HERE / 'manifest.json').read_text())
        self.assertFalse(manifest['active'])
        self.assertTrue(all(w['default_mode'] == 'preview' for w in manifest['workflows']))
        self.assertNotIn('job_id', json.dumps(manifest))
        serialized = json.dumps(workflows)
        self.assertNotIn('/home/', serialized)
        self.assertNotIn('executionId', serialized)


if __name__ == '__main__':
    unittest.main()
