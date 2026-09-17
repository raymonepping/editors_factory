# Baseline: 2026-09-17_post-credential-ttl-fix

## Generic summary (from manifest.yaml)

- Purpose: Fixed a real bug found via live testing after 2026-09-17_post-backend-orchestrator-v2: Vault cascade-revokes a dynamic database credential's lease when the child token that requested it expires, and the backend was minting that child token with a flat ttl=60s for every role, silently killing the backend's own 1h pool credential and Agent C's factory-bad-role/factory-good-role credentials ~60-75s after issuance regardless of their configured TTL. Fixed in backend/src/vault.js by matching the child token's TTL to the target role's own TTL (DB_ROLE_TOKEN_TTL_SECONDS). Verified end-to-end: backend pool credential now stable for 15+ minutes; a factory-bad-role credential survived 90s+ and performed a real DELETE; factory-good-role credential issuance + correct policy DENY still work. Full BAD+GOOD delegation chains re-verified, make reset re-verified.
- Captured at: 2026-09-17T12:54:00Z (UTC)
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
