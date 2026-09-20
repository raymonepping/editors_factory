# Operations

The Makefile is the supported control surface for routine local operation. Run commands from the repository root.

## Lifecycle commands

```sh
make help
make check
make status
make up
make down
```

`make up` starts `vault`, `infra`, `identity`, `ollama`, `api`, `agents`, and `ui` in dependency order. `make down` stops them in reverse order. Each stack also has `*-up`, `*-down`, and `*-logs` targets. The identity stack additionally has `make identity-bootstrap`, a one-shot OpenLDAP seed and Keycloak realm import — see [Getting started](getting-started.md#bootstrap-identity-openldap-and-keycloak).

Useful inspection targets are:

```sh
make ps
make images
make volumes
make storage
make compose-config
```

## Service endpoints

| Service | Host endpoint |
| --- | --- |
| Dashboard | `http://localhost:3000` |
| Factory API | `http://localhost:3001` |
| Keycloak OIDC Broker | `http://localhost:8088` |
| phpLDAPadmin | `http://localhost:8085` |
| Ollama | `http://localhost:11434` |
| PostgreSQL | `127.0.0.1:5432` |
| Vault active entry point | `https://127.0.0.1:18200` |
| Vault peers | `https://127.0.0.1:18201`, `https://127.0.0.1:18202` |
| Transit-seal Vault | `https://127.0.0.1:18190` |

All published ports bind to localhost.

## Health checks

```sh
make vault-status
curl -fsS http://localhost:3001/api/health | jq
curl -fsS http://localhost:3001/api/factory-state | jq
curl -fsS http://localhost:11434/api/tags | jq
```

The API health response checks its Vault connection and its Vault-issued backend database credential. A 503 response is actionable even if the API container itself is running.

Do not use `scripts/verify-stack.sh` as a Factory health check. The repository retains it as arcanium reference code, and the script identifies itself as not adapted.

## Logs

```sh
make vault-logs
make infra-logs
make ollama-logs
make api-logs
make agents-logs
make ui-logs
```

The targets follow logs. Press Control-C to stop following; the containers continue running.

## Reset

```sh
make reset
```

Reset requires a reachable API and PostgreSQL container. It revokes active demo leases, clears evidence, starts a fresh run, and reapplies the seed data. It does not rebuild images, recreate Vault, or pull the model again.

Use reset before switching from BAD to GOOD when comparing results.

## Database maintenance

Migrations are ordered SQL files under `backend/src/migrations/` and are designed for repeat application:

```sh
make infra-migrate
make infra-seed
```

`make infra-seed` replaces the domain dataset with the known demonstration baseline. It is a data-changing operation.

Reapply Vault database configuration after changing database roles or grants:

```sh
make infra-configure-vault
```

## Vault maintenance

Check seal and leader state:

```sh
make vault-status
```

After a Podman machine or host restart, use:

```sh
make vault-unseal
```

The unseal script reads ignored local recovery material. Never copy that material into logs, issues, or state captures.

Routine Vault administration — every `terraform apply` after the first,
and `scripts/vault-check-entitlement.sh` — uses a narrow, periodic
`vault-admin` token (`.secrets/vault/vault-admin-token`), not the cluster
root token. It is good for 30 days at a time and must be renewed, not
reissued, before it expires:

```sh
VAULT_TOKEN="$(cat .secrets/vault/vault-admin-token)" vault token renew
```

If the file is missing or the token has expired past recovery, mint a
replacement (idempotent, safe to re-run):

```sh
make vault-admin-bootstrap
```

The root token itself is reserved for `vault operator init`, the first
`terraform -chdir=terraform/vault-platform apply` on a fresh cluster (the
one operation that creates the `vault-admin` policy in the first place),
and re-applying that same policy's own content — see
[Getting started](getting-started.md#bootstrap-vault) for why that one
case stays root-only.

Terraform state under `.secrets/terraform/` can carry sensitive values
depending on the resource. `terraform apply` recreates each state file at
the process umask's default permissions, so tighten them again after any
apply:

```sh
chmod 600 .secrets/terraform/*.tfstate
```

A backup helper is available:

```sh
./scripts/vault-backup.sh
```

Do not use `scripts/vault-restore-drill.sh`. It is inherited arcanium
reference code, not adapted for Factory: it depends on
`compose/vault/compose.restore-drill.yaml`, which does not exist in this
repository, targets an arcanium-specific Transit key and namespace, and
writes to a `restore_drill_results` table that is not in this project's
schema.

Read each script's usage before running it. A restore drill creates and manipulates Vault data and should not be run during a demonstration.

## Rebuild changed components

Compose stack starts build local images when required. The UI also has a dedicated rebuild target:

```sh
make ui-build
```

For source-level checks outside containers:

```sh
npm --prefix backend test
npm --prefix agents test
npm --prefix ui run typecheck
npm --prefix ui run build
```

Install each package's dependencies first if its `node_modules` directory is absent.

## State captures

Milestone captures under `state/baselines/` contain redacted structure, validation results, and operator notes. `state/CURRENT` names the latest capture. Before recording a new milestone, verify that the capture script's secret scan passes.

State captures document progress. They are not backups of Vault, PostgreSQL, or container volumes.
