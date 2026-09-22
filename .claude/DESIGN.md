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

11. **Sentinel cannot silently require v2-only attempt metadata on a policy shared with v1 traffic.**
    Why: `require-agent-c-for-db-creds` guards the same credential paths
    both workflow modes use; unconditionally requiring
    `factory_attempt_id` would break every existing v1 request. Every
    minted child token — v1 and v2 alike — now carries a
    `factory_workflow_mode` tag, and Sentinel only requires the attempt
    fields when that tag is `recoverable_dag`. This was found during the
    v2 prompt grounding pass, not by the original v2 design proposal.
    Full detail: `prompts/v2/02_03_v2_vault_authority_lifecycle_on_retry.md`.

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

## How to use this file

Adding a new deliberate trade-off, discovered live or decided
explicitly? Add an entry here with a one-line why and a pointer to
wherever the full reasoning already lives (prefer linking over
duplicating). This file should stay short enough to read end to end in
under five minutes — if an entry needs more than a few sentences, that
detail belongs in `docs/` or `security/`, not here.
