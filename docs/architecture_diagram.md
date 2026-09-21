# Architecture diagram

This document maps the implemented Factory system as of the `2026-09-20_vault-kv-secrets-migration-complete` state baseline. The first diagram shows runtime traffic. A separate diagram isolates startup-only secret delivery so those paths are not confused with agent runtime access.

## System architecture

```mermaid
flowchart TB
  subgraph ACCESS["Human access"]
    OP["Raymon and Barend<br/>factory-operator"]
    VIEW["Claire<br/>factory-viewer"]
    UI["Nuxt 4 dashboard<br/>server-side gateway<br/>localhost:3000"]
    OP -->|"browser"| UI
    VIEW -->|"browser"| UI
  end

  subgraph IDENTITY["Human identity plane"]
    LDAP["OpenLDAP 1.5<br/>users and groups"]
    KC["Keycloak 26.6<br/>factory realm<br/>OIDC provider"]
    LDAP -->|"federated users and groups"| KC
  end

  subgraph CONTROL["Factory control plane"]
    API["Factory API · Express / Node.js · localhost:3001<br/>OIDC sessions and viewer/operator policy<br/>agent JWT broker and task routing<br/>effective-authority checks and typed tools<br/>causal evidence and SSE"]
  end

  subgraph AGENTS["Autonomous agent plane"]
    A["Agent A<br/>Incident Coordinator"]
    BB["Agent B<br/>Operations Investigator"]
    CC["Agent C<br/>Data Remediation"]
    D["Agent D<br/>Detection-only observer"]
    LLM["Ollama<br/>qwen3:4b-instruct<br/>localhost:11434"]
  end

  subgraph VAULTPLANE["Vault security plane — factory namespace"]
    VS["vault-s<br/>Transit auto-unseal"]
    VHA["Vault Enterprise HA<br/>vault-1 / vault-2 / vault-3<br/>integrated Raft storage"]
    VA["Vault Agent<br/>factory-api AppRole<br/>auto-auth and renewal"]
    KV["KV v2<br/>static secret source of truth"]
    SENT["Sentinel EGP<br/>agent-c metadata required"]
    DBSE["Database secrets engine<br/>BAD / GOOD / backend roles"]
    VS -->|"Transit seal"| VHA
    VA -->|"AppRole auto-auth"| VHA
    VHA --- KV
    VHA --- SENT
    VHA --- DBSE
    SENT -->|"hard-mandatory check"| DBSE
  end

  subgraph DATA["Data and evidence plane"]
    PG["PostgreSQL 16<br/>domain data<br/>evidence and sessions<br/>localhost:5432"]
  end

  UI -->|"same-origin /gateway relay<br/>HttpOnly session cookie"| API
  API <-->|"OIDC browser redirect and back-channel exchange<br/>Authorization Code + PKCE"| KC
  API -.->|"direct browser SSE<br/>unauthenticated localhost surface"| UI

  API -->|"root task event"| A
  A -->|"task JWT<br/>tools and delegation request"| API
  API -->|"delegated task event"| BB
  BB -->|"task JWT<br/>tools and delegation request"| API
  API -->|"delegated task event"| CC
  CC -->|"task JWT<br/>credential request and typed tools"| API
  API -->|"run-bound event stream"| D
  D -->|"run JWT<br/>correlated findings"| API

  A -->|"reasoning"| LLM
  BB -->|"reasoning"| LLM
  CC -->|"reasoning"| LLM
  D -->|"finding narrative only"| LLM

  VA -->|"renewed token file"| API
  API <-->|"KV reads; child-token creation;<br/>lease issue, renewal and revocation"| VHA
  DBSE -->|"create and revoke<br/>dynamic PostgreSQL roles"| PG
  API -->|"parameterized data operations;<br/>sessions and evidence"| PG

  classDef human fill:#e8f1ff,stroke:#2563eb,color:#172554,stroke-width:2px
  classDef identity fill:#f3e8ff,stroke:#7e22ce,color:#3b0764,stroke-width:2px
  classDef control fill:#fff7d6,stroke:#ca8a04,color:#422006,stroke-width:2px
  classDef agent fill:#e8fff4,stroke:#059669,color:#052e2b,stroke-width:2px
  classDef vault fill:#fff0f0,stroke:#dc2626,color:#450a0a,stroke-width:2px
  classDef data fill:#f1f5f9,stroke:#475569,color:#0f172a,stroke-width:2px

  class OP,VIEW,UI human
  class LDAP,KC identity
  class API control
  class A,BB,CC,D,LLM agent
  class VS,VHA,VA,KV,SENT,DBSE vault
  class PG data
```

## Controlled startup paths

These paths run before normal agent work. The agent containers remain Vault-blind.

```mermaid
flowchart LR
  VHA["Vault Enterprise HA"] --- KV["KV v2<br/>static secret source of truth"]

  IDS["identity-secrets-init<br/>one-shot narrow AppRole"]
  SYNC["Host agent-secret sync<br/>Vault-admin read"]
  ENV["Ignored agents/.env<br/>bootstrap tokens only"]

  LDAP["OpenLDAP<br/>admin password file"]
  KC["Keycloak<br/>admin and OIDC secret files"]
  AGENTS["Agents A–D<br/>no Vault token"]

  IDS -->|"AppRole login and KV reads"| VHA
  IDS --> LDAP
  IDS --> KC
  SYNC -->|"KV reads"| VHA
  SYNC --> ENV
  ENV --> AGENTS

  classDef vault fill:#fff0f0,stroke:#dc2626,color:#450a0a,stroke-width:2px
  classDef bootstrap fill:#faf5ff,stroke:#9333ea,color:#3b0764,stroke-width:2px,stroke-dasharray:5 5
  classDef identity fill:#f3e8ff,stroke:#7e22ce,color:#3b0764,stroke-width:2px
  classDef agent fill:#e8fff4,stroke:#059669,color:#052e2b,stroke-width:2px

  class VHA,KV vault
  class IDS,SYNC,ENV bootstrap
  class LDAP,KC identity
  class AGENTS agent
```

## Runtime authority flow

```mermaid
sequenceDiagram
  autonumber
  actor Operator as Authenticated operator
  participant UI as Nuxt dashboard
  participant API as Factory API
  participant A as Agent A
  participant B as Agent B
  participant C as Agent C
  participant V as Vault
  participant PG as PostgreSQL
  participant D as Agent D

  Operator->>UI: Start BAD or GOOD demonstration
  UI->>API: Create Agent A task with session cookie
  API->>PG: Record run, root task, human subject, trace ID
  API-->>A: Publish task event
  A->>API: Exchange static bootstrap token for task JWT
  A->>API: Read health and delegate investigation
  API->>PG: Record decision and A-to-B delegation
  API-->>B: Publish child task with the same trace ID
  B->>API: Exchange bootstrap token for task JWT
  B->>API: Investigate and delegate remediation
  API->>PG: Record decision and B-to-C delegation
  API-->>C: Publish child task with the same trace ID
  C->>API: Exchange bootstrap token for task JWT
  C->>API: Request a database credential
  API->>V: Mint scoped child token with agent-c metadata
  V->>V: Sentinel checks the credential request
  V->>PG: Create profile-specific dynamic database role
  V-->>API: Return leased username and password
  Note over API,C: The API retains the password<br/>Agent C receives lease metadata only
  C->>API: Call a typed remediation tool
  API->>API: Evaluate effective authority

  alt BAD profile
    API->>PG: Execute with factory-bad-role
    PG-->>API: Broad mutation can succeed
  else GOOD profile
    API->>API: Reject destructive action outside effective authority
    API->>PG: Execute permitted status update with factory-good-role
    PG-->>API: Database grants enforce the bounded operation
  end

  API->>PG: Record policy, credential and database evidence
  API-->>D: Publish evidence through SSE
  D->>API: Record deterministic finding
  API-->>UI: Stream evidence and findings
  C->>API: Mark task complete
  API->>V: Revoke lease and child token
  API->>PG: Record revocation evidence
```

## Identity and authorization boundaries

| Identity domain | Credential presented at runtime | Enforced boundary |
| --- | --- | --- |
| Raymon and Barend | Keycloak-authenticated, opaque Factory session cookie | `factory-operator`: dashboard reads and demo controls |
| Claire | Keycloak-authenticated, opaque Factory session cookie | `factory-viewer`: dashboard reads; no start, profile switch, or reset |
| Agent A, B, and C | Short-lived JWT bound to actor, active run, and active task | Agent tool schema, JWT validation, fixed delegation graph, API policy |
| Agent D | Short-lived JWT bound to actor and current run | Detection and finding creation only |
| Factory API | Vault Agent-renewed AppRole token | Factory API ACL policy and Sentinel |
| Identity secret bootstrap job | Separate, narrow AppRole token | Read-only access to identity bootstrap secrets |
| PostgreSQL dynamic role | Vault-issued username and password retained by the API | BAD or GOOD database grants and lease lifetime |

The static per-agent bearer token is a bootstrap credential only. It can request a task-bound or run-bound JWT from `/api/v1/agents/token`; it cannot call agent tools, delegate, or request a database credential directly.

## Network placement

| Network or boundary | Members |
| --- | --- |
| `factory-control` | UI, API, OpenLDAP, Keycloak, PostgreSQL, Ollama, Agents A–D |
| `factory-vault-internal` | Vault HA cluster, Vault Agent, API, one-shot identity secret bootstrap job |
| Host-published endpoints | UI `3000`, API `3001`, PostgreSQL `5432`, Ollama `11434`, Keycloak `8088`, LDAP admin `8085`, Vault `18190` and `18200–18202`; all bind to `127.0.0.1` |

The API and identity secret bootstrap job bridge the control and Vault networks for their defined purposes. Agent containers do not receive a Vault token, a PostgreSQL password, an arbitrary SQL tool, or a host filesystem mount.

## Accuracy notes

- The dashboard shell and state-changing control routes require a human session. Raymon and Barend are operators; Claire is a viewer.
- Browser API calls use the Nuxt `/gateway` route so the HTTP-only session cookie remains same-origin.
- The browser-facing OIDC login and callback also pass through `/gateway`. The Factory API owns PKCE state, callback validation, and the back-channel token exchange with Keycloak.
- The browser's live SSE connection currently goes directly to `localhost:3001/api/events/stream`. The SSE and historical telemetry routes remain unauthenticated localhost surfaces; the diagram does not present them as session-protected.
- Vault KV is the source of truth for static secrets. The API reads its secrets directly, third-party identity containers receive files from a one-shot bootstrap job, and Vault-blind agent containers receive only their bootstrap token through the host sync path.
- BAD and GOOD use the same Agent C code and typed tools. BAD deliberately assigns the unsafe ceiling and broad database role. GOOD intersects the requested envelope with the recipient ceiling and uses the bounded role.
- Ollama supplies reasoning and Agent D narrative text. Deterministic code controls identity, authorization, credential brokerage, database execution, and finding severity.
- `factory-control` is a local demo network, not a production egress-control boundary.

## Source map

| Diagram area | Authoritative implementation |
| --- | --- |
| Human identity and groups | `compose/identity/`, `backend/src/auth/`, `ui/app/middleware/auth.global.ts` |
| Nuxt gateway and session relay | `ui/server/routes/gateway/`, `ui/app/composables/useDemoApi.ts` |
| Agent identity | `backend/src/auth/agentJwt.js`, `backend/src/middleware/agentJwtAuth.js`, `backend/src/routes/agentToken.js` |
| Delegation and authority | `backend/src/routes/delegations.js`, `backend/src/policy.js` |
| Vault brokerage | `compose/vault/`, `backend/src/vault.js`, `terraform/vault-platform/`, `terraform/vault-sentinel/` |
| Dynamic PostgreSQL roles | `terraform/vault-database/`, `backend/src/routes/credentials.js` |
| Evidence and detection | `backend/src/audit.js`, `backend/src/routes/events.js`, `agents/identities/agent-d.js` |
| Static secret delivery | `terraform/vault-secrets/`, `scripts/agents-secrets-sync.sh`, `compose/identity/identity-secrets/` |
