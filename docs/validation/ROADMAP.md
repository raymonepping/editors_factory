# Project Improvement Roadmap: The Editor's Factory

This document tracks the verified findings from `Codex_Validation.md` and `Navi_Validation.md` and defines the logical roadmap for executing the remaining improvement waves from `prompts/improvements/01_01_improvement.md`.

---

## 1. Status Overview

| Wave | Domain | Status | Target Phase |
| :--- | :--- | :---: | :--- |
| **Wave 7** | **Human AuthN & AuthZ (OpenLDAP + Keycloak)** | **COMPLETED** | Current Cycle |
| **Wave 1** | **Stale Security Documentation & Claim Realignment** | **COMPLETED** | Roadmap Phase 1 |
| **Wave 2** | **Credential & Dynamic Lease Lifecycle Management** | **COMPLETED** | Roadmap Phase 2 |
| **Wave 3** | **Token Scope Narrowing & Task-Bounded TTLs** | **COMPLETED** | Roadmap Phase 2 |
| **Wave 4** | End-to-End Causal Tracing Linkage | **PLANNED** | Roadmap Phase 3 |
| **Wave 5** | Agent Container Confinement & Hardening | **PLANNED** | Roadmap Phase 3 |
| **Wave 6** | Agent API Identity (Short-Lived Task-Bound Tokens) | **PLANNED** | Roadmap Phase 4 |
| **Wave 8** | Adversarial Boundaries & Invariant Verification | **PLANNED** | Roadmap Phase 4 |

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
