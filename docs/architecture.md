# Architecture

The Factory is a closed local system built to expose one security question: what happens when a delegated agent receives more authority than its task requires?

## Component map

| Component | Responsibility | Trust boundary |
| --- | --- | --- |
| Dashboard | Starts demos and presents state, evidence, and findings | Public localhost UI |
| Factory API | Orchestrates tasks, evaluates authority, brokers credentials, and stores evidence | Control plane |
| Agent A | Coordinates the human request | Isolated agent identity |
| Agent B | Investigates orders and delegates remediation | Isolated agent identity |
| Agent C | Requests credentials and performs remediation | Only agent allowed to mutate domain data |
| Agent D | Watches events and records security findings | Detection-only identity |
| Vault cluster | Authenticates the API, applies Sentinel policies, and issues database leases | Credential plane |
| PostgreSQL | Stores factory data and per-run evidence | Data plane |
| Ollama | Runs the shared local language model | Inference plane |

The API joins the `factory-control` and `factory-vault-internal` networks. Agents, PostgreSQL, Ollama, and the UI use the control network. Vault uses its internal network. Agent containers do not receive database passwords or Vault tokens.

## Task flow

1. A human submits a task to Agent A.
2. Agent A delegates investigation to Agent B with an authority envelope.
3. Agent B gathers evidence and delegates remediation to Agent C.
4. The API computes Agent C's effective authority for the selected profile.
5. Agent C requests a short-lived credential reference through the API.
6. The API creates a tagged child Vault token, requests a profile-specific PostgreSQL lease, and retains the password in memory.
7. Agent C calls typed tools. The API evaluates policy and executes allowed database operations with the retained lease.
8. Agent D consumes the event stream, classifies activity, and writes correlated findings.
9. The dashboard combines historical evidence with live server-sent events.

The agent model can choose tools, but it cannot send arbitrary SQL. Every database action passes through a typed route with structured filters.

## BAD and GOOD profiles

The application does not maintain separate remediation implementations. Both profiles use the same Agent C process and the same tool routes.

In the BAD profile, Agent C receives a fixed, overbroad ceiling backed by `factory-bad-role`. It can update prices, insert or delete products, and delete orders. A narrow delegation request does not reduce this intentionally flawed binding.

In the GOOD profile, the requested envelope is intersected with Agent C's bounded ceiling. The `factory-good-role` can read the required records and call the narrow `set_order_status` database function. Destructive operations fail at application policy and database privilege boundaries.

## Evidence model

The domain tables are `suppliers`, `products`, `inventory`, `orders`, and `order_items`. Separate evidence tables record:

- demo runs;
- audit events;
- delegations;
- authority decisions;
- credential events;
- database changes;
- Agent D findings.

Each profile switch starts a new run. The event history endpoint merges the evidence tables into a timestamped timeline. Live events use server-sent events, allowing the dashboard and Agent D to observe the same activity.

## Technology choices

The API and agents are Node.js 22 ECMAScript modules. The API uses Express and `pg`; the agent runtime uses the Node.js standard library. The dashboard uses Nuxt 4, Vue 3, and Tailwind CSS 4. PostgreSQL 16 stores data, Vault Enterprise 2.1 provides security controls, and Ollama hosts the model.

These versions describe the current repository configuration. Container tags and package locks remain the authoritative dependency record.

## Deliberate limits

The Factory is a demonstration, not a general agent platform. The delegation chain is fixed, agent bearer tokens are static local secrets, dashboard reads are unauthenticated, and the order processor is a narrative concept rather than a separate service. The API records a restart action but does not restart an external workload.

See [Security model](security-model.md) for the enforced boundaries and [Project history](project-history.md) for the decisions behind this shape.
