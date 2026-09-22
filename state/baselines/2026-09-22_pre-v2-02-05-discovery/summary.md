# Baseline: 2026-09-22_pre-v2-02-05-discovery

## Generic summary (from manifest.yaml)

- Purpose: Before implementing 02_05: Discovery multi-attempt risk classification (SSE-only, Vault-blind) and Python audit-crosscheck attempt_id extension
- Captured at: 2026-09-22T16:02:38Z (UTC)
- Source commit: `0aaf7d7127646e06d1fa32361b78f24ec48b8f17` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_post-v2-02-04-workers
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
