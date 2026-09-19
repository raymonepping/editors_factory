# Improvement Report

Prompt: `prompts/improvements/01_01_improvement.md`
Scope of this report: the follow-up pass that verified Waves 1–3 and 7
(previously marked COMPLETED by an earlier pass) against the running
system rather than trusting the label, fixed what that verification
found, and implemented Waves 2.5 (credential renewal), 4, 5, 6, and 8.

## Repository state

Git repository, branch `main`. This pass's changes are left uncommitted
in the working tree (34 files) — the project owner commits directly
rather than this tool doing so unasked. Every change described below was
applied to the live working tree and verified against the actually-running
stack before being left for commit.

## Findings confirmed, corrected, or resolved

### A live authorization bypass in Wave 7 (found, not previously known)

`backend/src/auth/index.js`'s `requireHumanSession` accepted **any**
non-empty `Authorization: Bearer <anything>` header, and separately
granted full `factory-operator` rights to any client on `localhost`
whose User-Agent started with `curl/`, `node`, or was empty — neither
check verified a real credential. `PUT /api/demo/mode`, `POST
/api/demo/reset`, and `POST /api/agents/agent-a/tasks` were reachable
with zero authentication. Confirmed live with unauthenticated `curl`
calls before any fix was applied.

**Fix:** removed both bypasses. Added a real, narrow shared secret
(`FACTORY_CLI_OPERATOR_TOKEN`, presented as `X-Factory-Cli-Token`) for
the documented `make demo-bad`/`demo-good`/`reset` CLI workflow — a
third identity domain, distinct from every agent token and from human
OIDC sessions. Also fixed `authorize.js`'s `requireRole`, which treated
a missing identity as "auth is disabled, permit all" instead of denying.

**Verified:** unauthenticated, forged-Bearer, and wrong-CLI-token
requests all return 401; the real Makefile workflow still succeeds; a
full BAD run still completes end to end. Locked in permanently as
`backend/test/human-boundary.test.js` (Wave 8).

### An unused credential-renewal function in Wave 2

`renewLease()` existed in `backend/src/vault.js` from the original Wave 2
pass but was never called anywhere — a task whose remediation outlives
its credential's TTL had no way to keep the lease alive, despite Wave
2/2.5's own explicit "mandatory" requirement. Separately, `factory-good-role`'s
Terraform `max_ttl` equaled its `default_ttl` (120s/120s) — zero
renewal headroom regardless of code.

**Fix:** implemented Wave 2.5 in full — see below.

## Wave 2.5: credential renewal (new)

- `backend/src/services/revocation.js`'s new `startCredentialRenewal()`
  renews both the Vault lease (`sys/leases/renew`) and the child token
  that requested it (`auth/token/renew-accessor` — a new
  `vault.js` function; found live that renewing the lease alone is not
  sufficient, since Vault revokes a lease when the token that created it
  expires, regardless of the lease's own renewed TTL). Fires at roughly
  half the credential's TTL, self-scaling with no separate config.
- `terraform/vault-platform/policies.tf`: added the missing
  `auth/token/renew-accessor` grant to the `factory-api` policy (applied
  live, after showing the user the plan diff first — this action was
  blocked by the sandbox's blind-apply guard, correctly, since it's a
  live Vault ACL change).
- `terraform/vault-database/database.tf`: raised `factory-good-role`'s
  `max_ttl` from 120s to 600s, giving real renewal headroom.
- Tested with a deliberately short test TTL (15s, reverted after):
  confirmed 4 successful renewal cycles via both API logs and the
  database (`credential_events.renewal_count`), the credential surviving
  well past its original lifetime.
- New evidence columns: `credential_events.renewal_count`,
  `last_renewed_at` (migration `006_credential_renewal.sql`) — the
  dashboard's existing `CredentialLedger.vue` renders this table keyed by
  `credential_event_id`, so a renewal is visible without new UI work.

## Wave 4: end-to-end causal tracing

Before this pass, only `audit_events` carried `trace_id`/`task_id`/
`parent_task_id`. `authority_decisions`, `credential_events`,
`database_changes`, and `findings` had none — correlation was only
possible via `run_id` + `actor_id` + timestamp proximity. Worse,
`trace_id` was regenerated fresh at every delegation hop and every tool
call, and `parent_task_id` was hardcoded `null` everywhere.

- Migration `005_causal_tracing.sql`: added `trace_id`/`task_id` to the
  three tables that lacked them; added `findings.correlates_with_event_type`
  and dropped its too-narrow single-table foreign key (most of Agent D's
  own signals fire on tables other than `audit_events`, which the old FK
  could not reference).
- `backend/src/state.js`: added an `actorId -> active taskId` lookup so
  every route can recover real causal context without changing the
  agent-to-API wire protocol at all.
- `routes/delegations.js`: propagates the delegating actor's own
  `trace_id` and sets a real `parent_task_id`, instead of minting both
  fresh at every hop.
- `routes/actions.js`'s `recordToolCall`: reuses the real trace/task
  context from `authorize()` instead of `randomUUID()` per call.
- `agents/identities/agent-d.js`: now actually populates
  `correlates_with_event_id`/`type` on every finding (the write-path
  plumbing already existed end to end; nothing had ever called it).

**Verified live:** a full BAD run traced with one `trace_id` from
`task.created` through the credential issuance to the final database
mutation; `parent_task_id` correctly chained agent-a → b → c; every
finding pointed at its real source row (confirmed by direct SQL query,
not just application logs).

## Wave 5: agent and API container hardening

Applied the pattern already proven on `compose/vault/compose.yaml`'s
`vault-agent` service to all four agent containers and `factory-api`:
non-root `user: "1000:1000"` (confirmed matches the `node:22-alpine`
image's real UID/GID), `cap_drop: [ALL]`, `security_opt:
["no-new-privileges:true"]`, `read_only: true`, `tmpfs: [/tmp]` — `/tmp`
is the only writable path any of these five containers actually needs
(confirmed by grepping for filesystem writes: only
`agents/src/heartbeat.js`'s own heartbeat file).

**Verified live:** all five containers start healthy under the new
constraints on the first try; a full BAD run (delegation, credential
issuance, destructive mutation, Agent D detection) completed
successfully with no regression.

## Wave 6: agent API identity

Full ADR at `docs/validation/ADR_001_agent_api_identity.md`. Summary:
static per-agent bearer tokens are no longer valid for any tool call,
delegation, or credential request — they are narrowed to exactly one
purpose, bootstrapping a short-lived (default 300s), task-bound,
HS256-signed JWT at the new `POST /api/v1/agents/token`. Implemented on
`node:crypto` directly rather than adding a JWT library dependency
(package.json/lockfile drift from an earlier, unrelated dependency
addition was already found and worked around this same pass — not
worth repeating).

- `backend/src/auth/agentJwt.js`: sign/verify, explicit `HS256`
  algorithm allowlist (no `alg` negotiation exists in the code at all,
  so the classic "alg: none" bypass has no path to reach).
- `backend/src/middleware/agentJwtAuth.js`: replaces `agentAuth` on
  every route it used to guard. Revocation needs no separate store — a
  JWT bound to a `task_id` is only honored while that task still
  resolves in `state.js`; one bound to a `run_id` (agent-d, which has no
  task) only while that run is still current. Both are already cleared
  at every terminal boundary Wave 2/2.5 established.
- `agents/src/backendClient.js`/`runtime.js`: every agent bootstraps a
  fresh JWT as the first step of handling a task.
- `agents/src/observerRuntime.js` (agent-d): bootstraps at startup,
  refreshes on a timer, **and** — found live, fixed before shipping —
  immediately re-bootstraps the instant it observes a new `run_id` in
  the event stream, since a time-based-only refresh left a real window
  where `make reset` invalidated its token faster than the timer could
  react, 401-ing every `create_finding` call until the next scheduled
  refresh happened to catch up.

**Verified live:** two full runs (one BAD, one GOOD), each end to end
with zero authentication errors of any kind; the static token confirmed
to no longer work on an ordinary tool route; causal tracing (Wave 4)
confirmed to still tie together correctly with JWT-derived identities.

## Wave 8: adversarial verification

No test infrastructure existed for either `backend/` or `agents/`
despite both `package.json` files declaring `"test": "node --test
test/"` — a real, previously-known gap (`WRITING_IMPROVEMENT_PLAN.md`
had already flagged it as a release blocker). Fixed for real, not just
documented:

- `backend/test/`: 24 deterministic integration tests against the real
  running stack (this project's own established "real effects, not
  mocks" philosophy — no test double exists anywhere else in it either).
  Covers: the human-boundary auth-bypass regression (permanently
  locking in the fix above), the full Wave 6 JWT lifecycle (bootstrap
  success/failure, static-token-no-longer-works, malformed JWT,
  tampered signature, cross-identity denial, task-cleared revocation),
  and delegation/credential authorization boundaries. None require an
  LLM call — a task exists in backend state the instant it's created,
  independent of whether the agent container has reasoned about it yet
  — so the whole suite runs in about one second.
- `agents/test/`: unit tests for `mentionsATool()`, the nudge heuristic
  that catches the model describing a tool call in prose instead of
  invoking it — the single most frequently observed failure mode of
  `qwen3:4b-instruct` in this project's own live testing this cycle,
  including the exact real phrasing from one live failure as a test
  case.
- **Found live fixing the test scripts themselves:** `node --test
  test/` (a directory positional argument) behaves differently on the
  host's Node v25 than on the project's actual Node 22 target — changed
  both `package.json` scripts to rely on default discovery instead
  (`node --test`), which works identically on both. Also found that
  Node's test runner runs separate files concurrently by default; since
  every file shares one live backend's singleton in-memory state (one
  active run, one task map — no per-test isolation, by design), running
  two files' `/api/demo/reset` calls in parallel produced genuine
  foreign-key-violation 500s. Fixed with `--test-concurrency=1`.

**Result:** `npm --prefix backend test` and `npm --prefix agents test`
both pass reliably, confirmed across multiple consecutive runs.

## Regression evidence (BAD and GOOD, after all waves)

- BAD: authority amplification still occurs (Agent D's D-005 finding
  fires); the deterministic policy/credential path is observable end to
  end with real causal tracing; Agent C's destructive/remediation
  mutation still reaches the database; credentials issue and (when
  needed) renew correctly; `make reset` returns the database and
  evidence state to baseline.
- GOOD: requested authority bounded by the recipient ceiling; Agent C's
  remediation completes via the narrow `set_order_status` path; no
  unauthorized mutation occurs; `make reset` remains safe and repeatable.
- Shared: agents still never receive a Vault token or database password
  at any point in this pass; SSE event ordering and reconnect behavior
  unaffected; `no-ai-slop`/Vale-reviewed prose style preserved in every
  doc touched.

## Secret-leak inspection

One mistake, caught and corrected within the same pass: an early
`.env` edit interpolated a freshly generated secret's literal value into
an authored shell command (via nested double-quote expansion), landing
it in this session's own tool-call transcript. Rotated immediately using
a pattern where the value is never referenced as a literal — only ever
as an unexpanded shell variable — before it was used anywhere. No other
secret value appears in this report, in application logs inspected
during this pass, or in any file written by it.

## Optional production work not performed

Explicitly out of scope for this cycle per the improvement prompt
itself: network isolation/egress control (accepted demo limitation),
external evidence sink / SIEM export, automated containment beyond
Agent D's existing detection-only role, image signing/SBOM enforcement.

## Remaining risks

- Ollama runs the 4B model CPU-only in this environment (no GPU) —
  individual inference calls can take 100s+ under load, which can push a
  multi-iteration agent task close to or past `AGENT_TASK_TIMEOUT_MS`'s
  300s default during heavy concurrent use. Pre-existing, not introduced
  by this pass; worth knowing when running back-to-back demos.
- The model's own tool-calling-discipline flakiness (nudged but still
  describes-instead-of-calls a tool) remains a real, already-documented
  characteristic of the small model — retry-recoverable, not a defect
  this pass could or should fix.

## Overall result

**PASS.** Every accepted demo-correctness and demo-hardening item for
this cycle — the live auth-bypass fix, Waves 2.5, 4, 5, 6, and 8, and
the re-verification of Waves 1–3 and 7 — is implemented and verified
against the real running system, not merely against a prior pass's own
claim of completion.
