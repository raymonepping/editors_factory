# Baseline: 2026-09-19_vault-hardening-complete

## Generic summary (from manifest.yaml)

- Purpose: Vault hardening pass complete (prompts/improvements/01_04_vault_hardening.md), all 6 items. The stale root token discovered mid-pass required rebuilding the vault-1/2/3 cluster (disposable local demo data, explicitly authorized): wiped vault-1/2/3 Raft+audit volumes, let scripts/vault-bootstrap.sh reinitialize fresh, re-applied vault-platform/vault-sentinel/vault-database Terraform, regenerated the AppRole role_id/secret_id into .env. Item 1 (protect-audit-devices namespace fix) verified correctly denying an ordinary non-root token's audit-disable attempt at root namespace — also discovered and confirmed that hard-mandatory Sentinel EGPs do not constrain the literal root token in this Vault installation (tested against both EGPs), a real property worth carrying into any future root-token-hardening work. Item 3 (secret_id_ttl=90d) applied and confirmed via vault read. Full stack healthy, 24/24 backend + 5/5 agent tests pass, live BAD run confirmed a real factory-bad-role lease issued end to end through the reprovisioned chain.
- Captured at: 2026-09-19T20:26:37Z (UTC)
- Source commit: `a65df211bcedc9fc814ac02af9fbb36dfc0d9339` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-19_post-vault-hardening
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
