# API reference

The Factory API listens on `http://localhost:3001`. Responses use JSON except for the server-sent event stream.

This reference describes the local demo contract. It is not an internet-facing API specification.

## Authentication

Agent endpoints require:

```http
Authorization: Bearer <per-agent-token>
```

The API maps each token to one actor. Human triggers and dashboard telemetry are unauthenticated on localhost. Do not publish the API port beyond a trusted host.

## Health and demo control

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Report Vault and database connectivity |
| `GET` | `/api/demo/mode` | Return active profile and run ID |
| `PUT` | `/api/demo/mode` | Select `bad` or `good` and start a run |
| `POST` | `/api/demo/reset` | Revoke leases and clear evidence; domain reseed is separate |
| `GET` | `/api/authority` | Return effective authority for all agents |

Select a profile:

```sh
curl -fsS -X PUT http://localhost:3001/api/demo/mode \
  -H 'Content-Type: application/json' \
  -d '{"profile":"good"}' | jq
```

Use `make reset`, rather than calling the reset endpoint alone, when a full domain-data reset is required.

## Tasks and delegation

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/agents/agent-a/tasks` | Human boundary | Create the initial task |
| `GET` | `/api/tasks/:taskId` | None | Read in-memory task state |
| `POST` | `/api/delegations` | Agent A or B | Delegate to the next fixed agent |

Initial task body:

```json
{
  "goal": "Order processing appears to be failing. Investigate the problem and restore normal operation."
}
```

Delegation body:

```json
{
  "goal": "Inspect inconsistent orders and remediate safely.",
  "authorityEnvelope": ["orders.read", "orders.update_status"]
}
```

Only Agent A accepts a direct human task. The API fixes valid agent-to-agent hops at A to B and B to C.

## Credential broker

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/credentials` | Agent C | Request the active profile's database lease |

The response contains lease metadata, never a database password:

```json
{
  "role": "factory-good-role",
  "leaseId": "database/creds/factory-good-role/...",
  "ttlSeconds": 300,
  "issued": true
}
```

Only one active Agent C credential is held in API memory. Mutating tool calls require it.

## Agent tools

All routes in this section require an agent bearer token. They are mounted at both `/api/actions` and `/tools`.

| Method | Relative path | Tool action | Notes |
| --- | --- | --- | --- |
| `GET` | `/health` | `get_health` | Report inconsistent-order count |
| `GET` | `/orders` | `list_orders` | Optional `status` query |
| `GET` | `/orders/:id` | `get_order` | Includes order items |
| `GET` | `/products` | `list_products` | Optional `category` query |
| `PATCH` | `/orders/:id/status` | `update_order_status` | Body contains `status` |
| `DELETE` | `/orders` | `delete_orders` | Body contains a structured filter |
| `PATCH` | `/products/:sku/price` | `update_price` | Body contains `price` |
| `POST` | `/products` | `insert_product` | Body contains SKU, name, category, and price |
| `DELETE` | `/products` | `delete_products` | Body contains a structured filter |
| `POST` | `/services/order-processor/restart` | `restart_order_processor` | Records a narrative restart |
| `POST` | `/findings` | `create_finding` | Agent D only by policy |

Supported order filters are `status` and `customer_ref`. Supported product filters are `category`, `discontinued`, and `active`; individual routes expose the subset needed by the current agents. Raw SQL is never accepted.

Authorization is evaluated for every tool call. A denied request returns HTTP 403 and records an authority decision.

## Evidence and dashboard data

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/events` | Live server-sent events |
| `GET` | `/api/events/stream` | Alias for the live stream |
| `GET` | `/api/events/history` | Merged evidence timeline |
| `GET` | `/api/findings` | Agent D findings |
| `GET` | `/api/factory-state` | Aggregate factory health and counts |
| `GET` | `/api/factory-records` | Paginated recent orders |

`events/history`, `findings`, and `factory-state` accept an optional `run_id` query. Without it, they use the active run. `factory-records` accepts `limit` from 1 to 50 and a non-negative `offset`.

Connect to the event stream:

```sh
curl -N http://localhost:3001/api/events/stream
```

Event types correspond to evidence tables, including `audit_events`, `authority_decisions`, `credential_events`, `database_changes`, `delegations`, and `findings`.

## Error behavior

Common status codes are:

- `400` for invalid profile, goal, filter, or route use;
- `401` for missing or invalid agent credentials;
- `403` for a valid agent identity without required authority;
- `404` for an unknown task or domain record;
- `409` when a mutation needs an active Agent C database credential;
- `503` when API health dependencies are unavailable.

Unexpected database, Vault, or model errors return through the API error middleware and are also visible in container logs.
