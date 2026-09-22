# Baseline: 2026-09-22_post-v2-02-00-architecture

## Generic summary (from manifest.yaml)

- Purpose: After 02_00: backend/src/orchestrator/index.js dual-engine contract scaffold, smoke-tested, not yet wired into routes
- Captured at: 2026-09-22T12:48:03Z (UTC)
- Source commit: `9465fe14eb99587c04fae8c9f006675ff9f46710` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_pre-v2-02-00-architecture
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
- **ollama-model**: UNKNOWN — not run — factory-ollama is not running
- **mutating-scenarios**: UNKNOWN — not run — mutating scenario requires --with-scenarios

See `manifest.yaml`, `source/`, `runtime/`, `components/`, `verification/` for full evidence.

## Project context

This baseline was captured from a dirty working tree. See `source/git-status.txt` and `source/diff.patch` for the recorded source-state evidence; untracked paths are listed by Git but are not represented in the patch. The purpose and component table above describe the implementation milestone observed during this capture.
