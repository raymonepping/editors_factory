# Baseline: 2026-09-22_post-v2-02-06-frontend

## Generic summary (from manifest.yaml)

- Purpose: After 02_06: Nuxt DAG visualizer, attempt drawer, workflow control bar — live-verified in a real browser via Playwright/Keycloak, full v2 run rendering live with the genuine SHA-256 evidence-hash verification badge; fixed input_evidence never being persisted and a silent no-op start-button bug found during testing
- Captured at: 2026-09-22T16:40:20Z (UTC)
- Source commit: `a16026cf63b860ae232b02ee6cb4fd3eb4ffc30e` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_pre-v2-02-06-frontend
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
