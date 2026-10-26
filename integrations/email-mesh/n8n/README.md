# Optional n8n orchestration artifacts

Seven **inactive, preview-default** workflows call the canonical Python engine; they do not duplicate ledger logic. Nothing here imports into n8n, changes a scheduler, or authorizes a live cutover.

| Workflow | Entry point | Optional schedule |
| --- | --- | --- |
| Pipeline | `ops.py --config … run` | Every five minutes |
| Watchdog / daily backup | `ops.py --config … watch` | Every five minutes, 30-second offset |
| Verified backup | `ops.py --config … backup` (may send watchdog alerts) | Manual |
| Classification / corrections | `category_hook.py --config …` | Manual; already part of pipeline |
| Receipt review / notifications | `financial_review_hook.py --config … --notify-only` | Manual; never directly publishes approvals |
| Status | Scoped SQLite counts, opened with `mode=ro` | Manual |
| Verify existing backup | Canonical checksum/integrity/table-snapshot verifier | Manual |

All seven include a manual trigger, Safety Mode, sanitized-result parser, success branch and safe-failure branch. Only pipeline/watchdog have schedule nodes, and `active` is always false in generated exports. Their timezone is `Asia/Jakarta`.

## Portable runtime configuration

Prepare the mesh environment using the parent integration's setup instructions. The expected layout is:

```text
<mesh-root>/
  .venv/bin/python
  ops.py, category_hook.py, financial_review_hook.py, …
  n8n/adapter.py
```

For a checkout, `<mesh-root>` is the absolute path to `integrations/email-mesh`, **not the monorepo root or `n8n/` directory**. Use its `.venv`, not an unrelated n8n/Node environment. Execute Command must be available in a trusted self-hosted n8n deployment, with this directory and private runtime files accessible to its service user; container deployments need corresponding mounts and user-bus access if a live watchdog is intended.

Set these trusted **service environment** values, never values from incoming chat/webhook JSON:

| Setting | Meaning |
| --- | --- |
| `BUDGETX_MESH_ROOT` | Required by generated shell nodes: existing absolute mesh-root directory |
| `BUDGETX_MESH_CONFIG` | Absolute private config path; otherwise `$XDG_CONFIG_HOME/budgetx-email-mesh/config.json` (XDG defaults to `~/.config`) |
| `HERMES_HOME` | Required for live execution: explicitly selected existing profile directory containing `config.yaml`; no default-profile fallback |
| `BUDGETX_N8N_ALLOW_LIVE` | Unset / anything except exact `1` blocks live execution |

The adapter defaults its root to its own parent directory when invoked directly. It uses `sys.executable` for child Python commands, so invoke it with the mesh `.venv/bin/python`. Generated nodes already do this. Root expansion is quoted and checked for an absolute existing directory before execution; action/mode are allowlisted literals. Shell-looking characters in a trusted path remain literal arguments, not evaluated code. No path from `$json` can select a config, executable or backend.

Private config, OAuth/Admin credentials, ledger/review databases and backup bundles remain outside Git. The adapter verifies the fixed BudgetX demo project/UID scope before inspecting or executing. Python-engine validation, checkpoint/registry gates, locks, retries, admin precedence and create-once markers remain authoritative.

## Reproduce and test (offline)

From the monorepo root, using Python 3.11+:

```bash
python3 integrations/email-mesh/n8n/build_workflows.py
env -u HERMES_HOME PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s integrations/email-mesh/n8n -p 'test_*.py' -v
python3 integrations/email-mesh/n8n/adapter.py pipeline
```

The generator overwrites only `workflows/*.json`, `all-workflows.json` and `manifest.json`; UUID-based workflow/node/version IDs and content are deterministic across checkout locations. The manifest contains logical legacy scheduler names, not installation-specific job IDs. The tests compare exports to fresh generation, run real shell dispatch against temporary synthetic paths (including spaces/metacharacters), create synthetic SQLite/backup fixtures, and substitute bounded callbacks for external workers. They never inspect the caller's operational state. No historical execution/import logs, verification reports, source hashes, private output artifacts or credentials are bundled.

After separately configuring private paths, read-only checks can be explicitly requested:

```bash
"$BUDGETX_MESH_ROOT/.venv/bin/python" "$BUDGETX_MESH_ROOT/n8n/adapter.py" status --mode inspect
"$BUDGETX_MESH_ROOT/.venv/bin/python" "$BUDGETX_MESH_ROOT/n8n/adapter.py" verify-backup --mode inspect
```

Preview resolves no runtime paths and reads no config/state. `inspect` is allowed only for status/verification. It never creates a missing database. `mesh.py run --no-publish` is **not** a dry-run; `mesh.py status` can initialize schema, so neither is used here as a read-only preview.

## Import and cutover boundaries

Import `all-workflows.json` (or individual `workflows/*.json`) through the trusted n8n editor. Keep imports inactive and Safety Mode `preview` for review. An n8n editor can execute arbitrary service-user commands; do not expose editor access publicly, to untrusted users, or as an LLM tool. Enabling Execute Command is a separate operator decision, not performed by this package.

Live execution requires **all** of: explicit operator approval, Safety Mode `live`, service environment `BUDGETX_N8N_ALLOW_LIVE=1`, a valid existing `HERMES_HOME`, and an independently observed disabled legacy scheduler:

- Pipeline/classification/review: the selected profile's `cron/jobs.json` must contain `budgetx-email-mesh-demo`, with **all** matching jobs explicitly `enabled: false`.
- Watchdog/backup: `budgetx-mesh-watch.timer` must report both `inactive` and `disabled` with expected systemctl exit statuses. A stopped-but-enabled timer, missing timer, unavailable user bus or ambiguous state blocks execution.
- Missing/malformed state fails closed; there is no CLI flag or incoming workflow boolean to bypass these guards. The adapter never disables jobs/timers itself.

Retain the independent watchdog unless replacing its independence from n8n has been explicitly accepted. Activate only pipeline and, if approved, watchdog; helper workflows remain manual. Preserve canonical locks/backoff and disable node-level automatic retries that could replay a successful financial stage after a classification/review failure. Classification is already part of the pipeline. Telegram commands remain in the native [Hermes plugin](../hermes-plugin/README.md); do not add another poller, fabricate actor metadata or turn arbitrary n8n JSON into approvals.

Credit migration, checkpoint reset, bulk destination apply, ledger restore, live scheduler switching and financial publication testing are excluded. Import compatibility and authorized end-to-end Gmail/cloud/Telegram behavior require separate deployment verification; offline tests are not evidence of production installation or delivery.
