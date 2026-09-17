# Baseline: 2026-09-17_post-backend-orchestrator

## Generic summary (from manifest.yaml)

- Purpose: prompts/backend/01_01_orchestrator_api.md complete: factory-api running as a real container (dual-homed on factory-control + factory-vault-internal, matching arcanium-api's own proven pattern), fully validated end-to-end through the actual container: human->agent-a->agent-b->agent-c delegation chain with correct authority-envelope intersection, Vault Agent-rendered token + agent-c-tagged child-token credential brokering, real GOOD-mode update (via set_order_status function) and denied delete (3-layer defense in depth all independently verified), real BAD-mode DELETE causing actual damage (5 orders + cascaded order_items), make reset restoring both evidence tables/Vault leases (backend-owned) and the product/order catalog (superuser-owned, correctly split responsibilities), and live SSE event streaming. Found and fixed 6 real bugs during this build: (1) delegation authority incorrectly intersected against the delegating agent's own narrower toolset instead of the recipient's fixed ceiling, breaking both agent-b's restart-service capability and agent-c's GOOD-mode update/credential capabilities; (2) Vault child-token metadata used the CLI flag name 'metadata' instead of the actual HTTP API field 'meta', silently producing untagged tokens; (3) a genuine Vault PostgreSQL secrets engine bug where column-level GRANT UPDATE (column) statements are silently dropped from creation_statements, worked around with a SECURITY DEFINER function; (4) missing ON DELETE CASCADE on order_items causing BAD-mode's real delete to fail; (5) sys/leases/revoke policy path mismatch (bare path vs wildcard); (6) the reset handler using the backend's intentionally-restricted factory-backend-role credential to attempt re-seeding tables it correctly cannot touch, fixed by splitting reset into backend-owned (evidence+leases) and superuser-owned (catalog) halves.
- Captured at: 2026-09-17T12:35:28Z (UTC)
- Source commit: `5379ec86e072ab28c9f6c598b97926867934bf49` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-17_post-factory-schema-and-tools
- Overall capture status: **FAILED**

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

- **backend-health**: FAILED — factory-api container running but /health did not respond
- **ollama-model**: PASS — GET /api/tags responded and qwen3:4b-instruct is present
- **mutating-scenarios**: UNKNOWN — not run — mutating scenario requires --with-scenarios

See `manifest.yaml`, `source/`, `runtime/`, `components/`, `verification/` for full evidence.

## Project context

This baseline was captured from a dirty working tree. See `source/git-status.txt` and `source/diff.patch` for the recorded source-state evidence; untracked paths are listed by Git but are not represented in the patch. The purpose and component table above describe the implementation milestone observed during this capture.
