# Baseline: 2026-09-22_vault-posture-audit

## Generic summary (from manifest.yaml)

- Purpose: Post-01_08 Vault posture audit: found and fixed a real oversight — control-group-authorizer's AppRole secret_id_ttl was unset (defaulted to 0s, never expires), unlike factory-api's and identity-secrets' own 90-day TTLs. Fixed in Terraform, old unbounded secret_id destroyed and replaced (confirmed live that a role TTL change does not retroactively bound an already-minted secret_id), .env updated, getting-started.md's rotation docs extended to cover all three AppRoles with per-identity restart guidance. Re-verified the full Phase 4 flow end to end with the new credential. Tests pass.
- Captured at: 2026-09-22T11:06:51Z (UTC)
- Source commit: `efd99c1840ed83d1d578399eacaaeffa89b34ee5` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_agentic-iam-hardening-complete
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
