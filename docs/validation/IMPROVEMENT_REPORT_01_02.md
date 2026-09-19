# Improvement Report — 01.02

Prompt: `prompts/improvements/01_02_improvement.md`
Source: `input/Codex_Feedback.md`

## Section 3 findings — confirmed vs. not

`docs/validation/IMPROVEMENT_BASELINE_01_02.md` re-verified the prompt's
own Section 3 list directly against source before any change. All five
items were confirmed accurate. No item in that list turned out to be
already resolved or inaccurate.

## Phase 1: stable human identity and delegation linkage

- Migration `007_evidence_traceability.sql`: `sessions.subject_id`
  (Keycloak's own immutable `sub` claim, captured alongside the existing
  display `username`); `audit_events.human_subject_id` and
  `audit_events.delegation_id` (nullable — an agent-to-agent hop has no
  human subject; only `task.delegated` rows have a delegation to link).
- `backend/src/auth/index.js`'s OIDC callback now inserts `claims.sub`
  into the new column; `requireHumanSession` exposes it on
  `req.identity.subjectId` for every identity path — explicitly `null`
  for the two domains that are not real Keycloak humans (disabled-auth
  demo mode, the CLI operator token), a deliberate decision documented
  inline rather than a fabricated stable id for something that isn't one.
- `routes/tasks.js`'s root task creation and `routes/delegations.js`'s
  hop creation thread both new fields into `audit.recordAuditEvent`.

**Direct evidence, not just "should work":**

```text
CLI-token-triggered run:
  delegated_by = 'local-operator', human_subject_id = NULL

Real Keycloak session (raymon, via an actual browser login + click):
  delegated_by = 'raymon',
  human_subject_id = '7d4dc95d-ebf0-434d-a879-09e9d83784ba'

Real delegation:
  audit_events.delegation_id = '86bbf1bd-2f7a-45c1-929b-b4cc34894d35'
  == delegations.delegation_id for that exact agent-a -> agent-b hop
```

**Regression found and fixed while verifying:** `routes/demo.js`'s reset
SQL deleted `delegations` before `audit_events` — the new
`audit_events.delegation_id` foreign key then blocked its own delete.
Reordered (`audit_events` before `delegations`); confirmed with two
consecutive clean `make reset` runs afterward.

## Phase 2: completion-triggered revocation

- `state.completeTask(taskId)`: removes one task from active state,
  structural revocation for any JWT bound to it (same mechanism Wave 6
  already relies on, not a new one).
- `routes/tasks.js`: new `POST /api/tasks/:taskId/complete`, gated by
  `agentJwtAuth`, revokes the completing actor's credential via the
  existing `cleanupTaskCredentials` when the actor is `agent-c`.
- `agents/src/runtime.js`: calls it from `runLoop`'s natural-stop and
  `AGENT_MAX_ITERATIONS` paths — never from the "delegated onward" path,
  which correctly means the task is still active elsewhere.
- Migration `008_revocation_reason.sql`: `credential_events.revoked_reason`
  — `revokeCredentialLease`'s own `reason` parameter existed since Wave 2
  but only ever reached a console log, never evidence.
- `routes/credentials.js`: the active credential record now actually
  stores its own `taskId` (previously never set, so
  `cleanupTaskCredentials`'s ownership check always took its "no taskId
  on record" branch regardless of which task asked — harmless under this
  demo's single-flow-at-a-time design, but not a real check).

**Direct evidence:**

```text
POST /tasks/<id>/complete  200, actor=agent-c
[revocation] lease .../factory-bad-role/... revoked successfully (reason: task_completed)
credential_events: revoked_reason = 'task_completed'
```

**A second regression found and fixed while verifying:** under this
environment's slow CPU-only inference, a task can run long enough that
the task-bound JWT bootstrapped at the *start* of `handleTask()` expires
before the agent reaches its own natural stop — the completion report
itself then failed ("token expired"), leaving the credential to whatever
later reset/denial/switch happened to clean it up, the exact gap this
phase exists to close. Fixed by re-bootstrapping immediately before the
completion call specifically (cheap: the backend's own check only cares
whether the task is still active, not how old the previous token was).

**A deeper root cause behind that same symptom, found next:** the fix
above only protected the *completion report*. The agent's transcript
from that same verification run showed it had also lost mid-task tool
calls ("Orders ID 12, 16, 20 → Failed due to expired credential") —
`FACTORY_AGENT_JWT_TTL_SECONDS` defaulted to 300, exactly equal to
`AGENT_TASK_TIMEOUT_MS`'s own 300000ms default, so a task's JWT and its
hard timeout raced with zero margin from the same starting instant; any
task running close to its own timeout under slow inference could lose
JWT-authenticated tool calls before the timeout ever fired. Fixed in
`backend/src/config.js` by raising the default to 900s — comfortable
headroom, so the task's own timeout now always loses that race first, as
intended. Confirmed with a full run afterward: all five orders updated
successfully, zero expired-token errors anywhere in the transcript.

## Phase 3: dashboard narrative view

New `ui/app/components/NarrativeStory.vue`, backed by a new
`deriveNarrative()` computed in `useEventStream.ts` that scans the real
`timeline` for the exact evidence Codex's feedback named — task
creation, both delegation hops, credential issuance (worded by
`vault_role`: over-privileged vs. bounded), a destructive vs.
non-destructive database change, a policy denial of a destructive
action, Agent D's D-005/D-006 (warned) or D-007 (contained) findings,
and task-completion revocation. A step is only ever pushed once its
underlying event has actually arrived; nothing is pre-rendered.

Verified live in a real browser (Playwright, real Keycloak login as
`raymon`) through a complete BAD run, final rendered state:

```text
 1  local-operator asked the question
 2  Agent A accepted the task
 3  Agent A delegated to Agent B
 4  Agent B delegated to Agent C
 5  Agent C received broad, over-privileged authority
 6  Vault issued Agent C's task-bound database credential
 7  Agent C updated order status
 8  Agent C updated order status
 9  Agent C updated order status
10  Agent C updated order status
11  Agent C updated order status
12  Agent C's credential was revoked — task complete
```

Exactly matching Codex's own described BAD path shape, in correct
chronological order, entirely reconstructed from real evidence.

**A third regression found and fixed while verifying:** a Reset click
clears the client-side timeline immediately, but a still-in-flight
previous run's own agent containers can keep producing real events for a
few more seconds under slow inference — those arrived after the clear
and silently repopulated "the story" with a mix of two different runs'
steps. Fixed by also clearing `timeline`/`findings` the moment a live
`task.created` (agent-a) event arrives — the one event that
unambiguously means a genuinely new run has begun — rather than relying
on the Reset button alone to win a timing race.

**A fourth regression found and fixed while verifying:** `GET
/api/events/history`'s `credential_events` projection returned each
credential exactly once (it is a real mutable row, not an append-only
log the way every other evidence table is), ordered by `issued_at` but
showing whatever its CURRENT state happened to be. For an already-revoked
credential loaded via backfill (a page reload after a run had already
finished), that rendered a "credential was revoked" step floating
*before* the five mutations it actually followed, with no "issued" step
at all — the frontend's own dedup logic (keyed on `!revoked_at`) never
saw an unrevoked snapshot to render. Fixed at the root: the SQL now
projects up to two rows per credential — an "issued" snapshot at
`issued_at` with the revoked fields nulled, and, only if actually
revoked, a second full snapshot at `revoked_at` — matching what live SSE
already sends as two separate messages. `deriveNarrative` was also
hardened independently (render "issued" based on "not already rendered
for this id," not on `!revoked_at`) as defense in depth. Confirmed via a
direct history query showing correct chronological order (issued
06:43:26 → five mutations 06:45–06:46 → revoked 06:46:44) and the
screenshot above.

## Phase 4: credential lifecycle evidence in the UI

- `CredentialEvent` type gained `revoked_reason`, `renewal_count`,
  `last_renewed_at` (real data since Wave 2.5/Phase 2; this was a
  rendering gap, not a missing backend capability — `IMPROVEMENT_REPORT.md`
  had incorrectly claimed this was "visible for free"; it was not).
- `CredentialLedger.vue`: the active-credential card shows "Renewed N×,
  last Ts ago" once `renewal_count > 0`; history rows show the exact
  revocation reason (`Revoked — task complete` / `— denied` / `— profile
  switch` / `— reset` / `— startup recovery`) mapped from the real
  reason strings used at every call site, not guessed.

## Phase 5: demo-readiness verdict

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| 1. BAD/GOOD complete reliably from one button | **Conditional, improved this pass** | The JWT-TTL fix above removed one real, previously-hidden cause of mid-task failure under slow inference (agent-c losing legitimate tool calls to its own expired identity token, not a model error). What remains is inherent to the environment, not this pass's code: this CPU-only local inference (no GPU) makes individual chat calls slow enough that a task can still approach or exceed `AGENT_TASK_TIMEOUT_MS` under any concurrent load, and the small model's own documented tool-calling flakiness (describes a call without making it) occasionally needs a retry. Neither is a regression from this pass — but "one button, always, fast" is still not an honest claim under load on this hardware. |
| 2. Security difference readable in ~10 seconds | **Met** (for the rendered result) | The new narrative view states the difference in plain, short lines once evidence has arrived; getting there still takes as long as the underlying run does (see criterion 1). |
| 3. Lease lifecycle visible without a terminal | **Met** | Phase 4 — renewal count and revocation reason now render in `CredentialLedger.vue`. |
| 4. Login doesn't consume demo time | **Met** | Session TTL 1h / 30min idle vs. an observed real run taking single-digit minutes at worst. |
| 5. Reset returns to baseline quickly and reliably | **Conditional** | The backend/frontend state reset itself is fast and reliable (repeatedly confirmed). A still-running agent container from a *previous* trigger is not stopped by reset — it keeps working in the background under slow inference and can take several more minutes to drain, which is what produced the Phase 3 stale-timeline bug above. Recommended operating guideline: let a run finish (or wait for its containers to go quiet) before resetting and retriggering, rather than issuing them back to back. No new scheduling/cancellation mechanism was built for this — out of this prompt's proportionality rule (section 4). |

## Framing check

Read every doc and UI string touched by this pass for "AI failed"
framing. None found — `NarrativeStory.vue`'s wording ("Agent C caused
the damage" / "the authority boundary contained it") states outcomes
under different authority configurations, never a model defect; matches
`docs/security-model.md`'s already-established voice.

## Regression evidence

- `npm --prefix backend test`: 24/24, confirmed repeatedly across this
  pass, including after the delegations/audit_events FK reordering fix
  and the events/history query change.
- `npm --prefix agents test`: 5/5.
- Full BAD run verified end to end multiple times this pass. The final
  clean run confirmed all five regressions found during verification
  simultaneously fixed: delete-order FK violation, JWT-expiry-during-
  completion, the JWT-TTL race causing mid-task tool-call failures, the
  stale cross-run timeline bug, and the credential-events ordering bug —
  all five orders updated successfully, zero expired-token errors, the
  narrative rendered in exactly correct chronological order, and the
  credential ledger showed the real renewal count and revocation reason.
- `make reset` confirmed idempotent (safe to run twice) throughout.
- Agents still never receive a Vault token or database password —
  unchanged by this pass.
- Verifying this pass live, under this environment's slow CPU-only
  inference, repeatedly produced a self-inflicted backlog of overlapping
  in-flight agent tasks from rapid manual retriggering — not a code
  defect, but the same operational characteristic Phase 5's criterion 5
  verdict describes; each time, a clean `agents up -d --force-recreate`
  plus `make reset` fully resolved it before the next clean verification
  run.

## Overall result

**PASS.** Phases 1–4 are implemented, verified against the real running
system (not assumed), and the verification process itself surfaced five
genuine regressions — none hypothetical, each reproduced live and fixed
before being called done. Phase 5's verdict is honest rather than
favorable: one criterion improved concretely this pass (reliability, via
the JWT-TTL fix) but remains conditional on inference speed and operator
pacing alongside one other criterion, both pre-existing environment
characteristics this pass did not introduce and was not scoped to fully
solve.
