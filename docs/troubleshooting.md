# Troubleshooting

Start with `make status`, `make vault-status`, and the API health endpoint. A running container is not proof that its dependencies are usable.

## Vault services fail during first start

Use `make vault-up`. Do not replace it with a direct Compose start of every Vault service.

The bootstrap must start the transit-seal server, create its token file, and only then start the three main nodes. Starting all nodes early can cause Podman to create the missing token bind source as a directory. The main nodes then fail auto-unseal authorization.

If `.secrets/vault/transit-token` is a directory, stop the Vault stack and inspect the local bootstrap state before removing anything. Recovery material is sensitive, and deleting the wrong file can require a full rebuild.

## Vault is sealed after restart

```sh
make vault-status
make vault-unseal
```

Restart the API and agents after Vault becomes healthy if their startup checks already failed.

## Vault Agent is unhealthy

Confirm that `.env` has real values for `FACTORY_VAULT_ROLE_ID` and `FACTORY_VAULT_SECRET_ID`. The secret ID must be generated after applying `terraform/vault-platform`; Terraform intentionally does not store it.

Inspect logs:

```sh
podman logs factory-vault_agent
```

If the AppRole values were added after Vault first started, recreate the Vault stack with `make vault-down` and `make vault-up`.

## API health reports a database error

The API uses a Vault-issued `factory-backend-role` credential. Check Vault Agent, Vault, and PostgreSQL first:

```sh
curl -fsS http://localhost:3001/api/health | jq
podman logs factory-api
podman logs factory-postgres
```

During implementation, backend database authentication failed twice after a long run and recovered after the API restarted. The root cause was not established. Treat recurrence as an open defect: capture timestamps and logs before restarting the API.

## Agent C receives a Sentinel denial

The database credential paths require a child token with `factory_agent=agent-c` metadata. An untagged token must be denied.

Confirm that the API uses its current credential-broker path and that `terraform/vault-sentinel` is applied. Do not attempt to pass an agent identity through a custom HTTP header; Vault Sentinel cannot inspect request headers through its request object in this flow.

## GOOD status updates fail in PostgreSQL

Reapply the database module:

```sh
make infra-configure-vault
```

The bounded role calls `set_order_status`; it does not rely on a column-level grant. The Vault PostgreSQL plugin dropped that grant during live testing, so the database function is the supported boundary.

## Reset fails

`make reset` needs both the API and PostgreSQL. It first calls the API to revoke leases and clear evidence, then applies the host-side seed file.

```sh
make api-up
make infra-up
make reset
```

Calling `POST /api/demo/reset` alone does not restore products, orders, inventory, suppliers, or order items.

## Agents time out or loop

Check that Ollama has the configured model:

```sh
curl -fsS http://localhost:11434/api/tags | jq
make ollama-logs
make agents-logs
```

The defaults, 15 iterations and 300 seconds per task, reflect observed behavior of `qwen3:4b-instruct`. Raising them can hide a model or prompt problem and make a live demo stall longer. Diagnose the failed tool sequence before changing the limits.

## Dashboard does not update

Test the event stream directly:

```sh
curl -N http://localhost:3001/api/events/stream
```

Then inspect UI and API logs. The dashboard loads historical evidence first and appends live server-sent events. A browser reload should therefore retain the current run's timeline.

If source changed but the container did not, rebuild it:

```sh
make ui-build
```

## A BAD or GOOD run looks different than expected

Model phrasing and tool selection can vary. Judge the run by authority decisions, credential role, database changes, and findings, not by an exact transcript.

Reset and retry from clean data:

```sh
make reset
make demo-good
```

If a destructive operation succeeds under GOOD, preserve the evidence and stop. That result indicates a security regression in policy, Vault configuration, or PostgreSQL grants.
