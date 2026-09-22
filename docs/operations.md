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

Before clearing anything, it also runs the [audit cross-check](#verifying-the-evidence-trail-against-vaults-own-audit-log) against whatever run is about to be reset — a discrepancy is printed as a warning, never blocks the reset itself (a reset is often how you recover from a broken state; failing it closed on a verification concern would defeat that). Nothing to check (no run yet, or no credential requested) is silent, not an error.

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

## Verifying the evidence trail against Vault's own audit log

`docs/security-model.md`'s "Preserve the chain of evidence" claims a
reviewer can reconstruct a credential-issuance event two independent
ways — from the application's own `credential_events` rows, and from
Vault's own audit trail — and that the two have to agree. This is a
claim worth actually checking, not just trusting:

```sh
./scripts/vault-audit-crosscheck.py <run_id>
./scripts/vault-audit-crosscheck.py --latest
```

It reads the raw audit log directly off every Vault node's own
container filesystem (only whichever node was Raft leader at the
moment of a given request wrote that entry locally, so it merges all
three rather than assuming leadership stayed on one node for the whole
run), matches each `credential_events` row's `lease_id` against a
Vault audit response entry with the same lease, and confirms the
paired request entry shows the `require-agent-c-for-db-creds` Sentinel
policy as one of its granting policies. A `FAIL` means either a
credential the app recorded was never actually issued by Vault
(impossible under normal operation — worth investigating immediately
if it ever happens), or a credential Vault issued was never recorded
by the app (a gap in the application's own evidence-writing code).
`make reset` now runs this automatically against whatever run it's
about to clear (see [Reset](#reset)), so most of the time you'll see
it happen without asking. Run it manually for a run you haven't reset
yet, or as a one-off sanity check after changing anything in the
credential-issuance path.

## Vault KV secrets rotation

`prompts/improvements/01_07_vault_kv_secrets_migration.md` moved six
static secrets out of `.env` into Vault KV v2 (mount `secret/`, inside
the `factory` namespace). Rotation always starts the same way — write
the new value directly to Vault, using the `vault-admin` token — but
what has to happen *after* that write differs per secret, because each
one has a different consumer:

```sh
export VAULT_TOKEN="$(cat .secrets/vault/vault-admin-token)"
export VAULT_ADDR=https://127.0.0.1:18200
export VAULT_CACERT="$PWD/vault-tls/ca-chain.pem"
export VAULT_NAMESPACE=factory
```

The `secret/` mount requires check-and-set on every write (Vault
posture audit, 2026-09-22 — `terraform/vault-secrets/main.tf`'s
`vault_kv_secret_backend_v2` resource, `cas_required = true`): a write
that doesn't name the version it's replacing is rejected outright,
which is what actually stops a rotation from silently clobbering a
concurrent change. Get the current version first:

```sh
vault kv get -field=version secret/agents/bearer-tokens
```

**Per-agent bearer tokens, JWT signing secret, CLI operator token**
(`secret/agents/bearer-tokens`, `secret/backend/jwt-signing-secret`,
`secret/backend/cli-operator-token`):

```sh
vault kv put -cas=<version from above> secret/agents/bearer-tokens \
  agent_a="$(openssl rand -hex 24)" agent_b=<unchanged> agent_c=<unchanged> agent_d=<unchanged>
```

(`vault kv put` replaces the whole item — pass every field, not just the
one changing, or read the current ones back first and reuse them.) Then:

```sh
make agents-secrets-sync              # only rewrites AGENT_A_TOKEN..D_TOKEN and
                                       # FACTORY_CLI_OPERATOR_TOKEN in .env — the
                                       # only two of these four families .env
                                       # ever holds a copy of
./scripts/compose.sh agents up -d --force-recreate
./scripts/compose.sh api up -d --force-recreate
```

factory-api reads its own copy of all four families straight from Vault
at startup (`backend/src/vault.js`'s `loadSecretsFromVault`), read once,
not hot-reloaded — recreating the `api` container is what actually picks
up a rotated value there, not just rewriting `.env`. `FACTORY_AGENT_JWT_SECRET`
specifically only affects the backend; nothing else needs recreating for
it.

**OIDC client secret** (`secret/identity/oidc-client-secret`): write the
new value, then re-run the Keycloak bootstrap and recreate `api` — this
one genuinely round-trips because `setup_keycloak.sh`'s `ensure_client()`
syncs Vault's current value onto the *existing* client on every run
(`clients/$uuid` update), not only at first creation:

```sh
vault kv put -cas=$(vault kv get -field=version secret/identity/oidc-client-secret) \
  secret/identity/oidc-client-secret value="$(openssl rand -hex 24)"
./scripts/compose.sh identity --profile init run --rm keycloak-bootstrap
./scripts/compose.sh api up -d --force-recreate
```

**OpenLDAP / Keycloak admin passwords** (`secret/identity/ldap-admin-password`,
`secret/identity/keycloak-admin-password`) — **do not assume a container
recreate is enough.** Both images only apply their bootstrap admin
password when their own persisted state is genuinely first-initialized
(confirmed live in `osixia/openldap:1.5.0`'s own `startup.sh`: it gates
the whole password-setting block behind a `slapd-first-start-done`
marker file inside the `ldap-data`/`ldap-config` volumes — a later
restart with a *different* `LDAP_ADMIN_PASSWORD_FILE` value changes
nothing already-bound in the directory). Writing a new value to Vault
KV only changes what `identity-secrets-init` renders next; it does not
retroactively change the running service's actual credential. To
rotate for real:

```sh
vault kv put -cas=$(vault kv get -field=version secret/identity/ldap-admin-password) \
  secret/identity/ldap-admin-password value="$(openssl rand -hex 16)"
```

then change the **live** OpenLDAP admin password to match, using the
old one you still have to authenticate:

```sh
podman exec factory-openldap ldappasswd -x -H ldap://localhost \
  -D cn=admin,dc=factory,dc=local -w '<old password>' \
  -s '<new password, matching what you just wrote to Vault>'
```

For Keycloak's admin password, change it the same way — through the
Admin Console or `kcadm.sh update users/<admin-uuid> -s ...` while
authenticated with the old one — then write the matching value to
`secret/identity/keycloak-admin-password`. This has not been proven
live in this project the way the OpenLDAP case above has; treat it as
the same class of problem (an already-bootstrapped credential, not a
fresh one) rather than assuming a container restart is sufficient.

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
