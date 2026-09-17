# Baseline: 2026-09-17_post-factory-schema-and-tools

## Generic summary (from manifest.yaml)

- Purpose: prompts/api/01_01_factory_schema_and_tools.md complete: backend/src/migrations/001_init.sql + 002_evidence.sql applied to factory-postgres (12 tables total), scripts/seed.sql applied and confirmed idempotent (40 products, 5 suppliers, 60 inventory rows, 20 orders with 5 already inconsistent, 30 order_items). prompts/api/API_CONTRACTS.md documents the full typed tool contract (/api/actions/* with /tools/* aliases) that prompts/backend/01_01_orchestrator_api.md will implement. Actual HTTP-level validation (curl against a running API) deferred to backend/01_01 since no server exists yet — this prompt's own scope was schema/seed/contract only, validated directly via psql.
- Captured at: 2026-09-17T12:08:32Z (UTC)
- Source commit: `5379ec86e072ab28c9f6c598b97926867934bf49` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-17_post-ollama-model-runtime
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
