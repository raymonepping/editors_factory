# Baseline: 2026-09-20_kv-secrets-phase3-4

## Generic summary (from manifest.yaml)

- Purpose: Vault KV v2 secrets migration Phase 3-4: OpenLDAP and Keycloak bootstrap secrets (admin passwords, OIDC client secret) moved from .env to Vault KV via a new identity-secrets-init one-shot container using the narrow identity-secrets AppRole. OpenLDAP uses LDAP_ADMIN_PASSWORD_FILE natively; Keycloak needed a genuine entrypoint wrapper. Fixed a real setup_keycloak.sh bug where the OIDC client secret wasn't actually being applied. Live-verified: real LDAP bind, real Keycloak admin login, real human OIDC login through the dashboard, full identity-bootstrap rebuild, and live BAD+GOOD demo runs all succeeded. Both test suites pass.
- Captured at: 2026-09-20T14:32:28Z (UTC)
- Source commit: `9aab9dbf932abe931130794917a70bb705eaeaae` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-20_kv-secrets-phase1-2
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
