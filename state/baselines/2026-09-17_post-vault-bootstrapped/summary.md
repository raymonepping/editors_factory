# Baseline: 2026-09-17_post-vault-bootstrapped

## Generic summary (from manifest.yaml)

- Purpose: prompts/base_project/02_01_vault_ha_cluster.md fully validated: vault-s + vault-1/2/3 running, initialized, unsealed (transit auto-unseal), Raft-healthy (3 voters, vault-1 leader), primary/ audit device active. Fixed three live bugs found during bring-up: missing vault-s/policies/autounseal.hcl, a Makefile vault-up sequencing race (redundant compose up -d before vault-bootstrap.sh corrupted .secrets/vault/transit-token into a directory), and a real false-positive bug in state/scripts/validate-state.sh itself (whole-file-as-grep-pattern matched trivial JSON punctuation across every captured file). Also fixed a real .gitignore gap: *.hclic/vault-tls/ were not excluded before this run.
- Captured at: 2026-09-17T09:43:55Z (UTC)
- Source commit: `5379ec86e072ab28c9f6c598b97926867934bf49` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-17_post-vault-ha-cluster
- Overall capture status: **CAPTURED**

### Components

| Component | Compose file present | Observed running | Capture status |
|---|---|---|---|
| vault | true | false | CAPTURED |
| infra | true | false | CAPTURED |
| ollama | true | false | CAPTURED |
| api | true | false | CAPTURED |
| agents | true | false | CAPTURED |
| ui | true | false | CAPTURED |

### Verification

- **backend-health**: UNKNOWN — not run — factory-api is not running
- **mutating-scenarios**: UNKNOWN — not run — mutating scenario requires --with-scenarios

See `manifest.yaml`, `source/`, `runtime/`, `components/`, `verification/` for full evidence.

## Project context

This baseline was captured while `prompts/`, `scripts/`, `security/`, and `input/` were still untracked (new project scaffolding from the design phase — see `README.md` and `security/README.md`). No infrastructure has been implemented yet; every component above is honestly absent. This is expected for an initial baseline of a project still being assembled from its own prompts.
