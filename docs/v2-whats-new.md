# What's new in v2

v1 already made its argument: task delegation and authority delegation are different operations, and scoped, expiring credentials contain damage that broad standing access would permit. v2 does not change that thesis. It answers a question v1 could not.

## The question that triggered it

`input/tweet.md` is a five-part thread about agentic authority risk, and the reply that mattered came from `@classicmateon`:

> Curious how you handle partial failures, does the whole DAG restart or just the failed branch?

The honest answer at the time: v1 uses a fixed human → Agent A → Agent B → Agent C handoff. A failed run does not get selectively retried — a clean rerun revokes old leases, resets the system, and issues fresh authority to a brand-new run. There was no way to retry one failed step without discarding the whole run's evidence.

v2 is the built answer to that question.

## The thesis, extended

v1 established "scoped authority contains a wrong action." v2 adds: **retry the work, not the authority.** A failed node gets retried with its own newly issued, newly bounded credential, never a reused or extended one. Recovery means handing an agent the same short leash again, not a longer one.

## What's genuinely new

**A second, additive execution mode.** `demo_runs.workflow_mode` (`fixed_chain` | `recoverable_dag`) and `authority_profile` (`bad` | `good`) are orthogonal per-run controls. v1's fixed chain is unchanged and still the default. v2's recoverable micro-DAG — triage → investigate → {remediate, notify} → verify — runs the same four agents through the same authority model, but as independently claimable, retryable nodes instead of one linear handoff.

**Attempt-scoped credentials.** Every attempt at a node gets its own fresh, Vault-issued credential, revoked the moment that attempt ends — success or failure, both profiles. This is deliberately not profile-branched: application code never decides security-relevant behavior by checking BAD or GOOD (`agents/identities/agent-c.js`'s own header comment says so); Vault policy, Sentinel, and PostgreSQL grants do that differentiating instead. `revokeAttempt()` (`backend/src/services/revocation.js`) runs unconditionally.

**A workflow-mode-aware Sentinel policy.** The same `require-agent-c-for-db-creds` endpoint policy guards credential paths for both modes, and it could not simply add a v2 requirement on top of v1's — v2 has no `task_id` concept at all, so a shared "must have a task" rule would reject every v2 attempt including the first. The policy branches per mode instead: `(fixed_chain AND has_task) OR (recoverable_dag AND has_attempt_fields)`, with `factory_workflow_mode` on every minted child token so Sentinel can tell which branch applies.

**Business-effect idempotency.** A retried node must not double-apply a mutation that actually succeeded before the attempt was reported as failed. Each mutating route claims a ledger row before mutating and checks it before retrying — but ordering here is not free: fault injection has to run *before* that claim, not after, or a deliberately failed first attempt permanently poisons the ledger for an action that never actually happened. This was found live, not designed in from the start — see "What v2 got wrong on the way" below.

**Deterministic fault injection.** `fault_injection_mode` exists so the recovery story is demonstrable on command instead of waiting for a real failure. Three modes: `fail_before_mutation`, `fail_after_mutation`, and `lock_timeout`. The first two are synthetic by design — a thrown error at a chosen point. `lock_timeout` is not: it opens two real PostgreSQL connections on the same agent-issued credential, holds a genuine table lock on one, and lets the other genuinely time out against it under a short `SET LOCAL lock_timeout` — PostgreSQL raises the real error, this code doesn't fabricate one. That mode only produces genuine contention for `factory-bad-role`; `factory-good-role`'s SELECT-only grant cannot take any table lock beyond the automatic `ACCESS SHARE` mode a plain `SELECT` already uses, a real architectural fact confirmed against the live database, not assumed — GOOD-profile attempts get an explanatory synthetic fallback instead.

**A DAG visualizer.** The dashboard's `/dag` view shows the micro-DAG's nodes, their claim/attempt/retry state, and lets an operator trigger a v2 run and watch it live.

## What's explicitly unchanged

v1's fixed chain is still the default and still works exactly as before — v2 is a second engine registered beside it (`backend/src/orchestrator/index.js`), not a replacement. The identity boundaries, the authority-by-agent table, the Control Groups supervised-approval path, and "no agent container ever holds a Vault credential" all hold identically for both modes. Nothing about v1's own demo narrative changed to make room for v2.

## What v2 got wrong on the way

Two corrections worth keeping on record, both found by live testing rather than assumed correct from the design:

- **The Sentinel policy correction** (above): a shared `has_task` requirement would have broken every v2 request, not just retries. Caught only by actually implementing the policy and testing it against a live v2 attempt.
- **The ledger-ordering bug.** `claimBusinessEffect()`, an immediately committed database write, originally ran before `checkFaultInjection()` in all five mutating routes. A fault injected on attempt 1 still claimed the idempotency ledger row even though the mutation never happened; every identical retry after that silently reported "already applied by a prior attempt" for a change that had never occurred. Found by querying PostgreSQL directly after a full retry cycle and seeing an order permanently stuck at its original status despite the API reporting success. Fixed by reordering the check ahead of the claim in all five routes, then re-confirmed live.

## Trying it

See the v2 walkthrough in [Demo guide](demo-guide.md#v2-recoverable-dag-walkthrough) for the guided path, or `make demo-v2-good` / `make demo-v2-bad` from [Operations](operations.md#v2-workflow-mode-and-fault-injection) for the direct route.
