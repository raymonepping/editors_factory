# Baseline: 2026-09-21_agentic-iam-hardening-phase2

## Generic summary (from manifest.yaml)

- Purpose: 01_08 Phase 2: task-scoped Sentinel check. require-agent-c-for-db-creds now also requires factory_task metadata to be present and non-empty on the child token (verified live: denied without it, allowed with it, using factory-api's own real Vault Agent token as parent). Extended vault-audit-crosscheck.py to compare task_id between the app's credential_events and Vault's own audit log, since Sentinel itself can only check presence, not correctness. Live-verified end to end with a real BAD run. Both test suites pass.
- Captured at: 2026-09-21T07:04:23Z (UTC)
- Source commit: `c87fa66dc8880bbfb0a9e8b642f778104d650b42` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-21_agentic-iam-hardening-phase1
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
