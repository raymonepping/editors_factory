# Authority Model

This is the single source of truth for identity, access, trust,
observability, containment, and revocation in The Factory. Every prompt
under `../prompts/` implements this model; none of them should redefine
it.

## The six controls this project demonstrates

| Control | What the audience sees |
|---|---|
| **Identity** | `human`, `agent-a`, `agent-b`, `agent-c`, `agent-d` are individually identifiable actors — never a single undifferentiated "AI." |
| **Access** | Each actor has an explicit, typed set of tools it may even *select* — enforced at the agent tool-schema level (`prompts/agents/0*`). |
| **Trust** | Vault issues a PostgreSQL credential to Agent C only when requested, scoped to one of exactly two roles, inside a dedicated `factory` namespace (`prompts/base_project/03_01_postgres_dynamic_creds.md`, `prompts/base_project/02_02_vault_follow_up.md`). |
| **Observability** | Every delegation, credential request, policy decision, tool call, and database mutation is recorded with actor, timestamp, parent task, and before/after state (`prompts/api/01_01_factory_schema_and_tools.md`'s audit tables). |
| **Containment** | Everything runs in disposable Podman networks with synthetic data and no host access (see Containment rules, below). |
| **Revocation** | `make reset` explicitly revokes every outstanding Vault lease rather than waiting for TTL expiry (`prompts/base_project/01_01_factory_stack.md`). |

## Identity and delegation chain

```text
human (depth 0)
  │  fixed trigger prompt — see prompts/frontend/01_01
  ▼
agent-a (depth 1)  Incident Coordinator
  │  delegates ("investigate")
  ▼
agent-b (depth 2)  Operations Investigator
  │  autonomously delegates ("remediate") — B decides this, not the human
  ▼
agent-c (depth 3)  Data Remediation
  │  requests a Vault credential; performs the actual database mutation
  ▼
PostgreSQL

agent-d            Continuous Detection — independent lane, observes all
                    of the above via the event stream, never joins the
                    delegation chain, never gains database access.
```

**Rule: authority is bounded by fixed recipient ceilings and profile policy.**
In the **GOOD** profile, the backend determines effective authority by
intersecting the requested envelope with the recipient's fixed capability
ceiling (`prompts/backend/01_01_orchestrator_api.md`). The delegator initiates
the request, but the recipient's fixed profile ceiling strictly limits what
capabilities can be granted. In the **BAD** profile, the backend intentionally
bypasses recipient ceiling intersection for Agent C, granting it an unsafe,
over-broad capability ceiling (`factory-bad-role`) to visibly demonstrate
delegated privilege amplification in a contained demo environment.

## Authority matrix — BAD profile

```text
agent-a   inspect, diagnose, delegate→agent-b
agent-b   inspect, diagnose, restart-order-service, delegate→agent-c
agent-c   inspect, diagnose, SELECT/INSERT/UPDATE/DELETE on all tables
            (factory-bad-role, TTL 24h) — fixed, not derived from the
            delegation chain; this fixed over-broad binding IS the
            demonstrated flaw
agent-d   observe, correlate, create-finding (unchanged from GOOD)
```

## Authority matrix — GOOD profile

```text
agent-a   inspect, diagnose, delegate→agent-b            (unchanged)
agent-b   inspect, diagnose, restart-order-service,
          delegate→agent-c                                (unchanged)
agent-c   inspect, diagnose, SELECT + UPDATE(status) only on orders
            (factory-good-role, TTL 120s) — derived from intersecting
            what agent-b requested for agent-c with agent-c's own,
            independently fixed role ceiling (never derived from
            agent-b's own narrower operational toolset — a delegator
            does not need to personally hold a capability to legitimately
            delegate it, see prompts/backend/01_01_orchestrator_api.md's
            delegation route for why that distinction matters in
            practice); DELETE and unrestricted UPDATE are never in
            agent-c's good-profile ceiling, so they can never appear here
            regardless of what either agent requests
agent-d   observe, correlate, create-finding              (unchanged)
```

Only Agent C's effective authority differs between profiles. Agent A,
Agent B, and Agent D behave identically in both — the model, the prompt,
and the reasoning are unchanged; only whether Agent C's chosen action
*succeeds* differs. This is the whole demonstration
(`prompts/agents/04_01_agent_c_remediation.md`).

## Defense in depth (deliberate, not redundant)

A destructive action in GOOD mode is stopped by **three independent
layers**, and all three must hold:

1. **Application policy** (`/api/authority` in
   `prompts/backend/01_01_orchestrator_api.md`) — denies any tool call
   outside the caller's effective authority before it reaches the
   database.
2. **Vault Sentinel** (`require-agent-c-for-db-creds`,
   `prompts/base_project/02_02_vault_follow_up.md`) — denies any
   `database/creds/*` request that is not explicitly attributed to
   `agent-c`, at the Vault API layer, before any ACL policy is even
   consulted. This layer is profile-independent: it holds in BAD mode
   too, gating *who* may ever reach a database credential rather than
   *which* role they receive.
3. **Database grants** (`factory-good-role` in
   `prompts/base_project/03_01_postgres_dynamic_creds.md`) — even if
   both layers above were somehow bypassed, PostgreSQL itself rejects
   `DELETE`/unrestricted `UPDATE` for that role.

Do not remove any layer to simplify implementation. The demo's
credibility depends on all three being real and independently
verifiable.

## Namespace: `factory/`

Every Vault mount Factory owns (the `approle` auth method, the
`database` secrets engine, both Sentinel EGPs) lives inside a dedicated
`factory` Vault namespace, not at root
(`prompts/base_project/02_02_vault_follow_up.md`).

This is **not** multi-tenant isolation in the sense Vault namespaces are
usually used for (Arcanium's own namespace use, by contrast, isolates
external supplier tenants from its core platform — Factory has no second
tenant). It is a deliberate boundary around Factory's *entire* Vault
footprint, so it never silently ends up sharing root-namespace
configuration with whatever else lands on this Vault cluster over time.
Namespace-scoping the whole demo, even without a second tenant to
isolate from today, is the same Containment reasoning applied one level
higher: **the demo's blast radius should be bounded by construction, not
by discipline.** If Factory ever gains a second tenant-shaped concept
(a second demo instance, a supplier-style actor), a second namespace is
the natural extension — this one was not built to anticipate that, it
was built because the boundary is worth having on its own.

## Sentinel: a Vault-native invariant, not just an ACL

Vault's own Access Control List (ACL) policies answer "does this token
have the `read` capability on this path." Sentinel EGPs answer a
different question: Vault inspects the *token* making the request before
deciding, not merely what that token's ACL policy grants.
`require-agent-c-for-db-creds` means that even a token whose ACL policy
technically grants `database/creds/factory-bad-role` cannot actually
read it unless that specific token was minted with metadata tagging it
as acting on `agent-c`'s behalf
(`token.metadata["factory_agent"] == "agent-c"`, checked in Sentinel).
This closes a gap ACL policy alone cannot: ACL policy governs *what a
token can do*, Sentinel here governs *whether this particular token was
explicitly minted for this purpose* — independently checkable, and
enforced by Vault itself rather than by the backend's own honesty.

The mechanism is a short-lived child token, not a request header:
Sentinel's `request` object in Vault Enterprise has no HTTP-header
access (`request.headers` does not exist — confirmed empirically while
building `prompts/base_project/02_02_vault_follow_up.md`, after an
initial header-based design failed with "only a list or map can be
indexed, got undefined" regardless of whether a header was actually
sent). `database/creds/*` is also read-only, so a request body carries
nothing Sentinel could check either. `factory-api` instead mints a
child token carrying the `factory_agent=agent-c` metadata immediately
before each credential read, and discards it after — verified
end-to-end: the untagged parent token is denied, the tagged child token
succeeds.

The child token's TTL is not a flat, short "just long enough for one
call" value — it is set to match the TTL of the specific role about to
be requested (`backend/src/vault.js`'s `DB_ROLE_TOKEN_TTL_SECONDS`: 24h
for `factory-bad-role`, 2m for `factory-good-role`, 1h for
`factory-backend-role`). Found live: an earlier version hardcoded
`ttl=60s` for every request, on the reasoning that a short-lived,
single-purpose token was the more conservative choice. It was not —
Vault ties a dynamic secret's lease to the client token that requested
it, so when that 60s token expired, Vault cascade-revoked the database
credential's lease along with it (running the role's
`revocation_statements`, dropping the PostgreSQL role), regardless of
the credential's own much longer configured TTL. This was invisible
from Vault's own bookkeeping (`sys/leases/lookup` kept reporting the
lease as active with most of its TTL remaining) and only showed up as
PostgreSQL auth failures on connections opened more than about a minute
after issuance — including the backend's own hour-long operational pool.
The child token's policy scope already equals its AppRole parent's (no
narrower policy is attached; the metadata tag, not the TTL, is what
bounds its purpose), so lengthening its TTL to match the credential it
brokers does not widen what it's authorized to do — only how long it
must stay alive for that credential to keep working.

## Discovery vs. authority (Agent D's rule)

> **Discovery creates evidence. It does not create authority.**

Agent D can observe everything A/B/C do and can raise a finding — up to
and including a finding that correctly predicts damage before it happens
(`prompts/agents/05_01_agent_d_detection.md`). It cannot revoke a
credential, block a route, or stop another agent. The gap between "we
detected this" and "we acted on it" is intentional and is itself part of
the demonstration: detection without the authority (or the process) to
act on it is not the same as containment.

## Why agents do not hold Vault credentials directly

An external review of this project (`input/VALIDATION.md`,
`input/Navi_Validation.md`) suggested giving each agent its own Vault
AppRole identity, citing HashiCorp's own "AI Agent Identity with
HashiCorp Vault" validated pattern. That pattern is a legitimate
reference point for a system where each agent's own reasoning is
trusted enough to be a real security boundary. Factory's whole thesis is
the opposite: Agent C's reasoning is exactly the thing this demo does
**not** trust.

Giving Agent C (or any agent) a Vault AppRole `secret_id` baked into its
own container would mean a compromised or successfully-prompt-injected
agent could authenticate to Vault directly, bypassing the backend's
policy engine and the Sentinel EGP entirely — widening blast radius, not
narrowing it, and undermining the whole "delegated authority" argument
this project exists to make. The backend-as-broker pattern
(`prompts/backend/01_01_orchestrator_api.md`) is deliberate: no agent
container ever holds a Vault credential, only a bearer token scoped to
the backend's own typed tool API. This is the same reasoning that
already rules out arbitrary shell/SQL tools for agents
(`prompts/agents/01_01_agent_runtime_framework.md`): reasoning quality
is never trusted as a security boundary; only deterministic software
between the agent and the resource is.

## Containment rules (hard requirements, every agent container)

```text
NO host filesystem mount
NO ~/.ssh, ~/.aws, ~/.kube
NO Podman/Docker socket
NO production Vault, no real credentials, no real customer data
NO shell tool, no arbitrary-SQL tool
NO direct PostgreSQL or Vault access for agents — only via the backend broker
  (prompts/backend/01_01_orchestrator_api.md)
```

**Network boundaries and egress limits**:
- Model inference is 100% local via `factory-ollama` on `factory-control`.
- Agent containers receive no PostgreSQL passwords, no direct DB tools, and no Vault access.
- In this local developer demo, outbound internet egress is not blocked at the container firewall level (allowing local package pulls/updates during build/setup), but no workflow step requires or uses external connectivity during demo execution.
- Host ports bind strictly to `127.0.0.1`.

Worst possible outcome of a bug or a misbehaving model: **the demo
destroys the demo's own synthetic factory database.** Nothing outside
`compose/`'s Podman networks and volumes is reachable.

## Revocation

`make reset` (`prompts/base_project/01_01_factory_stack.md`) must:

1. Revoke every outstanding `factory-bad-role`/`factory-good-role` Vault
   lease explicitly (`sys/leases/revoke/*`), not rely on TTL expiry.
2. Re-seed PostgreSQL from the deterministic baseline
   (`prompts/api/01_01_factory_schema_and_tools.md`).
3. Clear agent task/delegation state and demo run metadata.

This makes the hotel-key metaphor from the source conversations literally
true and demonstrable: a credential that stops working the moment its
lease ends or is explicitly revoked, not one that lingers.
