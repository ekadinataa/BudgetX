"""Credit maintenance uses an explicit private plan, never installed wallet IDs."""
import json
from pathlib import Path
import subprocess
import sys
import unittest
import migrate_credit

class MigrationPortabilityTests(unittest.TestCase):
    def test_no_built_in_facilities_and_empty_plan_is_noop(self):
        self.assertEqual(migrate_credit.FACILITIES,{})
        self.assertEqual(migrate_credit.plan([{'id':'synthetic-wallet','balance':500000}]),{})

    def test_explicit_facility_plan_is_required_to_select_wallets(self):
        rows=[{'id':'synthetic-wallet','name':'Synthetic Credit','type':'credit','balance':500000}]
        approved={'synthetic-wallet':('Synthetic Credit','credit',500000)}
        changes=migrate_credit.plan(rows,facilities=approved)
        self.assertEqual(changes,{'synthetic-wallet':{'creditLimit':500000,'balance_delta':-500000}})

    def test_maintenance_cli_cannot_default_to_installed_credentials(self):
        p=subprocess.run([sys.executable,str(Path(__file__).with_name('reconcile_demo_credit.py'))],text=True,capture_output=True)
        self.assertNotEqual(p.returncode,0)
        self.assertIn('--config',p.stderr)
        self.assertIn('--facilities',p.stderr)

if __name__=='__main__':unittest.main()
