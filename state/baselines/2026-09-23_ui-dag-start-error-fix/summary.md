# Baseline: 2026-09-23_ui-dag-start-error-fix

## Generic summary (from manifest.yaml)

- Purpose: Fixed 'Start Micro-DAG Run does nothing': gateway was discarding factory-api's real 409 error body for a generic message, and dag.vue only console.error'd instead of showing it. Live-verified end-to-end with Playwright: real login, mode switch, error surfaced, reset, successful run start.
- Captured at: 2026-09-23T10:20:22Z (UTC)
- Source commit: `de427df3cf7b1a809ea7e090bf8ef2d5c60fe1d4` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-23_post-02-09-v2-improvements
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
