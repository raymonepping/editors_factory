# Baseline: 2026-09-17_post-backend-orchestrator-v2

## Generic summary (from manifest.yaml)

- Purpose: Backend orchestrator API (prompts/backend/01_01_orchestrator_api.md) fully implemented and validated end-to-end (BAD+GOOD mode delegation, credential issuance, Sentinel enforcement, reset cycle); superseding 2026-09-17_post-backend-orchestrator, whose backend-health check hit a wrong hardcoded path (/health instead of /api/health) in capture-state.sh itself, not a real backend failure.
- Captured at: 2026-09-17T12:41:22Z (UTC)
- Source commit: `5379ec86e072ab28c9f6c598b97926867934bf49` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-17_post-backend-orchestrator-v2
- Overall capture status: **CAPTURED**

### Components

| Component | Compose file present | Observed running | Capture status |
|---|---|---|---|
| vault | true | true | CAPTURED |
| infra | true | true | CAPTURED |
| ollama | true | true | CAPTURED |
| api | true | true | CAPTURED |
| agents | true | false | CAPTURED |
| ui | true | false | CAPTURED |

### Verification

- **backend-health**: PASS — GET /api/health responded
- **ollama-model**: PASS — GET /api/tags responded and qwen3:4b-instruct is present
- **mutating-scenarios**: UNKNOWN — not run — mutating scenario requires --with-scenarios

See `manifest.yaml`, `source/`, `runtime/`, `components/`, `verification/` for full evidence.

## Project context

This baseline was captured from a dirty working tree. See `source/git-status.txt` and `source/diff.patch` for the recorded source-state evidence; untracked paths are listed by Git but are not represented in the patch. The purpose and component table above describe the implementation milestone observed during this capture.
