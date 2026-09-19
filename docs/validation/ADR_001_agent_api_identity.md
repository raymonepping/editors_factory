# ADR 001: Agent-to-API identity

Status: Accepted
Wave: 6 (`prompts/improvements/01_01_improvement.md`)

## Context

Every agent container (A, B, C, D) currently authenticates to the Factory
API with one static bearer token, defined once in `.env`
(`AGENT_A_TOKEN`..`AGENT_D_TOKEN`) and injected into that agent's own
Compose service (`compose/agents/compose.yaml`). `backend/src/middleware/
agentAuth.js` maps the presented token to an actor id via a linear search
over `config.agentTokens`, and every downstream route trusts that actor
id for the remainder of the request. `agents/src/backendClient.js`
attaches the token to every outbound call for that container's entire
lifetime.

This satisfies "one distinct identity per agent" but not "short-lived,
task-bound, revocable, rotated" — the token is generated once at
provisioning time and never expires, never changes, and is valid for
every request that container will ever make, for as long as the
container exists. Wave 6 requires replacing it with a short-lived,
task-bound credential while keeping the token that never disappears
entirely — an initial identity has to come from somewhere — narrower and
distinct in purpose from ordinary API access (section 15 of the
improvement prompt).

Wave 7 (already implemented) built a separate, unrelated identity domain
for humans (Keycloak OIDC, `backend/src/auth/`). This ADR does not reuse
or touch that path — section 16.5 of the improvement prompt requires
human and agent identity to stay separate domains, and they already are.

## Decision

**Short-lived signed JWT, issued by the Factory API itself (the trusted
deterministic broker), bound to one agent + one task.** This is the
improvement prompt's own stated default and the least mechanism for what
this demo actually needs — mTLS or SPIFFE/SPIRE would add a certificate
authority and workload-attestation infrastructure this single-host demo
has no other use for, contradicting the prompt's own "do not select mTLS
or SPIFFE/SPIRE merely because it is more elaborate."

### Bootstrap: the static token's new, narrower role

The four static per-agent tokens are **kept**, but their power is cut
down to exactly one thing: proving "I am agent-X" at a single new
endpoint, `POST /api/v1/agents/token`. They can no longer be presented to
any tool-call, delegation, or credential route directly. This is what
keeps the bootstrap credential from being "the same long-lived secret,
renamed" (section 15): its only capability is minting a task-bound JWT
after the API has verified both the caller's static identity **and**
that a real, currently-active task actually exists for that agent
(`state.getCausalContext(actorId)` — the same lookup Wave 4 already
built). An agent with no active task cannot mint a JWT at all.

### Claims

```json
{
  "iss": "factory-api",
  "sub": "agent-c",
  "aud": "factory-api",
  "iat": 1234567890,
  "exp": 1234568190,
  "jti": "<random>",
  "run_id": "<uuid>",
  "task_id": "<uuid>"
}
```

`sub` is the enforced actor identity — every route that currently reads
`req.actorId` from `agentAuth` reads it from the verified JWT's `sub`
claim instead, never from anything else the client supplies. `task_id`
binds the token to the one task it was minted for; `exp` is set to the
lesser of the task's own remaining timeout budget
(`config.taskTimeoutMs`) and a fixed ceiling, so a token can never outlive
the task it was issued for by construction, not by convention.

### Algorithm and key

HS256, one symmetric secret (`FACTORY_AGENT_JWT_SECRET`, generated the
same way as the existing per-agent tokens and `FACTORY_CLI_OPERATOR_TOKEN`
— `openssl rand -hex 32`). Asymmetric signing would matter if issuance
and verification lived in different trust domains; here the same
process, `factory-api`, does both, so a shared secret is not a weaker
choice, only a simpler one appropriate to the actual topology. The
verifier pins `alg: HS256` explicitly and rejects any other algorithm
header outright (section 15's "explicit algorithm allowlist") —
including `none`, the classic JWT bypass this specifically guards
against.

### Verification (`backend/src/middleware/agentJwt.js`, new)

- Rejects a missing/malformed `Authorization: Bearer <jwt>`.
- Verifies signature, `iss`, `aud`, `exp` — expired or wrong-audience
  tokens are rejected, not warned about.
- Checks `jti` against an in-memory revoked set (see Revocation below).
- Sets `req.actorId = payload.sub`, `req.taskId = payload.task_id`,
  `req.runId = payload.run_id` — nothing else on the request is ever
  trusted for identity.
- Replaces `agentAuth` on every route it currently guards
  (`routes/actions.js`, `routes/delegations.js`, `routes/credentials.js`,
  `routes/tasks.js`'s `GET /tasks/:taskId`). `middleware/agentAuth.js`
  itself is retired once nothing references it.

### Revocation

Implemented without a separate revoked-`jti` store: a JWT bound to a
`task_id` is only honored while that exact task is still resolvable in
`state.js`'s own task map (`middleware/agentJwtAuth.js`) — the same
lifecycle Wave 2/2.5's revocation already clears at every terminal
boundary (completion, denial, profile switch, reset). Agent D's
run-bound token is checked against `state.getCurrentRunId()` the same
way. No new persistent store, no new table — matches this project's
existing "in-memory control plane, cleared by reset" design (`state.js`'s
own header comment).

**Found live, fixed before shipping:** a purely time-based refresh
(halfway through the token's TTL) was not enough for agent-d — `make
reset` starts a brand-new `run_id` immediately, a discrete event a timer
cannot react to promptly, so every `create_finding` call 401'd until the
next scheduled refresh happened to land. Fixed by tracking the `run_id`
of the last SSE event agent-d processed and forcing an immediate
re-bootstrap the moment it changes (`observerRuntime.js`), on top of the
existing timer as a fallback.

### What does NOT change

- Vault access: unchanged. Agents still never receive a Vault token or
  database password — this wave only replaces how an agent authenticates
  to the **Factory API**, not how the API authenticates to Vault
  (`backend/src/vault.js`, already API-only, per Wave 6's own explicit
  "stronger agent identity means stronger authentication to the Factory
  API, not direct agent authentication to Vault").
- The SSE event stream (`GET /api/events/stream`) stays unauthenticated —
  deliberate, pre-existing dashboard-telemetry design (`routes/
  events.js`'s own comment), out of scope for this wave.
- `agentAuth`'s actual token-matching logic (constant-time-adjacent
  linear search over 4 known tokens) is reused verbatim for the new
  bootstrap endpoint — the mechanism was fine; only its scope of
  authority was too broad.

## Consequences

- Every agent's `runtime.js` gains one step: mint a task-bound JWT via
  the bootstrap endpoint immediately after `handleTask()` fetches the
  task, before making any further backend call for it.
  `backendClient.js`'s shared `request()` helper needs the current JWT
  (not the static token) attached per call.
- A JWT expiring mid-task (task genuinely overruns its own timeout
  budget) fails the same way an unauthenticated call already does — 401
  — which is correct: `AGENT_TASK_TIMEOUT_MS` already race-kills an
  overrunning task at the agent level (`agents/src/runtime.js`'s own
  `Promise.race`), so a JWT expiring at the same boundary does not
  introduce a new failure mode, it reinforces the existing one.
- Static tokens remain in Compose env vars (bootstrap still needs them),
  but no longer function as general API access — a leaked static token
  alone can no longer touch orders, products, or credentials; it can only
  request a JWT, and only when a real active task already exists for
  that identity.
