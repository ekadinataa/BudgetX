"""Offline regression for portable checkout/bootstrap management."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parent
MANAGE=ROOT/'scripts/manage.py'

class CheckoutTests(unittest.TestCase):
    def run_manage(self,*args):
        return subprocess.run([sys.executable,str(MANAGE),*map(str,args)],cwd=ROOT,capture_output=True,text=True,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})

    def test_source_check_needs_no_private_config(self):
        result=self.run_manage('check')
        self.assertEqual(result.returncode,0,result.stderr)
        body=json.loads(result.stdout)
        self.assertTrue(body['ok'])
        self.assertFalse(body['network_used'])

    def test_init_private_disabled_config_never_overwrites(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'private/config.json'
            result=self.run_manage('init-config','--output',target)
            self.assertEqual(result.returncode,0,result.stderr)
            c=json.loads(target.read_text())
            self.assertFalse(c['publish_enabled'])
            self.assertFalse(c['financial_review_enabled'])
            self.assertFalse(c['financial_review_web_enabled'])
            self.assertFalse(c['destination_classification_enabled'])
            self.assertEqual(target.stat().st_mode&0o777,0o600)
            self.assertEqual(target.parent.stat().st_mode&0o777,0o700)
            self.assertTrue(Path(c['harvest_dir']).samefile(ROOT))
            before=target.read_bytes()
            self.assertNotEqual(self.run_manage('init-config','--output',target).returncode,0)
            self.assertEqual(before,target.read_bytes())

    def test_config_cannot_be_generated_inside_source_or_symlink(self):
        with tempfile.TemporaryDirectory() as folder:
            link=Path(folder)/'link';link.symlink_to(ROOT,target_is_directory=True)
            self.assertNotEqual(self.run_manage('init-config','--output',link/'config.json').returncode,0)
        self.assertNotEqual(self.run_manage('init-config','--output',ROOT/'private/config.json').returncode,0)

    def test_doctor_refuses_unconfigured_sample_without_writing_state(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'private/config.json'
            self.assertEqual(self.run_manage('init-config','--output',target).returncode,0)
            before=set(target.parent.iterdir())
            result=self.run_manage('doctor','--config',target)
            self.assertNotEqual(result.returncode,0)
            self.assertEqual(set(target.parent.iterdir()),before)
            self.assertFalse(json.loads(result.stdout)['network_used'])

    def test_doctor_rejects_wallet_placeholder_after_checkpoint_is_filled(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'private/config.json'
            self.assertEqual(self.run_manage('init-config','--output',target).returncode,0)
            config=json.loads(target.read_text())
            config['checkpoint_at']='2026-01-01T00:00:00+00:00'
            config['mailbox_email']='synthetic@sample.test'
            config['sender_allowlist']={'noreply@krom.id':'KROM'}
            for key in ('token_path','client_secret_path','firebase_admin_path'):
                p=Path(config[key]);p.write_text('{}');p.chmod(0o600)
            target.write_text(json.dumps(config))
            result=self.run_manage('doctor','--config',target)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('wallet_ids_not_configured',json.loads(result.stdout)['issues'])

if __name__=='__main__': unittest.main()
