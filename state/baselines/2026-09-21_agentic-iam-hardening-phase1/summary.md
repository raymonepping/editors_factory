# Baseline: 2026-09-21_agentic-iam-hardening-phase1

## Generic summary (from manifest.yaml)

- Purpose: 01_08 Phase 1: Vault audit-log cross-check tooling. New scripts/vault-audit-crosscheck.py independently verifies credential_events rows against Vault's own audit log (lease ID match + Sentinel policy confirmed in granting_policies), reading and merging all three Vault nodes' audit logs since only the Raft leader at request time writes locally. Live-verified against real BAD and GOOD runs, both PASS. Documented in docs/operations.md.
- Captured at: 2026-09-21T06:46:44Z (UTC)
- Source commit: `8bd0d3b855736ab4abcad1573ef1368a067acf9f` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-20_vault-kv-secrets-migration-complete
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
