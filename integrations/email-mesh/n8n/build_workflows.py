"""Reproducible n8n workflow copies; never import, execute or alter schedulers."""
import json
import os
from pathlib import Path
import uuid

HERE = Path(__file__).resolve().parent
NAMESPACE = uuid.UUID('29107a48-af92-4c43-821b-2d231a85b2b8')
SPECS = {
    'pipeline': ('01 Email Mesh - Main Pipeline', '*/5 * * * *',
        'ops.py run: Gmail TRX delta -> deterministic parser -> directional dedup/holds/outbox -> canonical Firebase publisher. '
        'Destination classification/correction runs only after successful delta. Financial review runs afterward; a failed delta permits notify-only, never approved publication. '
        'All original checkpoint, registry, UID/project, create-once markers and manual-category protection remain in the Python engine.'),
    'watchdog': ('02 Email Mesh - Watchdog and Daily Backup', '30 */5 * * * *',
        'ops.py watch: staleness/failure/outbox/quarantine/disk/gateway checks, private verified backup when >=24h old, retain seven snapshots, deduplicated ops alerts. '
        'The 30-second offset approximates the independent timer; keep the original timer running until an approved cutover.'),
    'backup': ('03 Email Mesh - Manual Verified Backup', None,
        'ops.py backup: force a private verified recovery bundle, keep seven snapshots and run the original watchdog. '
        'This canonical command can send watchdog alerts in live mode. Never restore or reset cloud balances automatically.'),
    'classification': ('04 Email Mesh - Destination Classification and Corrections', None,
        'category_hook.py: at most one classifier inference, persistent whitelist/backlog, admin-precedence, bounded correction-only publisher and exact readback. '
        'This is also called by the main pipeline. Do not schedule it independently or duplicate the main run.'),
    'review': ('05 Email Mesh - Receipt Review Discovery and Notifications', None,
        'financial_review_hook.py --notify-only: discover quarantined receipts, persist revisions and notify the authorized admin. '
        'No approval or financial publication is synthesized here. Trusted /bxconfirm /bxretry /bxreject input remains in the existing Telegram plugin; '
        'the main pipeline consumes validated approvals using the canonical publisher.'),
    'status': ('06 Email Mesh - Read-only Status', None,
        'Read-only SQLite counts scoped to the verified BudgetX demo UID: events, pending outbox and quarantined receipts. '
        'No raw receipts, destinations, API keys or account identifiers are returned.'),
    'verify-backup': ('07 Email Mesh - Verify Latest Backup', None,
        'Read the latest existing private bundle and run ops.verify_backup: checksums, SQLite integrity, optional databases and table hashes. '
        'No backup creation, rotation, restore or notifications.'),
}


def identity(value):
    return str(uuid.uuid5(NAMESPACE, value))


def build_workflows():
    workflows = {}
    for action, (title, schedule, description) in SPECS.items():
        def node(name, kind, position, parameters=None, version=1):
            return {'id': identity(action + ':' + name), 'name': name,
                    'type': 'n8n-nodes-base.' + kind, 'typeVersion': version,
                    'position': list(position), 'parameters': parameters or {}}
        mode = 'preview'
        # Shell parameter expansion is quoted; its content is never parsed as code.
        # Only a literal allowlisted mode can be appended by the n8n expression.
        command = ('case "${BUDGETX_MESH_ROOT-}" in /*) ;; *) exit 64 ;; esac; '
                   'test -d "$BUDGETX_MESH_ROOT" || exit 64; '
                   'exec "$BUDGETX_MESH_ROOT/.venv/bin/python" '
                   '"$BUDGETX_MESH_ROOT/n8n/adapter.py" ' + action + ' --mode ')
        expression = '={{ ' + json.dumps(command) + ' + (["preview", "inspect", "live"].includes($json.mode) ? $json.mode : "preview") }}'
        nodes = [
            node('Manual Run', 'manualTrigger', (0, 200)),
            node('Safety Mode', 'set', (260, 200), {'mode': 'raw', 'jsonOutput': json.dumps({'mode':mode}), 'options':{}}, 3.4),
            node('Canonical ' + action, 'executeCommand', (520, 200), {'executeOnce':True,'command':expression}),
            node('Parse Sanitized Result', 'set', (780, 200), {'mode':'raw','jsonOutput':'={{ $json.stdout }}','options':{}}, 3.4),
            node('Operation OK', 'if', (1040, 200), {'conditions': {'options':{'caseSensitive':True,'leftValue':'','typeValidation':'strict','version':2},
                 'conditions':[{'id':identity(action+':ok-condition'),'leftValue':'={{ $json.ok }}','rightValue':True,
                                'operator':{'type':'boolean','operation':'true','singleValue':True}}], 'combinator':'and'}, 'options':{}}, 2.2),
            node('Result - Sanitized', 'noOp', (1300, 100)),
            node('Stop - Safe Failure', 'stopAndError', (1300, 320), {'errorMessage':"={{ $json.error || 'Canonical component failed; inspect private ops state.' }}"}),
            node('Coverage and Safety', 'stickyNote', (150, -320), {'content': '## '+title+'\n\n'+description+
                 '\n\n**COPY ONLY — inactive by default.** Every action defaults to `preview`; explicitly select `inspect` for read-only checks. '
                 'Do not cut over while the old scheduler is enabled. Live mode additionally requires `BUDGETX_N8N_ALLOW_LIVE=1` on the n8n service. '
                 'Config, OAuth, Firebase Admin and financial state remain in private host files. '
                 'These are n8n orchestration workflows reusing the existing Python engine, not a rewrite of ledger logic into JavaScript nodes.',
                 'height':400,'width':1160,'color':5}),
        ]
        connections = {}
        def connect(source, target, output=0):
            main = connections.setdefault(source, {'main':[]})['main']
            while len(main) <= output:
                main.append([])
            main[output].append({'node':target,'type':'main','index':0})
        connect('Manual Run','Safety Mode')
        connect('Safety Mode','Canonical '+action)
        connect('Canonical '+action,'Parse Sanitized Result')
        connect('Parse Sanitized Result','Operation OK')
        connect('Operation OK','Result - Sanitized',0)
        connect('Operation OK','Stop - Safe Failure',1)
        if schedule:
            nodes.append(node('Every 5 Minutes', 'scheduleTrigger', (0, 20), {'rule':{'interval':[{'field':'cronExpression','expression':schedule}]}},1.2))
            connect('Every 5 Minutes','Safety Mode')
        workflows[action] = {
            'id': uuid.uuid5(NAMESPACE, action).hex[:16],
            'name': 'BudgetX | ' + title,
            'description': description,
            'active':False, 'nodes':nodes, 'connections':connections,
            'settings':{'executionOrder':'v1','timezone':'Asia/Jakarta','executionTimeout':450,
                        'saveDataErrorExecution':'all','saveDataSuccessExecution':'all','saveManualExecutions':True},
            'pinData':{}, 'tags':[], 'versionId':identity(action+':version-1'),
        }
    return workflows


def main():
    os.umask(0o077)
    directory = HERE / 'workflows'
    directory.mkdir(exist_ok=True, mode=0o700)
    workflows = build_workflows()
    for action, workflow in workflows.items():
        (directory / (action + '.json')).write_text(json.dumps(workflow,ensure_ascii=False,indent=2)+'\n')
    (HERE / 'all-workflows.json').write_text(json.dumps(list(workflows.values()),ensure_ascii=False,indent=2)+'\n')
    manifest = {'method':'native n8n orchestration of canonical Python engine','active':False,
                'legacy_scheduler_guard':{'job_name':'budgetx-email-mesh-demo','cron':'*/5 * * * *'},
                'legacy_watchdog_guard':{'timer':'budgetx-mesh-watch.timer'},
                'admin_approval_ingress':'existing trusted Telegram plugin; retained, not duplicated',
                'excluded_maintenance':['credit migration','checkpoint reset','bulk destination apply','ledger restore'],
                'workflows':[{'action':action,'id':w['id'],'name':w['name'],'schedule':SPECS[action][1],
                              'default_mode':'preview'} for action,w in workflows.items()]}
    (HERE / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'generated':len(workflows),'ids':{k:v['id'] for k,v in workflows.items()}}))


if __name__ == '__main__':
    main()
