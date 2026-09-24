# Baseline: 2026-09-24_pre-vault-2.1.1-upgrade

## Generic summary (from manifest.yaml)

- Purpose: Before upgrading Vault Enterprise from 2.1.0-ent to 2.1.1-ent. 2.1.1's changelog names a bug fix that matches the v3 prework spike's exact blocker: auth/token/lookup-self returning 403 for JWT tokens in a non-root namespace (this project runs entirely in the factory namespace). Real Raft snapshots of both vault-s and the main cluster taken via scripts/vault-backup.sh immediately before this baseline.
- Captured at: 2026-09-24T10:10:46Z (UTC)
- Source commit: `7f41e1e1c68024feeabc5507044416cf99218f90` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-24_post-v3-prework
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
