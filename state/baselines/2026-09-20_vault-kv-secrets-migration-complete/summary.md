# Baseline: 2026-09-20_vault-kv-secrets-migration-complete

## Generic summary (from manifest.yaml)

- Purpose: prompts/improvements/01_07_vault_kv_secrets_migration.md complete (all 5 phases). Every static secret formerly in .env (per-agent bearer tokens, JWT signing secret, CLI operator token, OIDC client secret, OpenLDAP/Keycloak admin passwords) now has Vault KV v2 as its source of truth, delivered via three distinct mechanisms matching each consumer's trust level: factory-api reads directly from Vault at startup; agent containers stay Vault-blind and receive their token via a host-side sync script; OpenLDAP/Keycloak (third-party images) receive theirs via a dedicated identity-secrets-init container using a separate, narrower AppRole. Found and fixed two real bugs live: a Keycloak client-secret sync no-op in setup_keycloak.sh, and a Vault namespace double-scoping bug in the new vault-secrets-bootstrap script. Documentation (getting-started, operations, security-model, authority-model) and .env/.env.example fully updated to match. Fully live-verified: real LDAP bind, real Keycloak admin login, real human OIDC login through the dashboard, full identity-bootstrap rebuild, and multiple live BAD+GOOD demo runs all completing end to end with real credential leases. Both test suites pass.
- Captured at: 2026-09-20T16:08:42Z (UTC)
- Source commit: `587c6dab7f5fc7ce2866e9250e9620c10b152981` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-20_kv-secrets-phase3-4
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
