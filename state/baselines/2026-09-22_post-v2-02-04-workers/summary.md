# Baseline: 2026-09-22_post-v2-02-04-workers

## Generic summary (from manifest.yaml)

- Purpose: After 02_04: agent worker DAG loop (dagWorker.js), evidence reuse, two-level idempotency — live-verified full autonomous run via real Ollama inference, plus direct Level-1/Level-2 idempotency tests
- Captured at: 2026-09-22T16:02:17Z (UTC)
- Source commit: `33e3cb3b0ea5039cfb0ff341877468fc6c966965` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_pre-v2-02-04-workers
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
