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

During implementation, backend database authentication failed twice after a long run and recovered after the API restarted. The exact original root cause was not established. `GET /api/health` now triggers an out-of-band credential renewal the moment it observes `db.ok: false` (`backend/src/routes/health.js`, `backend/src/db.js`'s `renewNow`), so a stale credential should now self-heal on its own within one healthcheck interval instead of requiring a restart — and every renewal, successful or failed, is now logged (`podman logs factory-api | grep '\[db\]'`), so a recurrence is diagnosable instead of only inferable from a 503. Treat a `db.ok: false` that persists across several health checks as worth investigating: capture the logged renewal attempts before restarting the API.

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

## v2: a DAG node stays "runnable" and never progresses

`POST /api/dag/tasks/claim` only assigns work when the matching agent container is actually polling for it (`agents/src/dagWorker.js`). If an agent container was stopped for manual testing, or crashed and did not restart, its node sits in `runnable` state indefinitely — nothing else claims it. Confirm the relevant agent is up before assuming the orchestrator is stuck:

```sh
podman logs factory-agent-a
podman logs factory-agent-b
podman logs factory-agent-c
./scripts/compose.sh agents up -d --force-recreate
```

## v2: `PUT /api/demo/workflow-mode` or `/api/demo/fault-injection-mode` returns 409

Both routes reject a switch while `dag_runs.status = 'running'` for the active run — switching mode mid-run would orphan that run's nodes from a workflow mode they no longer match. Let the current DAG run finish, or `make reset` to end it, before switching.

## v2: agent backlog races manual DAG testing

The same self-inflicted backlog pattern gotcha #2 in `.claude/CLAUDE.md` describes for v1 applies to v2 as well, with an added wrinkle: live agent-a/b/c containers keep polling `POST /api/dag/tasks/claim` continuously, so driving a DAG run manually with `curl` (to force an exact fault-injection sequence, say) races the agents' own automatic claims for the same runnable nodes. The reliable way to drive a run manually is to stop the agents first:

```sh
podman stop factory-agent-a factory-agent-b factory-agent-c
# drive the run step by step manually
./scripts/compose.sh agents up -d --force-recreate
```

## A BAD or GOOD run looks different than expected

Model phrasing and tool selection can vary. Judge the run by authority decisions, credential role, database changes, and findings, not by an exact transcript.

Reset and retry from clean data:

```sh
make reset
make demo-good
```

If a destructive operation succeeds under GOOD, preserve the evidence and stop. That result indicates a security regression in policy, Vault configuration, or PostgreSQL grants.
