# Baseline: 2026-09-22_post-v2-02-03-vault-lifecycle

## Generic summary (from manifest.yaml)

- Purpose: After 02_03: attempt-scoped Vault credentials on retry, Sentinel policy corrected (v2 has no task_id, needed its own branch not an addition to has_task), live-verified full attempt-1/attempt-2 credential lifecycle + watchdog revocation of a real Vault credential; found/fixed a stale vault-agent gap
- Captured at: 2026-09-22T15:41:14Z (UTC)
- Source commit: `770cb318f94d01c5d348686e52bbe1b18a70458c` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_pre-v2-02-03-vault-lifecycle
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
