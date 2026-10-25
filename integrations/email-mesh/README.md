# Email-mesh web review bridge — staged, not activated

`financial_review_web.py` is an **offline-tested installation artifact**, not a
running backend. Nothing here installs itself, loads runtime configuration,
opens credentials, starts a scheduler, or invokes the mesh CLI. The active worker,
its databases/configuration and its existing schedule have not been changed.
The web frontend/rules deployment and worker installation/activation are separate
approval gates. A frontend submission is **not** evidence that money was posted.

## Responsibilities and trust boundary

- `WebReviewStore(ReviewStore).decide_web(body, request_id=...)` writes only the
  existing private SQLite **reviews, commands, audit** tables. It never opens the
  financial ledger, invokes a publisher, or changes balances.
- `sync_web_reviews(config, store, publisher=... | publisher_factory=...)` verifies
  project + Auth email/UID using `financial_review_apply.verify_target` **before
  any document access**, reads only deterministic current-version decision
  paths, ingests decisions, and replaces/redacts review mirrors with readback.
- `review_mirror(config, record, web_decision_accepted=False)` is a one-way
  allowlisted SQLite projection, including accepted-command status from SQLite.
  Browser-writable mirror fields never supply money, status, version, endpoints,
  or registry facts to a financial decision. No Firestore collection scan/query is used.
- `run_web_review_hook(...)` adapts the **existing** `run_review_hook`. Discovery
  remains first; ingestion runs after discovery, before its canonical processor;
  status is mirrored again after processing, before the original notifier.
  Publication exceptions still allow notifications. Web failures add sanitized
  `web_error`; they do not suppress Telegram notifications. A post-process sync
  uses `consume=False`, so it cannot ingest a second command in the same tick.
- Only the existing hook invokes `financial_review_apply.process_reviews` and its
  canonical publisher. It retains fresh-evidence/parser/checkpoint validation,
  receipt-bound backups, canonical event/outbox identity, increment accounting,
  cloud marker/component readback and retry ownership. No new money writer exists.

The canonical source currently restricts configuration to its verified demo
project/email/UID and existing Telegram administrator. This artifact deliberately
keeps those restrictions; it is not a generalized arbitrary-user publisher.

## Activation switches

Both `financial_review_enabled: true` (existing workflow) and the **separate**
`financial_review_web_enabled: true` are required. Absent/false/string/number is
not opt-in. With web opt-in absent, `sync_web_reviews` returns disabled before
constructing a publisher or opening any state. The wrapper delegates unchanged to
the original hook, without web traffic. Financial publication additionally
requires the existing `publish_enabled: true` and hook `allow_publication=True`.
Web mirroring/ingestion can operate independently of publication permission.

Never enable web review on the strength of frontend deployment alone. Activation
allows existing scheduled processing to consume explicit receipt decisions and,
if publication is already enabled, publish those decisions on that same tick.
Enabling the feature itself does not approve any receipt.

## Firestore contract

All paths are under the verified `users/{uid}`. Mirror document ID is the exact
canonical SQLite review ID: **64 lowercase hex**. Revision is the canonical
fingerprint prefix: **16 lowercase hex**. Do not recompute a frontend review ID.

### Server-owned mirror: `financialReviews/{id}`

Exactly these fields are replaced on each sync (no merge of untrusted extras):

```text
schemaVersion: 1
id, version, kind, state
amount: integer | null
fee: integer | null
totalCredit: canonical parsed.total_credit integer | null
webDecisionAccepted: boolean from the exact current canonical Firebase command
currency: "IDR" | null
occurredAt: canonical parsed.notification_at ISO string | null
provider: configured sender-allowlist provider code | null
reason, error: safe diagnostic codes | null
source: canonical parsed.source_wallet (registered/EXTERNAL/UNRESOLVED) | null
destination: canonical parsed.destination_wallet (same policy) | null
choices: [{action, source, destination}]
walletOptions: [{key, walletId, name}]
event_id: canonical hex event ID | null
updatedAt: ISO UTC string from canonical record.updated
```

`fee` is **`parsed.fee_paid`**, not `fee_displayed` and not a guessed zero.
Unknown amounts/fees stay null; booleans are not money. Provider is resolved from
the canonical parser's sender through the configured exact sender allowlist;
raw sender identity is never exported. Wallet options contain only registered
keys/document IDs and display names (long digit runs and emails are masked).
No raw email, account/message IDs, sender addresses, destination identity,
configuration, parsed object, result object, backup paths or exception text is
mirrored. A missing/unsafe diagnostic code is null, not exception text.

Financial choices exist only for an **unbound pending receipt**, never delivery,
posted, approved, rejected or blocked records. Every income/expense/transfer
combination is checked by the shared `_endpoints` and `Engine.reason` guards.
Unknown/invalid amount, non-final status, uncertain paid fee, inconsistent totals,
unsafe parser errors, or remapping an already-known endpoint produces no unsafe
choice. Reject is a nonfinancial control, not an entry in `choices`. Web retry
is forbidden: canonical retry can authorize publication and is not a harmless
status refresh. Existing trusted Telegram administrator commands remain separate
and unchanged.

`webDecisionAccepted` is true only when scoped SQLite `commands` contains the
exact current review ID/version with `platform='firebase'`, `chat_id=uid`, and
`message_id=id + '--' + version`. A cloud command body or forged mirror does not
establish acceptance. The field remains true after acceptance even if canonical
processing blocks, rejects, or returns to pending; all choices are then empty.
The browser must not reopen or submit another decision on that revision. Explain
blocked recovery through the existing trusted receipt-specific administrator
workflow, not a browser retry or command deletion.

### Immutable command: `financialReviewDecisions/{id}--{version}`

Body is an **exact field allowlist**; no additional amount, fee, category,
identity, actor or financial fields are accepted:

```json
{
  "schemaVersion": 1,
  "uid": "<verified target UID>",
  "reviewId": "<64 lowercase hex canonical ID>",
  "version": "<16 lowercase hex canonical revision>",
  "action": "transfer",
  "source": "<registered wallet key>",
  "destination": "<registered wallet key>",
  "createdAt": "2026-10-07T01:00:00.000Z"
}
```

- `request_id` must equal `reviewId + '--' + version`, and body ID/revision must
  also match the exact path read. `uid` must equal the verified config UID.
- Income uses explicit `source: "EXTERNAL"`; expense uses explicit
  `destination: "EXTERNAL"`. Select the exact canonical choice, not wallet IDs.
- Reject uses `source: null, destination: null`. It is allowed for an undecided
  pending receipt or an undecided blocked receipt **without an event ID**.
  No new browser action, including reject, may replace an already accepted
  revision from either trusted channel. Bound events are canonical publication-
  recovery work, not permission for another event. Web `retry` is rejected before
  state lookup or command replay, including legacy identical retry commands.
- `createdAt` must be an ISO/RFC3339-style string with `T`, seconds, and timezone
  (`Z` or a valid `±HH:MM` offset). Invalid dates/offsets, missing timezone,
  server-timestamp sentinel objects and non-string values fail closed. This is
  command metadata, **never receipt time or an authorization freshness clock**;
  the current evidence revision supplies freshness.
- Atomically insert into existing `commands` with `platform='firebase'`,
  `chat_id=uid`, `message_id=request_id`; store actual provenance
  `actor={platform:'firebase',uid:...}`. No synthetic Telegram identity is used.
- Identical replay of an allowed accepted action is a no-op even after
  approved/prepared/posted. Changes to any
  accepted payload field (including createdAt) conflict. SQLite `BEGIN IMMEDIATE`
  arbitrates simultaneous web/Telegram commands; the first accepted decision
  wins. A concurrent losing command cannot replace it.
- Superseded revisions, bad bodies and conflicts never trigger money or delete/
  rewrite the cloud command. Old-version command paths are not enumerated or
  re-consumed. Rejected current command bodies remain present and are counted
  again on later syncs; that is retention, not a new accepted command.
- One immutable web command per revision means an accepted web decision cannot
  later be overwritten, even with reject. Resolve via the existing trusted
  receipt-specific administrator workflow or a genuinely new canonical evidence
  revision, not by deleting/recreating commands or forcing a replay.

### Required browser security policy (separate deployment)

Before activation, deploy/test owner-only reads, **server-only mirror writes**,
and owner-only **create-once exact-schema** decision writes; deny decision update
and delete. Permit only reject with null endpoints or exact pending financial
choices; deny retry and any new decision when `webDecisionAccepted` is true. Auth
UID must equal both path UID and body UID. Browser ownership rules remain generic
to the authenticated owner; the worker still restricts its verified demo scope.
Admin SDK publishers bypass those browser rules, so target verification remains
mandatory.

A more-specific `allow ...: false` does **not** override an existing recursive
owner `allow write` rule: Firestore matching allows are OR'ed. Exclude these two
collections from any broad write grant before adding specific rules. Do not
weaken access for any other collection. The bridge is still defensive against
forged mirrors, but immutable authenticated command provenance depends on this
rules gate. This folder does not deploy or silently edit rules.

## Manual installation adapter — NOT executed

After separate action-and-target approval:

1. Review/test the candidate against the exact worker revision; preserve private
   source backups and hashes. Install the module atomically next to the canonical
   `financial_review.py`, `_apply.py`, `_hook.py`, and `mesh.py` modules. Keep
   credentials/configuration outside this repo/frontend. Do not replace canonical
   financial modules with this artifact or copy an active database as a file.
2. Modify **only the existing hook invocation**, preserving the existing lock,
   schedule, discover/notifier configuration and publication permission. For a
   Python caller already calling `run_review_hook`, the adapter is:

   ```python
   from financial_review_web import run_web_review_hook as run_review_hook
   result = run_review_hook(config, allow_publication=allow_publication)
   # Existing health/error reporting must additionally surface result['web_error'].
   ```

   If the existing scheduler instead invokes `financial_review_hook.py`'s main,
   its reviewed manual patch is the following conceptual change *inside the same
   existing lock block* (do not create a second cron):

   ```diff
   -result = run_review_hook(config, allow_publication=not args.notify_only)
   +from financial_review_web import run_web_review_hook
   +result = run_web_review_hook(config, allow_publication=not args.notify_only)
   ...
   -return 1 if result.get('publication_error') or result.get('notification_error') else 0
   +return 1 if (result.get('publication_error') or result.get('notification_error')
   +             or result.get('web_error')) else 0
   ```

3. Verify project + Auth target and approved rules separately, then explicitly set
   the web opt-in. Preserve the publication flag; do not turn it on implicitly.
   Keep existing watchdog reporting for publication/notification errors, and add
   `web_error`/rejection counters. A successful mirror write is read back exactly;
   failure is surfaced without suppressing original Telegram notices.
4. Observe the **existing scheduled hook** and read back exact mirror/decision,
   canonical queue/audit, and (only when a receipt was explicitly approved)
   canonical event/components/accounting effects. Do not manually run `mesh.py`,
   `ops.py`, an outbox drain or a new publishing worker as an activation test.
5. To disable web ingress/mirroring, set the separate web flag false. Existing
   canonical approved/prepared work remains governed by the original processor;
   disabling web review is not cancellation or financial rollback. Retain audit
   and immutable decisions. No runtime install/activation has happened here.

The bridge intentionally scans only scoped **local** queue rows and reads their
exact current document paths. It does not list Firestore collections or discover
commands from mirrors. Sync currently mirrors every scoped local row each tick;
large-queue batching would require a separately tested fair cursor, not a cap
that permanently starves newer rows. SDK operations use the publisher's existing
transport/deadlines; no independent network runner is introduced.

## Offline verification

Requires only Python 3.11+ stdlib and the canonical source modules for imports;
no Firebase SDK installation, private config, credentials, live ledger, emails,
network or subprocess is needed. `MESH_SOURCE` is a **source-only** import path.
Tests disable bytecode writes, construct temporary synthetic databases beneath
`TMPDIR`, deny socket connections/subprocesses, and reject default publisher
construction. Tests exercise both injected document adapters and SDK-shaped
in-memory get/set adapters, including replacement/readback.

From this web repository:

```bash
MESH_SOURCE=/home/ekadinataa/budgetx-email-mesh \
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover \
  -s integrations/email-mesh -p test_financial_review_web.py -v
```

Observed RED/GREEN for removal of unsafe web retry: helper regressions first
failed for pending/blocked retry, its label, and accepted-revision changes; the
rules source contract failed on retry permission. Python regressions first
failed on legacy retry replay, replacement of a blocked accepted Telegram
decision, and the absent accepted-status field. After the fixes, **32 Python
tests** and **37 helper/rules tests** passed. Rules tests inspect source contracts,
not a Firestore Rules emulator.

Coverage includes no review/command/audit or ledger mutation on refused retry,
exact accepted-command matching independent of cloud bodies, immutable rejected
decisions, and empty choices on accepted pending/blocked revisions. The original
full offline coverage remains: pure-parser → SQLite decision → unchanged
canonical `process_reviews` → fake publisher → event/readback, exactly one
synthetic publication and no second event on replay; stale/changed evidence,
known remap refusal, concurrent web/Telegram arbitration, identical concurrent
web replay, reject/no-money paths, nullable paid fees, redaction, opt-in,
project/Auth mismatch, immutable retention and hook errors.

These results establish offline compatibility, not production installation,
cloud IAM/rules correctness, live event posting, browser delivery or activation.
Helper and rules sources were updated alongside this staged bridge; no
installation, rules deployment, live database access or worker activation was
performed.
