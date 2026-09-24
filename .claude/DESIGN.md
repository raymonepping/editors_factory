# DESIGN.md

A decision log, not a spec. `docs/architecture.md` describes what the
system *is*; `docs/project-history.md` narrates how it *got there*;
`CLAUDE.md` covers how to *operate* it day to day. This file is the
fourth leg: the deliberate design decisions behind the system, why each
was made, what was rejected, and where to read the full reasoning. Its
job is to stop a future session (or contributor) from "fixing" something
that was actually a considered trade-off.

Each entry: **Decision** — **Why** — **Rejected alternative** — **Full detail**.

## Authority & identity

1. **No agent container ever holds a Vault credential; only the backend does.**
   Why: the demo's whole thesis is that an agent's own reasoning is not a
   trusted security boundary — Agent C is the one explicitly *not*
   trusted. Rejected: HashiCorp's own "AI Agent Identity with Vault"
   validated pattern (per-agent AppRole identity) — a legitimate pattern
   for a system that *does* trust agent reasoning, which this one
   deliberately does not. Full detail: `security/authority-model.md`
   ("Why agents do not hold Vault credentials directly").

2. **Sentinel enforces via signed child-token metadata, not a custom HTTP header.**
   Why: Sentinel cannot inspect arbitrary request headers; token metadata
   is the only agent-supplied signal it can actually see and trust.
   Rejected: header-based capability claims (unenforceable at the policy
   layer). Full detail: `docs/project-history.md` ("Layered enforcement").

3. **GOOD profile remediates through a narrow `set_order_status` security-definer function, not column-level GRANTs.**
   Why: Vault's PostgreSQL secrets engine did not retain the intended
   column-level UPDATE grant in practice — discovered live, not assumed.
   Rejected: column-level GRANT as the sole boundary. Full detail:
   `docs/project-history.md`, `docs/architecture.md` ("BAD and GOOD
   profiles").

4. **Root Vault token is reserved for bootstrap only; routine ops use a narrow, periodic `vault-admin` token.**
   Why: root is not a routine credential — every unnecessary root use
   widens blast radius. Rejected: using root for all `terraform apply`
   runs (convenient, but exactly the standing-broad-authority pattern the
   demo argues against). Full detail: `docs/operations.md` ("Vault
   maintenance").

## Credential lifecycle

5. **Dynamic PostgreSQL lease TTL is aligned with the parent (child) token's own TTL, not set independently.**
   Why: live revocation testing exposed a TTL mismatch — a lease could
   outlive the token that requested it. Rejected: independent, longer
   default lease TTLs (simpler to configure, but breaks the "credential
   dies with its requester" guarantee). Full detail: `docs/project-history.md`
   ("Layered enforcement").

6. **Out-of-sequence or anomalous credential requests route through Vault Control Groups (real supervised approval), not a mocked approval flow.**
   Why: demonstrating governed access should exercise Vault's actual
   enterprise control, not a facsimile of it. Two non-obvious timing
   rules were found only by live testing and are load-bearing: the
   *original* requesting child token must stay valid through the unwrap
   step (not just the wrapping token's own TTL), and the authorizing
   identity's own token must also survive through unwrap — do not revoke
   it early. Full detail: `docs/security-model.md` ("Supervised credential
   approval (Vault Control Groups)").

7. **KV v2 (`secret/`) enforces `cas_required = true` and `max_versions = 10`.**
   Why: check-and-set is what actually stops a rotation from silently
   clobbering a concurrent write; unbounded version history is an
   unnecessary retention/exposure liability. Rejected: unenforced KV
   writes (simpler, but silently unsafe under concurrent rotation).
   Full detail: `docs/operations.md` ("Vault KV secrets rotation").

## Scope boundaries (things deliberately not built)

8. **SPIFFE/workload identity is not adopted, despite being licensed and functional on this cluster.**
   Why: replacing the AppRole `role_id`/`secret_id` pair with SPIFFE
   would require a workload identity issuer this local demo environment
   doesn't have a trustworthy source for — HashiCorp's own "Vault Trusted
   Identity Brokering" validated pattern names long-lived AppRole
   credentials as the anti-pattern to move away from, and this project
   knowingly stops short of that move rather than fake the identity
   source. Full detail: `docs/security-model.md` (SPIFFE section).

9. **Discovery (Agent D) is Vault-blind, same as every other agent.**
   Why: consistency with decision 1 — an independent witness that could
   itself query Vault directly would be a second, ungoverned path to the
   same credential plane. It infers lease/revocation state entirely from
   the backend's own SSE event stream. The one process that *does* read
   Vault's raw audit log directly is a separate, host-side tool
   (`scripts/vault-audit-crosscheck.py`), never an agent. Full detail:
   `security/authority-model.md`, `prompts/v2/02_05_v2_discovery_and_audit_crosscheck.md`.

## v2 (Factory "Retry the work, not the authority" — planned, not built)

10. **The recoverable micro-DAG execution model sits beside the v1 fixed chain, not in place of it.**
    Why: v1's existing demo narrative and non-regression guarantees must
    keep working unmodified; v2 is an additive execution mode, not a
    rewrite. Concretely: `workflow_mode` (`fixed_chain`|`recoverable_dag`)
    and `authority_profile` (`bad`|`good`) are orthogonal controls, and
    any Sentinel/credential-brokerage change for v2 must leave v1's
    existing behavior provably untouched (see decision 11). Rejected:
    replacing the fixed-chain engine outright. Full detail: `prompts/v2/02_00_*.md`.

11. **Sentinel cannot silently require v2-only attempt metadata on a policy shared with v1 traffic — and, found only while actually implementing it, `has_task` cannot be a universal requirement either.**
    Why: `require-agent-c-for-db-creds` guards the same credential paths
    both workflow modes use. The grounding pass caught that requiring
    `factory_attempt_id` unconditionally would break v1; implementing it
    then surfaced a second problem the grounding pass missed — v2 has no
    `task_id` concept at all, so `factory_task` is never set on *any* v2
    attempt, not just retries, and `has_task AND (...)` would reject
    every v2 request including the first attempt. The actual policy
    branches per mode instead: `(fixed_chain AND has_task) OR
    (recoverable_dag AND has_attempt_fields)` — each mode's own binding
    proof, not one shared requirement plus an addition. Every minted
    child token carries `factory_workflow_mode` unconditionally so
    Sentinel can tell which branch applies. Full detail:
    `terraform/vault-sentinel/main.tf`'s `require_agent_c_for_db_creds`
    resource, `prompts/v2/02_03_v2_vault_authority_lifecycle_on_retry.md`.

12. **The v2 dual-engine contract (`FixedChainEngine` /
    `RecoverableMicroDagEngine`) is a registry of plain-function engines,
    not an ES class hierarchy.** Why: `02_00`'s own illustrative code
    sample shows the contract as `class BaseWorkflowEngine` with throwing
    stub methods, but explicitly offers "class inheritance or standard
    factory dispatch" as an either/or — and no other backend module uses
    `class` (`vault.js`, `revocation.js`, `state.js` are all plain
    function exports). `registerEngine()` enforces the six-method
    contract structurally at registration time instead, matching the
    rest of the codebase. Rejected: implementing the class as shown, for
    consistency's sake alone. Full detail: `backend/src/orchestrator/index.js`.

13. **v2 attempt-credential revocation is unconditional across both BAD
    and GOOD profiles — not profile-branched, even though `02_03`'s own
    prompt text describes a BAD-mode demo path that "deliberately skips
    lease revocation" so Attempt 2 can reuse Attempt 1's still-active
    lease.** Why: this project holds a stronger, already-proven
    principle — application code never branches on profile for
    security-relevant behavior; Vault policy, Sentinel, and PostgreSQL
    grants do the differentiating instead (`agents/identities/agent-c.js`'s
    own header comment: "this file must not be mode-aware"). Adding an
    `if (profile === 'bad') skip revocation` inside `completeAttempt`/
    `failAttempt` would violate that. Rejected: implementing 02_03
    section 5 literally. `revokeAttempt()` (`backend/src/services/revocation.js`)
    always runs, both profiles — the real BAD-vs-GOOD difference for v2
    remains what it always was for v1: role capability and TTL bounds
    (`terraform/vault-database/database.tf`'s `DB_ROLE_TOKEN_TTL_SECONDS`),
    not a fabricated code branch. A consequence worth knowing: Discovery's
    D-103 (`agents/identities/agent-d.js`, `prompts/v2/02_05`) — "credential
    lease reuse detected" — should never legitimately fire under this
    implementation; if it does, that is a real bug, not the intended
    BAD-mode showcase 02_03 originally described.

## v3 (Vault-native Agentic IAM — built as a separate root-scoped path)

14. **Vault Enterprise's native "Agentic IAM" mechanism (OAuth
    Resource Server + Agent Registry + Rich Authorization Requests)
    does genuinely work on `v2.1.1+ent` — the original NO-GO verdict
    was wrong, corrected by further live testing, not by a Vault
    upgrade.** The original finding (every JWT presentation failing
    with `mount_type: ns_token`, Agent Registry "absent from the
    OpenAPI spec") turned out to be incomplete, not a real product
    limitation: Agent Registry is a real, present, root-namespace-only
    built-in that simply isn't enumerated by
    `sys/internal/specs/openapi` the way user-mounted engines are —
    found live by testing `agent-registry/` against `sys/mounts`
    directly with root instead of trusting the OpenAPI listing.
    Registering an entity there, giving it a real ACL policy AND
    matching `ceiling_policies`, and binding it via
    `identity/entity-alias` (issuer + external_id, not the standard
    alias shape) let a spec-clean RFC 9068 JWT (`typ: at+jwt` in the
    JOSE header) authenticate to Vault and receive real, non-default
    capability — proven by requesting a path only that entity's own
    policy could grant, not something the built-in `default` policy
    already covered. Two more real, live-confirmed findings along the
    way: Vault's `typ` check reads the JWT **body**'s `typ` claim, not
    the header — Keycloak 26.6.4 can set the header correctly
    (`access.token.header.type.rfc9068=true`) but always adds a legacy
    `typ: "Bearer"` body claim no protocol mapper can override, which
    alone blocks it (a hand-crafted JWT was needed to isolate this);
    and Vault resolves both the `oauth-resource-server` profile lookup
    and the entity-alias lookup **scoped to the target path's own
    namespace**, while Agent Registry only accepts root-namespace
    entities — an entity can satisfy Agent Registry or be resolvable
    against a `factory`-namespace resource, never both. That last
    constraint is real and unresolved (see decision 15) — everything
    else was a testing gap, not a Vault limitation. Full evidence,
    including the three-way triangulation that isolated the namespace
    constraint from the Agent Registry gap: `prompts/v3/03_00_findings.md`.

15. **v3 is built as a genuinely separate, additive, root-namespace
    credential path (`prompts/v3/03_01`) — not a replacement authority
    mechanism for v1/v2's `factory`-namespace flow.** Why: decision
    14's namespace constraint (Agent Registry root-only, alias
    resolution scoped to the target) means the mechanism can only
    reach resources that also live at root — and every real v1/v2
    resource deliberately lives inside `factory` (decision 4: root is
    reserved for administration). Migrating the whole stack into root
    to make v3 a true drop-in replacement was rejected outright — it
    would relax a deliberate boundary for every existing thing, not
    just v3. Built instead: a second, root-mounted `database-v3`
    secrets engine (same Postgres, genuinely separate mount/role,
    read-only on `products` only — never `orders` or any evidence
    table v1/v2 depend on), a real `v3-agent-identity` entity/
    registration/alias/policy (`terraform/vault-platform/
    v3-root-credential-path.tf`), and a new orthogonal
    `authority_mechanism` (`sentinel_approle` | `vault_native_oauth`)
    read only by `routes/credentials.js`'s own new branch — every
    other route, and every v1/v2 run regardless of `authority_mechanism`,
    is untouched by construction. Confirmed live end-to-end through
    the deployed backend (not a spike script): a real agent-c request
    with `authority_mechanism=vault_native_oauth` mints a JWT, presents
    it to Vault, and receives a genuine, correctly-TTL'd PostgreSQL
    credential. Both test suites stayed green through every phase.
    Two real, non-obvious build findings worth keeping in mind: (a)
    the Vault Terraform provider's `vault_generic_endpoint` can't
    track a POST-only path with no matching GET (`agent-registry/register`,
    `identity/entity-alias`) even with `disable_read` set — `terraform
    import`'s own refresh reads unconditionally — so those two writes
    are managed by `scripts/vault-v3-agent-registry-bootstrap.sh`
    instead, the same escape hatch this project already uses for
    values Terraform can't cleanly own; (b) a provider major-version
    bump (`~> 4.0` → `~> 5.10`, needed for the new dedicated
    `vault_oauth_resource_server_config_profile`/
    `vault_agent_registration` resource types) was tried and reverted
    after a live `terraform plan` showed it changes how the provider
    addresses several already-working `factory`-namespace resources —
    not worth the risk for two new resources when `vault_generic_endpoint`
    on the stable provider does the job. No real IdP in this stack can
    currently produce a Vault-acceptable token (decision 14's `typ`
    finding) — factory-api mints its own demo JWT instead, a real RSA
    key held only by the backend (never an agent container, per
    decision 1), explicitly labeled "(preview)" in the UI as a stand-in
    for a real identity provider. Vault's own verification and RAR/ACL
    enforcement are real throughout; only the IdP role is stood in for.
    Rejected: Sentinel coverage for this path (`require-agent-c-for-db-creds`
    scopes itself to `factory/database/*`; this path's boundary is
    Vault's native RAR/ACL intersection instead, which is the point of
    it existing). Revisit the "separate path, not a replacement" shape
    only if a future Vault build resolves the Agent Registry
    root-namespace constraint.

## How to use this file

Adding a new deliberate trade-off, discovered live or decided
explicitly? Add an entry here with a one-line why and a pointer to
wherever the full reasoning already lives (prefer linking over
duplicating). This file should stay short enough to read end to end in
under five minutes — if an entry needs more than a few sentences, that
detail belongs in `docs/` or `security/`, not here.
