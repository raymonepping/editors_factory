# Baseline: 2026-09-20_kv-secrets-phase1-2

## Generic summary (from manifest.yaml)

- Purpose: Vault KV v2 secrets migration Phase 1-2: backend static secrets (agent bearer tokens, JWT signing secret, CLI operator token, OIDC client secret) moved from .env to Vault KV, backend loads them at startup via loadSecretsFromVault(), agent containers stay Vault-blind and are kept in sync via scripts/agents-secrets-sync.sh. Live-verified end to end (demo-bad run produced D-001..D-005 + a real factory-bad-role lease); both test suites pass.
- Captured at: 2026-09-20T14:05:03Z (UTC)
- Source commit: `27d5daca56f3b70b959a613feb83e0b595fff43b` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-20_root-token-eliminated
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
