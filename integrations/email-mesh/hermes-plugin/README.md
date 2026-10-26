# Optional native Hermes receipt-review plugin

Versioned source artifacts for `budgetx-financial-review`. No installation, profile/config edits, gateway restart, Telegram poller, live approval or cloud publication is performed by this directory.

- `__init__.py`: native deterministic Telegram interceptor and bounded local backend protocol.
- `plugin.yaml`: Hermes manifest.
- `test_plugin.py`: synthetic offline tests with fake PTB/native-update objects; imports need neither Hermes nor python-telegram-bot.

## Trusted configuration

Supply these **operator-owned gateway service environment** values explicitly:

```text
HERMES_HOME=<absolute-existing-path>/profiles/devops-budgetx
BUDGETX_MESH_ROOT=<absolute-checkout-path>/integrations/email-mesh
BUDGETX_MESH_CONFIG=<absolute-private-config-path>/config.json
BUDGETX_MESH_PYTHON=<absolute-checkout-path>/integrations/email-mesh/.venv/bin/python
```

The profile must already exist with `config.yaml`, and both the selected and resolved directory must retain the `profiles/devops-budgetx` role. No profile is created and the default profile is never substituted. Root/config/interpreter must be absolute existing paths; the interpreter must be executable and the root must contain `financial_review_admin.py`. These settings select installation paths only, never sender authority. They cannot be chosen by chat text or request fields. Keep private JSON config mode `0600`, outside Git, with the canonical demo scope and explicitly enabled authorized-admin review settings described in the parent integration docs.

The native registration home, current context-local Hermes home and adapter owner must match the selected `devops-budgetx` role. The existing authorized Telegram user/private-chat ID remains **790484718**, with bot, forwarded, edited, channel/business/sender-chat and non-native updates rejected. This ID and the profile name are fixed authorization scope, not configurable credentials. The canonical backend independently revalidates actor, profile, command, evidence revision and wallet constraints.

The handler is registered at PTB group `-10000`, blocking. It persists local intent synchronously before its first await, and always raises `ApplicationHandlerStop`, preventing later busy-session queuing, normal slash dispatch or LLM fallback for the reserved `/bxreview`, `/bxconfirm`, `/bxretry`, `/bxreject` prefixes—even on rejected input/backend failure. No trusted actor comes from normalized chat/session metadata.

Backend argv contains only the trusted interpreter, `<root>/financial_review_admin.py`, `--config` and the trusted config path, with `shell=False`. The bounded native request travels on stdin; stderr is discarded and malformed/oversized output is rejected. Responses distinguish local approval from publication by the **separate already-scheduled worker**. Acknowledgement failure does not undo durable intent; use `/bxreview` before retrying uncertain commands. `/bxreview` reads local queue state without publishing. Do not send synthetic commands to production to test this source.

## Deployment is a separate authorized operation

This retains the source installation's compatibility API `ctx.register_telegram_handler(factory)`, documented as the backward-compatible alias for `ctx.register_platform_handler("telegram", factory)` in the [official plugin developer guide](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins). The factory imports PTB lazily; importing source artifacts has no Hermes dependency. See also the [official plugin lifecycle/discovery documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins).

A separately approved deployment must copy only `__init__.py` and `plugin.yaml` into the owning profile's `plugins/budgetx-financial-review/`, inject trusted service settings, enable the plugin using the applicable Hermes CLI, and arrange an explicitly approved gateway restart from an external shell. This repository directory is not automatically discovered by the gateway. Do not modify another profile or start a duplicate Telegram consumer. Verify actual registration against the gateway PID/start time, authorization rejection, busy-session interception, local intent/readback and later scheduled publication independently; the tests below prove none of those live installation facts.

## Offline tests

From the monorepo root:

```bash
env -u HERMES_HOME PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s integrations/email-mesh/hermes-plugin -p 'test_*.py' -v
```

Tests use temporary configured profiles and synthetic stdin/backend responses. They validate argv/no-shell, request size/path/actor restrictions, backend response validation, profile scope, native-update spoof rejection, early busy-session interception and stop-all-groups behavior. No network access, installed plugin/profile state, credentials or financial data are required. The canonical backend protocol validation is exercised against a synthetic relocated profile, not against the installed Hermes gateway.
