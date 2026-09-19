# Project history

The Factory began as a small demonstration of excessive agent access and became a four-agent, evidence-driven system. This history explains the changes without treating early design notes as current behavior.

## Initial concept

The first design used two agents: a coordinator and a specialist with excessive permissions. The aim was to compare overprivileged and least-privileged execution without changing the task.

The design expanded to three agents so authority could be observed across two delegation hops. Agent A coordinates, Agent B investigates, and Agent C remediates. This made transitive authority visible: a narrow request can still end at an identity with a broad fixed binding.

## Local and auditable by design

The project selected Ollama so the security claim would not depend on a hosted model provider. PostgreSQL replaced simulated mutations, and Vault dynamic credentials made access short-lived and revocable. The system kept its domain deliberately small: products, inventory, suppliers, orders, and order items.

The operating requirements settled on five properties:

- real database effects;
- local execution;
- isolated agent identities;
- auditable decisions and changes;
- repeatable and reversible demonstrations.

Custom evidence tables were chosen instead of adding a message broker or database audit extension. This kept the runtime small while preserving the causal chain.

## Layered enforcement

The initial authority model became three cooperating boundaries:

1. API policy decides whether an action belongs to effective authority.
2. Vault issues a role-specific, short-lived database lease and applies Sentinel policy.
3. PostgreSQL grants decide what that leased identity can execute.

Several implementation discoveries changed the mechanism while preserving the goal. Sentinel could not inspect a custom HTTP header, so the API now uses child-token metadata. Vault's PostgreSQL plugin did not retain the intended column-level update grant, so GOOD remediation now calls a narrow security-definer function. Credential lifetime was also aligned with the parent token after live revocation behavior exposed a TTL dependency.

## Detection lane

Agent D was added as an independent witness. It does not receive delegated remediation authority. It consumes the event stream, applies deterministic classifications, and records findings. The language model can narrate a finding, but it does not decide whether the source event occurred.

This addition separated control from observation and gave the dashboard a clear NORMAL, ELEVATED, CRITICAL, and CONTAINED security story.

## Operator experience

The final phase added the Nuxt dashboard, historical event backfill, factory aggregates, recent records, responsive layouts, and reset controls. The interface displays both the operational state of the mock factory and the security evidence that explains it.

A later phase added OpenLDAP and Keycloak so the root task, and every delegation and credential event downstream of it, traces to an immutable human subject rather than a shared operator identity. Agent identity moved to short-lived, task-bound JWTs issued by the API from a narrow bootstrap token, closing the gap where a long-lived shared credential could be replayed outside its task.

As the dashboard grew a narrative view, a credential ledger, and a full event log alongside the original regions, a single long page stopped fitting the target demo resolutions. The interface was reorganized behind a sidebar: an Overview section keeps the human request, agent chain, narrative, and factory state on one screen, while records, the credential ledger, the event timeline, and Agent D's own detail moved to their own sections.

The project retains a concise principle from its design work:

> Discovery creates evidence. It does not create authority.

Its operator-facing theme is equally practical: break the factory, learn from it, reset, and repeat.

## Source precedence

The historical files under `input/` include proposals that were revised during implementation. Examples include an earlier backend language assumption, direct Agent C database access, older model choices, and pre-Agent D architecture.

Use this order when resolving a conflict:

1. current source and configuration;
2. latest redacted baseline named by `state/CURRENT`;
3. security records and implementation prompts;
4. historical `input/` material.

The state baseline sequence records each completed milestone, from the initial repository through Vault, PostgreSQL, Ollama, API, agents, dashboard, and responsive UI work.
