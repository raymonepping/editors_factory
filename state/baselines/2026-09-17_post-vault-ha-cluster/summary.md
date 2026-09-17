# Baseline: 2026-09-17_post-vault-ha-cluster

## Generic summary (from manifest.yaml)

- Purpose: prompts/base_project/02_01_vault_ha_cluster.md complete: compose/vault/compose.yaml + vault-s/vault-1/2/3 HCL configs + Makefile targets in place. Cluster not yet bootstrapped — Vault Enterprise license files (vault-s/config/*.hclic) are not present locally; vault-prepare.sh correctly refuses to proceed without fabricating them.
- Captured at: 2026-09-17T09:29:00Z (UTC)
- Source commit: `5379ec86e072ab28c9f6c598b97926867934bf49` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-17_post-factory-stack
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
