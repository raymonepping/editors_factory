# Baseline: 2026-09-17_post-postgres-dynamic-creds

## Generic summary (from manifest.yaml)

- Purpose: prompts/base_project/03_01_postgres_dynamic_creds.md complete: factory-postgres running, terraform/vault-database/ applied (database secrets engine + factory-bad-role/factory-good-role, mounted inside the factory namespace). Full stack now: vault-s/1/2/3 + vault-agent + postgres, all healthy. Corrected the require-agent-c-for-db-creds Sentinel EGP from prompt 02_02 mid-execution: the original header-based design was empirically wrong (Sentinel's request object has no HTTP-header access in Vault Enterprise); replaced with a token.metadata-based child-token mechanism and verified end-to-end (untagged token denied, factory_agent=agent-c-tagged child token allowed). All affected prompts and security/authority-model.md updated to describe the corrected, verified mechanism.
- Captured at: 2026-09-17T10:12:53Z (UTC)
- Source commit: `5379ec86e072ab28c9f6c598b97926867934bf49` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-17_post-vault-followup
- Overall capture status: **CAPTURED**

### Components

| Component | Compose file present | Observed running | Capture status |
|---|---|---|---|
| vault | true | false | CAPTURED |
| infra | true | true | CAPTURED |
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
