# Getting started

This guide prepares a clean checkout. Existing configured environments can skip to [Start the complete stack](#start-the-complete-stack).

## Prerequisites

Install these tools on the host:

- Podman with a running Podman machine;
- a Compose provider compatible with `podman compose`;
- Terraform 1.6 or newer;
- the Vault CLI;
- Node.js 22 or newer and npm;
- `curl`, `jq`, and OpenSSL;
- valid Vault Enterprise license values and the required `.hclic` files.

The stack is sized for local development. Ollama model loading and four agent processes require several gigabytes of memory.

## Prepare configuration

Copy the environment template:

```sh
cp .env.example .env
```

Set a private `POSTGRES_PASSWORD`. Everything else that looks like a
placeholder secret in `.env.example` — the per-agent bearer tokens,
`FACTORY_CLI_OPERATOR_TOKEN`, `LDAP_ADMIN_PASSWORD`,
`KEYCLOAK_ADMIN_PASSWORD`, `FACTORY_OIDC_CLIENT_SECRET` — is generated
for you later by `make vault-secrets-bootstrap`, once Vault is up: Vault
KV is their source of truth, not a hand-edited `.env` line (see [Bootstrap
Vault](#bootstrap-vault) below). Do not fill those in by hand and do not
commit `.env`.

Place the project-owner supplied license files at:

```text
vault-s/config/vault_v2.hclic
vault-s/config/vault_v2_ent.hclic
```

Set `VAULT_LICENSE` and `VAULT_LICENSE_ENT` in `.env` to the supplied values. Never invent or commit license material.

Confirm the local container runtime:

```sh
make check
make compose-config
```

## Bootstrap Vault

Start and initialize the transit seal and the three-node cluster:

```sh
make vault-up
make vault-status
```

The bootstrap writes recovery material under `.secrets/vault/`. That directory is ignored by Git and must remain private.

Load the root token only into the current shell, for this one apply only —
every later step in this guide uses a narrower token instead (see below):

```sh
export VAULT_TOKEN="$(jq -r '.root_token' .secrets/vault/cluster-init.json)"
terraform -chdir=terraform/vault-platform init -input=false
terraform -chdir=terraform/vault-platform apply
```

That apply creates the `factory` namespace, both AppRoles (`factory-api`
and `identity-secrets` — see below), and — alongside the policies the
API and its agents actually use — a narrow `vault-admin` policy meant to
replace the root token for every routine operation that follows. Mint a
token attached to it now:

```sh
make vault-admin-bootstrap
```

This is idempotent (safe to re-run) and saves the token to
`.secrets/vault/vault-admin-token`, mode 0600. It is periodic — good for
30 days at a time, renewed with `VAULT_TOKEN=$(cat
.secrets/vault/vault-admin-token) vault token renew` — never eternal the
way the root token is. From here on, every command in this guide uses this
token, not root.

Get the role ID and generate the AppRole secret ID for factory-api's own
identity, and then the same for `identity-secrets` — a second, narrower
AppRole that only ever renders OpenLDAP's/Keycloak's admin passwords and
the OIDC client secret (see [Bootstrap identity](#bootstrap-identity-openldap-and-keycloak)):

```sh
export VAULT_TOKEN="$(cat .secrets/vault/vault-admin-token)"
export VAULT_ADDR=https://127.0.0.1:18200
export VAULT_CACERT="$PWD/vault-tls/ca-chain.pem"
terraform -chdir=terraform/vault-platform output -raw factory_api_role_id
terraform -chdir=terraform/vault-platform output -raw identity_secrets_role_id
export VAULT_NAMESPACE=factory
vault write -f auth/approle/role/factory-api/secret-id
vault write -f auth/approle/role/identity-secrets/secret-id
```

Copy the two role IDs and their returned `secret_id`s into
`FACTORY_VAULT_ROLE_ID`/`FACTORY_VAULT_SECRET_ID` and
`IDENTITY_SECRETS_ROLE_ID`/`IDENTITY_SECRETS_SECRET_ID` in `.env`, then
apply the Sentinel endpoint policies:

```sh
unset VAULT_NAMESPACE
terraform -chdir=terraform/vault-sentinel init -input=false
terraform -chdir=terraform/vault-sentinel apply
```

Restart the Vault stack so Vault Agent receives the populated AppRole values:

```sh
make vault-down
make vault-up
```

Do not start all Vault services directly with Compose. `make vault-up` preserves the required transit-token bootstrap order.

Every AppRole's `secret_id` in this project expires after 90 days
(`secret_id_ttl` on the role — `terraform/vault-platform/auth.tf` for
`factory-api` and `identity-secrets`, `terraform/vault-platform/control_groups.tf`
for `control-group-authorizer`), unlike every other credential in this
system, which is short-lived by design. Found live while auditing this
after `01_08`'s own Phase 4 work: setting `secret_id_ttl` on a role
does not retroactively bound a `secret_id` minted before that change —
an already-issued one keeps whatever TTL (or lack of one) it was
minted with. Regenerate before the 90 days elapse by repeating the
relevant `vault write -f auth/approle/role/<role>/secret-id` step
above (using the admin token, not root), updating the matching `.env`
value, and restarting the affected service — `make vault-down && make
vault-up` for `factory-api`'s own AppRole (Vault Agent needs a fresh
login), `./scripts/compose.sh api up -d --force-recreate` for
`control-group-authorizer` (the backend logs in directly, no Vault
Agent involved), and either for `identity-secrets` since it's only
read at `identity-secrets-init`'s own next run.

Seed Vault KV with the per-agent bearer tokens, the JWT signing secret,
the CLI operator token, and the two identity-service admin passwords —
this is the step that generates the values `.env.example` used to ask
you to fill in by hand:

```sh
make vault-secrets-bootstrap
make agents-secrets-sync
```

`vault-secrets-bootstrap` is idempotent: on a fresh cluster it generates
a random value for anything not already in Vault KV; on a re-run it
reads back whatever's already there and reapplies it unchanged, so
running it again is never a silent rotation (see
[Operations](operations.md) for how to actually rotate one of these).
`agents-secrets-sync` then pulls the four agent tokens and the CLI
operator token out of Vault KV into `.env` — the only mechanism that
gets those specific two into `.env`, ever, is this command,
because the agent-a/b/c/d containers and the Makefile's own
`demo-bad`/`demo-good`/`reset` commands read them from there and never
talk to Vault directly (`security/authority-model.md`'s "no agent
container ever holds a Vault credential" rule). The Keycloak/LDAP
admin passwords and the OIDC client secret stay in Vault only — nothing
ever writes those to `.env`; see
[Bootstrap identity](#bootstrap-identity-openldap-and-keycloak).

**The root token is not a routine tool.** After the one `vault-platform`
apply above, the only things that legitimately need it again are
re-running that same apply (it is the one resource — the `vault-admin`
policy's own content — that token deliberately cannot modify, since a
token should not be able to grant itself more power), or minting a
replacement admin token if the current one is lost. `terraform apply` for
`vault-sentinel` and `vault-database`, and `scripts/vault-check-entitlement.sh`,
all use `.secrets/vault/vault-admin-token` — if any of them ever fails
with `permission denied`, that is `vault-admin`'s policy missing a path,
not a reason to reach for root instead.

## Prepare PostgreSQL and dynamic credentials

Start PostgreSQL, apply migrations, and restore the seed data:

```sh
make infra-up
make infra-migrate
make infra-seed
make infra-configure-vault
```

The last command configures the database secrets engine and three roles inside the `factory` namespace:

- `factory-backend-role` for evidence storage;
- `factory-bad-role` for the overprivileged demonstration;
- `factory-good-role` for bounded remediation.

## Bootstrap identity (OpenLDAP and Keycloak)

Seed the LDAP directory and import the Keycloak realm and client:

```sh
make identity-bootstrap
```

This starts the identity stack — including `identity-secrets-init`, a
one-shot container that authenticates with the `identity-secrets`
AppRole and renders OpenLDAP's admin password, Keycloak's admin
password, and the OIDC client secret from Vault KV onto a shared volume
before OpenLDAP/Keycloak start — then runs one-shot LDAP seed and
Keycloak realm-import containers, then verifies the result. It
provisions the demo accounts defined in `compose/identity/ldap/bootstrap.ldif`,
including operator and viewer roles, and configures the `factory-api`
OIDC client using the same Vault-sourced secret, plus the non-secret
`FACTORY_OIDC_*` endpoint values already set in `.env`. Re-running it is
safe; it does not need to run again after a plain `make up`.

Dashboard sign-in and the human-triggered control routes (task creation, profile switch, reset) require this step. The `make demo-bad`, `make demo-good`, and `make reset` commands do not: they authenticate with `FACTORY_CLI_OPERATOR_TOKEN` instead, a separate identity domain from both Keycloak sessions and agent bearer tokens.

## Start the complete stack

Start Ollama first so the configured model is available, then start the remaining services:

```sh
make ollama-up
make api-up
make agents-up
make ui-up
make status
```

For later starts, after provisioning is complete, use:

```sh
make up
```

Verify the public surfaces:

```sh
curl -fsS http://localhost:3001/api/health | jq
curl -fsS http://localhost:3001/api/demo/mode | jq
curl -fsS http://localhost:11434/api/tags | jq
```

Open `http://localhost:3000` and sign in with one of the accounts provisioned by `make identity-bootstrap`, then continue with the [Demo guide](demo-guide.md). No provisioning step above is v2-specific — `make demo-v2-good`/`make demo-v2-bad` work once this setup is complete; see [What's new in v2](v2-whats-new.md).

## After a host restart

Vault may be sealed even when its containers are running. Check and unseal it before restarting dependent services:

```sh
make vault-status
make vault-unseal
make api-up
make agents-up
```

See [Troubleshooting](troubleshooting.md) if health checks remain degraded.
