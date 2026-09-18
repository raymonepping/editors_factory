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

Copy the environment template and replace every placeholder:

```sh
cp .env.example .env
```

Generate a different bearer token for each agent:

```sh
openssl rand -hex 24
```

Repeat that command four times and assign the values to `AGENT_A_TOKEN` through `AGENT_D_TOKEN`. Set a private PostgreSQL password. Do not commit `.env`.

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

Load the root token only into the current shell, then apply the namespace, policies, and AppRole:

```sh
export VAULT_TOKEN="$(jq -r '.root_token' .secrets/vault/cluster-init.json)"
terraform -chdir=terraform/vault-platform init -input=false
terraform -chdir=terraform/vault-platform apply
terraform -chdir=terraform/vault-platform output -raw factory_api_role_id
```

Copy the role ID into `FACTORY_VAULT_ROLE_ID` in `.env`. Generate the AppRole secret ID outside Terraform:

```sh
export VAULT_ADDR=https://127.0.0.1:18200
export VAULT_CACERT="$PWD/vault-tls/ca-chain.pem"
export VAULT_NAMESPACE=factory
vault write -f auth/approle/role/factory-api/secret-id
```

Copy the returned `secret_id` into `FACTORY_VAULT_SECRET_ID` in `.env`, then apply the Sentinel endpoint policies:

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

Open `http://localhost:3000`, then continue with the [Demo guide](demo-guide.md).

## After a host restart

Vault may be sealed even when its containers are running. Check and unseal it before restarting dependent services:

```sh
make vault-status
make vault-unseal
make api-up
make agents-up
```

See [Troubleshooting](troubleshooting.md) if health checks remain degraded.
