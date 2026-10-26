"""Packaging regressions for bridge observability and recoverable source snapshots."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import financial_review_hook as hook
import financial_review_web as web
import ops
from mesh import Engine
from test_mesh import config

class IntegrationOpsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.config=config(self.root)
        self.config.update(financial_review_enabled=True,financial_review_web_enabled=True)
        self.path=self.root/'config.json';self.path.write_text(json.dumps(self.config));self.path.chmod(0o600)
        with Engine(self.config):pass

    def test_web_failure_is_nonzero_hook_result_without_error_detail(self):
        with patch.object(web,'run_web_review_hook',return_value={'enabled':True,'web_error':'ReviewBlocked'}),patch('builtins.print') as output:
            self.assertEqual(hook.main(['--config',str(self.path),'--notify-only']),1)
        self.assertEqual(json.loads(output.call_args.args[0])['web_error'],'ReviewBlocked')

    def test_ops_keeps_web_failure_visible_in_financial_review_health(self):
        result=ops.run(self.path,execute=lambda path:(0,{}),now=1,
                       financial_execute=lambda *a,**kw:(1,{'enabled':True,'web_error':'ReviewBlocked'}))
        self.assertEqual(result['financial_review_error'],'ReviewBlocked')

    def test_backup_includes_bridge_mime_and_reproducible_dependencies(self):
        result=ops.backup(self.path,self.root/'backups',now=1000)
        for name in ('financial_review_web.py','harvest.py','requirements.txt','requirements.lock'):
            self.assertEqual((result/name).read_bytes(),(ops.HERE/name).read_bytes())
            self.assertEqual((result/name).stat().st_mode&0o777,0o600)
        self.assertEqual(ops.verify_backup(result),ops.snapshot(self.config))

if __name__=='__main__':unittest.main()
