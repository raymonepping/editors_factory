# Baseline: 2026-09-17_post-ollama-model-runtime

## Generic summary (from manifest.yaml)

- Purpose: prompts/base_project/04_01_ollama_model_runtime.md complete: shared factory-ollama runtime running healthy on factory-control with qwen3:4b-instruct, persistent factory-ollama_data model storage, idempotent model pull, documented API contract for agents A/B/C/D, and verified structured tool calling. Existing Vault HA cluster, Vault Agent, and PostgreSQL remain healthy. Corrected the state capture adapter's Vault container-name filter and removed stale initial-project boilerplate from generated summaries; prior immutable baselines were not modified.
- Captured at: 2026-09-17T10:45:32Z (UTC)
- Source commit: `5379ec86e072ab28c9f6c598b97926867934bf49` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-17_post-postgres-dynamic-creds
- Overall capture status: **CAPTURED**

### Components

| Component | Compose file present | Observed running | Capture status |
|---|---|---|---|
| vault | true | true | CAPTURED |
| infra | true | true | CAPTURED |
| ollama | true | true | CAPTURED |
| api | true | false | CAPTURED |
| agents | true | false | CAPTURED |
| ui | true | false | CAPTURED |

### Verification

- **backend-health**: UNKNOWN — not run — factory-api is not running
- **ollama-model**: PASS — GET /api/tags responded and qwen3:4b-instruct is present
- **mutating-scenarios**: UNKNOWN — not run — mutating scenario requires --with-scenarios

See `manifest.yaml`, `source/`, `runtime/`, `components/`, `verification/` for full evidence.

## Project context

This baseline was captured from a dirty working tree. See `source/git-status.txt` and `source/diff.patch` for the recorded source-state evidence; untracked paths are listed by Git but are not represented in the patch. The purpose and component table above describe the implementation milestone observed during this capture.
