# Project Improvement Roadmap: The Editor's Factory

This document tracks the verified findings from `Codex_Validation.md` and `Navi_Validation.md` and defines the logical roadmap for executing the remaining improvement waves from `prompts/improvements/01_01_improvement.md`.

---

## 1. Status Overview

| Wave | Domain | Status | Target Phase |
| :--- | :--- | :---: | :--- |
| **Wave 7** | **Human AuthN & AuthZ (OpenLDAP + Keycloak)** | **COMPLETED, with a fix** | Current Cycle |
| **Wave 1** | **Stale Security Documentation & Claim Realignment** | **COMPLETED** | Roadmap Phase 1 |
| **Wave 2** | **Credential & Dynamic Lease Lifecycle Management** | **COMPLETED, with a fix** | Roadmap Phase 2 |
| **Wave 3** | **Token Scope Narrowing & Task-Bounded TTLs** | **COMPLETED** | Roadmap Phase 2 |
| **Wave 4** | End-to-End Causal Tracing Linkage | **COMPLETED** | Roadmap Phase 3 |
| **Wave 5** | Agent Container Confinement & Hardening | **COMPLETED** | Roadmap Phase 3 |
| **Wave 6** | Agent API Identity (Short-Lived Task-Bound Tokens) | **COMPLETED** | Roadmap Phase 4 |
| **Wave 8** | Adversarial Boundaries & Invariant Verification | **COMPLETED** | Roadmap Phase 4 |

This roadmap's "COMPLETED" rows for Waves 1–3 and 7 were written by an earlier pass. A follow-up pass verified them directly against the running system rather than trusting the label — see `IMPROVEMENT_REPORT.md` for what that verification actually found, including a live authorization bypass in Wave 7 and an unused credential-renewal function from Wave 2, both fixed. Waves 4, 5, 6, and 8 below were implemented and verified live in that same follow-up pass.

## 1.1 Prompt 01.02 (`prompts/improvements/01_02_improvement.md`)

A second follow-up pass, prompted by `input/Codex_Feedback.md`'s review of the demo's presentation readiness rather than a new technical wave. Added: a stable human-subject identity and real delegation linkage in the evidence trail (Phase 1); task-completion-triggered credential revocation, closing a gap the original Wave 2 left open (Phase 2); a dashboard narrative view reconstructing the human-readable BAD/GOOD story live from real evidence (Phase 3); credential renewal/revocation-reason visibility in the UI (Phase 4); and an honest Phase 5 verdict against Codex's five demo-readiness criteria. Verification surfaced and fixed five genuine regressions along the way — see `IMPROVEMENT_REPORT_01_02.md` for the full account. **Result: PASS.**

---

## 2. Completed: Human AuthN & AuthZ (Wave 7)

- **Identity Topology (`./compose/identity/`)**:
  - OpenLDAP directory (`dc=factory,dc=local`) with group-of-names schema.
  - Keycloak OIDC broker (dual-hostname config, realm `factory`, client `factory-api`).
  - Seed users provisioned:
    - `raymon` (Raymon Epping) $\rightarrow$ `factory-operator`
    - `barend` (Barend Demo) $\rightarrow$ `factory-operator`
    - `claire` (Claire Viewer) $\rightarrow$ `factory-viewer`
- **Application Control Plane**:
  - Backend OIDC router (`/api/v1/auth/login`, `/callback`, `/me`, `/logout`) with server-side PostgreSQL sessions (`sessions` table).
  - RBAC policy guardrails: `factory-operator` can trigger tasks, switch BAD/GOOD profiles, and reset the factory; `factory-viewer` has read-only dashboard access.
  - Nuxt UI same-origin `/gateway` proxy and global route middleware protecting `/` with redirect to `/login`.

---

## 3. Logical Roadmap for Remaining Waves

### Phase 1: Documentation & Claim Alignment (Wave 1) — COMPLETED
- Corrected security claims in `docs/` and `security/authority-model.md` to match the exact implemented delegation semantics (GOOD intersects requested envelope with recipient ceiling; BAD intentionally assigns over-broad ceiling for demonstration).
- Clarified Sentinel input model (short-lived child token metadata `factory_agent=agent-c` rather than HTTP request headers).
- Updated documentation across `docs/` and `security/` to accurately reflect local Ollama inference, container network boundaries, egress limits, and the Keycloak/OpenLDAP human authentication layer.

### Phase 2: Credential & Token Lifecycle (Waves 2 & 3) — COMPLETED
- **Revocation Service**: Implemented centralized, idempotent revocation service in `backend/src/services/revocation.js`.
- **Automated Lifecycle Triggers**: Integrated lease/token cleanup across reset, profile switch, startup recovery, and policy denial containment.
- **Narrow Child Tokens**: Scoped child tokens strictly to `factory-agent-c-cred` policy via `no_default_policy: true`, preventing privilege leakage.
- **Task-Bounded TTLs**: Replaced 24h BAD role lifetime with short-lived 5m TTL (max 30m) bound to single-task executions.

### Phase 3: Traceability & Container Hardening (Waves 4 & 5)
- **Causal Context Propagation**: Ensure `trace_id`, `parent_task_id`, `run_id`, and `delegation_depth` propagate through all database mutations and Agent D findings.
- **Container Hardening**: Evaluate non-root execution, dropped capabilities (`cap_drop: [ALL]`), `no-new-privileges:true`, and read-only filesystems for agent containers.

### Phase 4: Machine Identity & Adversarial Bounds (Waves 6 & 8)
- **Task-Bound Agent Identity**: Replace static bearer tokens with short-lived, signed task-bound JWTs issued per delegation.
- **Adversarial Invariant Verification**: Add test suites verifying tool-schema boundary rejection, Sentinel child-token metadata enforcement, and prompt-injection resistance.
