# Improvement Baseline — 01.02

Captured before any Phase 1–5 change, per `prompts/improvements/01_02_improvement.md` Section 5.

## Repository state

Git repository, branch `main`, 34 files uncommitted from the `01_01`
pass (all reviewed and verified in `docs/validation/IMPROVEMENT_REPORT.md`).
Latest commit: `fc89e38`.

## Stack health

All 16 Factory containers healthy (`make status`), no restarts pending.

## Test baseline

```text
backend: 24/24 passing (node --test --test-concurrency=1)
agents:   5/5 passing (node --test)
```

## Confirmed gaps (re-verified directly against source, matching Section 3 of the prompt)

- `backend/src/auth/index.js:90` — `sessions.username` is populated from
  `claims.preferred_username || claims.sub`; no separate stable-subject
  column exists.
- `backend/src/migrations/002_evidence.sql` — `delegations.delegation_id`
  is a primary key referenced nowhere else in the schema.
- `agents/src/runtime.js`'s `runLoop` returns silently on its natural
  stop condition; no route exists for an agent to report task
  completion. `services/revocation.js`'s triggers are limited to policy
  denial, profile switch, and reset (confirmed by reading every call
  site of `cleanupTaskCredentials`/`cleanupRunCredentials`).
- `ui/app/types/factory.ts`'s `CredentialEvent` interface has no
  `renewal_count`/`last_renewed_at` fields; `CredentialLedger.vue` does
  not reference either name.
- No dashboard component exists that reconstructs a human-readable
  causal narrative; `EventTimeline.vue` is a raw per-type row log.

This confirms Section 3's list was accurate — proceeding to Phase 1.
