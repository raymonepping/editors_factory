# Baseline: 2026-09-17_post-vault-followup

## Generic summary (from manifest.yaml)

- Purpose: prompts/base_project/02_02_vault_follow_up.md complete: factory Vault namespace, factory-api AppRole (terraform/vault-platform/), two Sentinel EGPs (terraform/vault-sentinel/: require-agent-c-for-db-creds, protect-audit-devices), Vault Agent auto-auth (compose/vault/vault-agent/) all applied and running/healthy. Revised prompts/base_project/03_01 and prompts/backend/01_01 for namespace-awareness and the Sentinel header requirement before either was executed. Found and fixed a real operational gotcha (vault-s comes back sealed after any force-recreate, cascades to vault-1/2/3 restart-looping) and a real .gitignore bug (.terraform.lock.hcl was excluded, contradicting Terraform's own guidance to commit it) inherited from arcanium's same boilerplate. Namespaces/Sentinel/Vault Agent added per explicit project-owner decision after reviewing two AI validation reports (input/VALIDATION.md, input/Navi_Validation.md).
- Captured at: 2026-09-17T10:04:01Z (UTC)
- Source commit: `5379ec86e072ab28c9f6c598b97926867934bf49` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-17_post-vault-bootstrapped
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
