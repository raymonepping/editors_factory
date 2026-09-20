# Baseline: 2026-09-20_root-token-eliminated

## Generic summary (from manifest.yaml)

- Purpose: Root-token elimination (prompts/improvements/01_06_vault_root_token_elimination.md). New vault-admin policy + scripts/vault-admin-bootstrap.sh: a single, narrowly-scoped, periodic (30-day) token replacing the cluster root token for every routine Vault operation -- homed in root namespace, reaching into factory via namespace-prefixed policy paths (one token covers both, not two, confirmed live before implementing). Every path and sudo requirement verified live by minting real scoped tokens and testing directly -- only sys/auth/* (mounting an auth backend) needed sudo; mounts, EGPs, ACL policies, and namespace creation did not. Two real gaps found and fixed live during a full from-scratch cluster rebuild: the Vault Terraform provider itself needs auth/token/create for at least vault_egp_policy resources (provider-internal, not resource HCL), and AppRole role-id/secret-id are separate sub-paths not covered by a grant on the exact role path alone. Makefile's infra-configure-vault and scripts/vault-check-entitlement.sh switched to the admin token. Proven end to end on a real wipe-and-reinit of the vault-1/2/3 cluster (not inferred): fresh init -> vault-platform apply with root -> vault-admin-bootstrap -> every subsequent step (secret_id generation, vault-sentinel apply, vault-database apply, entitlement check, a live BAD run issuing a real factory-bad-role lease and firing Agent D's D-005) using only the admin token. Confirmed the token is genuinely narrow: denied vault audit disable, a direct database/creds/factory-bad-role read, and a bare sys/mounts listing. docs/getting-started.md, docs/operations.md, docs/security-model.md updated -- including an honest note that hard-mandatory Sentinel does not constrain the literal root token in this install, which is exactly why routine admin work no longer uses it. Full regression clean: backend 24/24, agents 10/10, ui typecheck+build clean, terraform fmt clean on the changed file. Reset to clean baseline. KV-engine migration for static secrets in .env remains deliberately deferred as its own, larger follow-up (would require wrapping Keycloak's and OpenLDAP's own third-party container entrypoints, not just our own code).
- Captured at: 2026-09-20T12:38:43Z (UTC)
- Source commit: `8bc06394b56e9b896136680fcb5e01364b9f3d7d` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-20_open-findings-fixed
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
