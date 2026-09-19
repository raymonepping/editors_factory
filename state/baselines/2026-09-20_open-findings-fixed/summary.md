# Baseline: 2026-09-20_open-findings-fixed

## Generic summary (from manifest.yaml)

- Purpose: Fixed 4 of the 5 open findings from 01_03: (1) npm --prefix ui run typecheck crashed outright on a vue-router v4/v5 mismatch -- removed the redundant top-level vue-router dependency (Nuxt bundles v5 internally, app only used auto-imported composables), fixed 5 real type errors it then surfaced in AppSidebar.vue, now exits 0. (2) Agent D's classify() matched credential_events on vault_role alone, re-firing D-005/D-004b on every later re-broadcast of the same credential (issuance/renewal/revocation all publish the full row) -- observed 3x D-005 for one credential in a run; also made D-008 unreachable dead code. Fixed to match only on genuine first issuance; added agents/test/agent-d-classify.test.js (5 new tests, 10/10 agent tests total). Verified live: exactly one D-005 fired in a fresh run. (3) POST /api/demo/reset could race a concurrently-writing agent-d under READ COMMITTED (1/5 flaky). Reset's DELETE batch now runs at REPEATABLE READ; 8/8 clean backend test runs afterward. (4) Backend Postgres credential going stale after a long run with no auto-recovery -- GET /api/health now triggers an immediate out-of-band renewal (db.js's new renewNow) the moment db.ok is false, and every renewal attempt is now logged. docs/troubleshooting.md updated to describe the new self-healing behavior. NOT fixed, by design: the model never choosing destructive deletion over quarantine across 8+ live runs -- investigated agent-c.js's system prompt and found it already deliberately, explicitly neutral ('Neither is the safe choice to default to'), so this is genuine model behavior, not a prompt bug, and forcing it would corrupt the demo's own honesty. Full regression sweep clean: backend 24/24, agents 10/10, ui typecheck exit 0, ui build clean, live BAD run verified end to end. Reset to clean baseline.
- Captured at: 2026-09-19T23:12:54Z (UTC)
- Source commit: `0f1e73a2728c399d2037b172bc6a005546d3d5e7` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-20_agent-identity
- Overall capture status: **CAPTURED**

### Components

| Component | Compose file present | Observed running | Capture status |
|---|---|---|---|
| vault | true | true | CAPTURED |
| infra | true | true | CAPTURED |
| ollama | true | true | CAPTURED |
| api | true | true | CAPTURED |
| agents | true | true | CAPTURED |
| ui | true | true | CAPTURED |

### Verification

- **backend-health**: PASS — GET /api/health responded
- **ollama-model**: PASS — GET /api/tags responded and qwen3:4b-instruct is present
- **mutating-scenarios**: UNKNOWN — not run — mutating scenario requires --with-scenarios

See `manifest.yaml`, `source/`, `runtime/`, `components/`, `verification/` for full evidence.

## Project context

This baseline was captured from a dirty working tree. See `source/git-status.txt` and `source/diff.patch` for the recorded source-state evidence; untracked paths are listed by Git but are not represented in the patch. The purpose and component table above describe the implementation milestone observed during this capture.
