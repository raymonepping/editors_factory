# Baseline: 2026-09-19_post-vault-hardening

## Generic summary (from manifest.yaml)

- Purpose: Vault hardening pass (prompts/improvements/01_04_vault_hardening.md): fixed protect-audit-devices Sentinel EGP namespace scope (was guarding an empty factory-namespace path, moved to root where the audit devices actually live — not yet applied, blocked, see below), removed inherited vault-seed-users.sh, corrected docs/operations.md's overstated vault-restore-drill.sh claim, removed the vault-check-entitlement.sh TLS-verify bypass, documented the one remaining bypass (BusyBox wget healthcheck) as a checked, deliberate exception, and tightened Terraform state file permissions to 0600. Discovered and left unresolved: the stored root token for the vault-1/2/3 cluster (.secrets/vault/cluster-init.json) is rejected as invalid by the live cluster, confirmed via its own audit log, blocking Terraform admin access — Items 1 and 3 of the hardening prompt could not be applied/verified as a result. Backend 24/24 and agent 5/5 tests pass; API health unaffected.
- Captured at: 2026-09-19T17:16:50Z (UTC)
- Source commit: `568a9758c8cbf67cf6f9b5fae94ad0264d359665` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-18_post-phase-2-lifecycle
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
