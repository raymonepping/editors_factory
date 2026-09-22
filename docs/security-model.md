# Security model

The Factory demonstrates that task delegation and authority delegation are different operations. An agent can discover a problem or request a remedy without gaining the right to perform every possible remedy.

## Core terms

**Authority envelope** is the set of actions requested for a delegation.

**Authority ceiling** is the maximum set an identity may receive under a profile.

**Effective authority** is the enforced set available to the recipient. In the GOOD profile it is the intersection of the requested envelope and the recipient's ceiling. The BAD profile intentionally violates this rule for Agent C by assigning its fixed overbroad ceiling.

**Credential lease** is a short-lived PostgreSQL identity issued by Vault for one database role. A lease is evidence of temporary access, not a transfer of the plaintext password to an agent.

## Identity boundaries

Each agent runs in its own container and receives one distinct API bearer token. The API maps that token to a fixed actor identity. Agents cannot select another identity in a request body.

The fixed delegation graph is:

```text
human -> Agent A -> Agent B -> Agent C
                      |
                      +-- events observed by Agent D
```

Only a human can create the initial Agent A task. Agent A may delegate to B, and B may delegate to C. Agent D does not join the delegation chain; it reads events and creates findings.

## Enforcement layers

### API policy

Every agent tool request passes through bearer-token authentication and an authority decision. The API records ALLOW and DENY outcomes in `authority_decisions`. Unsupported filters are rejected before SQL is built, and query values use parameters.

### Vault policy and Sentinel

Vault Agent authenticates the API through AppRole and renews its parent token. When Agent C requests a database credential, the API creates a short-lived child token tagged with `factory_agent=agent-c` and `factory_task=<the current task's ID>`. A hard-mandatory Sentinel endpoint policy requires both pieces of metadata for the two Agent C credential paths — not just the role tag.

Be precise about what the task-id check actually proves. Sentinel evaluates only what's present in the request and the token at policy-check time; it has no way to query the application's own database, so it cannot confirm this is the *correct* current task — only that some non-empty task ID was bound to the token when it was minted, which makes a task-less (or accidentally blank) credential request structurally impossible rather than merely discouraged by application-code discipline. Confirming the task ID is the *right* one is `scripts/vault-audit-crosscheck.py`'s job: it independently compares the task ID Vault's own audit log recorded against `credential_events.task_id` for the same lease, live-verified to catch a mismatch — that script, not Sentinel, is the layer with an actual database to check against.

Sentinel does not inspect an HTTP header here. Live testing showed that Vault's Sentinel request object does not expose request headers for this purpose. Token metadata is the enforced mechanism.

Hard-mandatory Sentinel policy does not constrain the cluster's own root token — live testing against this Vault install confirmed the root token bypasses both endpoint governing policies here, `require-agent-c-for-db-creds` included. That is why routine Vault administration (every Terraform apply after the first, and the entitlement check) uses a separate, narrowly-scoped, periodic `vault-admin` token instead of the root token — see [Operations](operations.md#vault-maintenance). The root token itself is reserved for initial cluster bootstrap, not treated as a standing operational credential.

### Dynamic database identities

Vault creates a PostgreSQL role for each lease. The API retains the username and password in process memory and gives Agent C only the role name, lease ID, lifetime, and issuance status. Mutating routes use the retained credential on Agent C's behalf.

The GOOD database role can read required records and execute `set_order_status`. That security-definer function restricts the mutation to an order status change. It exists because live testing showed that the Vault PostgreSQL plugin did not preserve the intended column-level `UPDATE` grant.

The BAD database role has intentionally excessive mutation grants. That defect is the subject of the demonstration.

### Static secrets (Vault KV)

`prompts/improvements/01_07_vault_kv_secrets_migration.md` moved the
per-agent bearer tokens, the JWT signing secret, the CLI operator token,
the OIDC client secret, and OpenLDAP's/Keycloak's admin passwords into a
KV v2 mount (`secret/`) inside the `factory` namespace — Vault is now
their source of truth, not a hand-edited `.env` line. Three separate
mechanisms deliver them to their actual consumers, deliberately not one:
factory-api reads its own four directly from Vault at startup
(`backend/src/vault.js`); the agent-a/b/c/d containers still receive
only a plain environment variable, generated and audited in Vault but
delivered by a host-side sync script (`scripts/agents-secrets-sync.sh`)
— giving those containers any Vault credential at all, even a narrow
one, would violate "no agent container ever holds a Vault credential"
(`security/authority-model.md`); and OpenLDAP/Keycloak, third-party
images this project does not control the source of, receive theirs via
a dedicated one-shot `identity-secrets-init` container using its own
separate, narrower AppRole — a different trust domain from factory-api's
own, matching this project's established pattern of separate security
domains for human/agent/CLI-operator identity.

This closes what was previously an open scope limit (no KV engine, every
static secret living in `.env` with no real rotation path). It does not
make rotation automatic — see [Operations](operations.md#vault-kv-secrets-rotation)
for the real procedure, including the genuine caveat that OpenLDAP's and
Keycloak's own bootstrap images only apply a password change on true
first initialization, not on every restart.

### Supervised credential approval (Vault Control Groups)

`prompts/improvements/01_08_agentic_iam_inspired_hardening.md` Phase 4
adds a third, deliberately supervised path alongside BAD/GOOD, gated
by Vault Enterprise's Control Groups feature (confirmed entitled on
this license). It never touches the normal unattended demo flow — a
run only ever needs one credential by design, so `routes/credentials.js`
treats a second credential request within the same run as a
deterministic, checkable anomaly and routes it through a different
policy (`factory-agent-c-cred-supervised`) instead of the normal one.

Under that policy, `database/creds/*` returns a Vault response-wrapping
token instead of the credential — the credential does not exist
outside Vault until a human authorizes it. Authorization requires a
Vault *identity*: a dedicated `control-group-authorizer` AppRole,
entity, and identity group (`terraform/vault-platform/control_groups.tf`),
used only at the moment a human clicks Authorize in the dashboard and
never held standing. The backend, not the human, performs the actual
Vault calls — no human session ever holds a Vault credential either,
the same boundary `security/authority-model.md` already draws for
agents.

Two findings from building this, live-verified rather than assumed:

- A Control Group's approval stays tied to the *original requesting
  child token* remaining valid, not only to the wrapping token's own
  (much longer) TTL — authorizing after that child token has expired
  returns `approved: false` and the request becomes permanently
  unusable. The child token minted for this path therefore uses a
  separate, generous window (`SUPERVISED_APPROVAL_WINDOW_SECONDS`,
  30 minutes) instead of reusing the database role's own short TTL.
- The authorizing identity's own token must also remain valid through
  the *unwrap* step, not only through the authorize call itself —
  revoking it immediately after authorizing (the obvious "hold it for
  the shortest possible window" instinct) broke every unwrap. Its
  short AppRole-configured TTL (5 minutes) is what actually bounds it
  now, not an explicit revoke.

### Network isolation

Vault servers attach only to `factory-vault-internal`. Agents, PostgreSQL, Ollama, and the dashboard attach to `factory-control`. The API is the only application component on both networks. Host ports bind to `127.0.0.1`.

Detailed container evidence is recorded in the "Containment rules" section of `security/authority-model.md`.

## Authority by agent

| Agent | Intended authority |
| --- | --- |
| A | Read health and delegate investigation |
| B | Read health, orders, and products; record a restart; delegate remediation |
| C, GOOD | Read orders and products, request a credential, update order status |
| C, BAD | GOOD actions plus price changes, product insert/delete, and order delete |
| D | Create findings from observed events |

The exact action strings and ceilings are defined in `backend/src/policy.js`. That file is authoritative when this summary changes.

## Audit and detection

The API publishes evidence after writes to the evidence tables. Agent D applies deterministic classifications, then may use Ollama to produce a short narrative. Finding identifiers and correlation fields tie detections to source events.

The dashboard's traffic-light state reflects evidence:

- **NORMAL**: no harmful action is present;
- **ELEVATED**: attention-worthy activity is underway — not only suspicious or denied action, but any database-tier credential issuance and any delegation that reaches the remediation agent, since both are worth a human noticing even when fully authorized;
- **CRITICAL**: destructive data loss occurred;
- **CONTAINED**: a dangerous request was denied by the bounded profile.

Factory state is derived separately from database data. It is `HEALTHY`, `DEGRADED`, or `FAILED`; a destructive delete in the current run produces `FAILED`.

## Reset and revocation

`make reset` performs two operations with separate identities:

1. the API revokes known Vault leases and clears evidence through its bounded backend credential;
2. the host applies `scripts/seed.sql` as the PostgreSQL management user to restore domain data.

The API is intentionally unable to reset product and order tables with its own credential. Combining these operations would weaken the boundary the demo is meant to show.

## Known scope limits

This local demonstration implements human authentication and RBAC via Keycloak OIDC/OpenLDAP for the web UI and control plane, but does not provide transport encryption (TLS) for localhost container-to-container traffic, general multi-hop delegation graphs, or strict host-level container network egress filtering. Model inference is strictly local to Ollama. Do not expose its published ports to an untrusted network.

Every static secret now has a real source of truth and a real, if manual, rotation path (Vault KV — see [Static secrets (Vault KV)](#static-secrets-vault-kv) above), but rotation is still an operator-run procedure, not scheduled or automatic, and the per-agent bearer tokens themselves do not expire or rotate on their own between operator-run rotations.

### The backend's own AppRole identity — assessed, not replaced

`prompts/improvements/01_08_agentic_iam_inspired_hardening.md` Phase 5
asked whether the backend's own Vault identity (a static AppRole
`role_id`/`secret_id` pair, `FACTORY_VAULT_ROLE_ID`/`SECRET_ID`) should
be replaced with SPIFFE workload identity instead — HashiCorp's own
"Vault Trusted Identity Brokering" validated pattern explicitly names
long-lived AppRole credentials as the anti-pattern it recommends moving
away from, in favor of platform-native identity. `SPIFFE Auth Engine`
is entitled on this Vault license, confirmed live (`vault auth enable
spiffe` succeeds; its own config immediately asks for a `trust_domain`,
confirming the mount genuinely works, not just that the feature name
appears in the license).

That is where this environment's support for the idea ends. SPIFFE
workload identity requires a running SPIRE server issuing SVIDs and a
SPIRE agent performing workload attestation for each identity it
issues — infrastructure this project has none of, and Podman has no
first-party SPIRE attestation plugin the way Kubernetes does (SPIRE's
maintained attestors target Kubernetes, Docker, and generic Unix
process/binary attributes; a Podman-specific plugin was not found, and
whether the Docker attestor works unmodified against Podman's
Docker-compatible socket was not tested — the honest position is
"unverified," not "known to work"). Standing up SPIRE, wiring an
attestor that can actually recognize the `factory-api` container
specifically, and integrating it with `auth/spiffe`'s own trust-bundle
configuration is realistically its own multi-day project, not an
extension of this one.

Weighed against what it would actually buy: the backend's AppRole
`secret_id` is already the *only* standing credential of its kind
anywhere in this system (every agent, and the human path, hold nothing
Vault-facing at all — see "Why agents do not hold Vault credentials
directly" in `security/authority-model.md`), it is narrowly scoped to
one policy, has a 90-day TTL with a documented renewal procedure (not
eternal), and the root token it could otherwise have depended on was
already eliminated in `01_06`. SPIFFE would remove that one remaining
static secret in favor of an identity re-attested on every login — a
real improvement in the abstract, but for a single-node local
demonstration, the infrastructure it requires is disproportionate to
the credential it would replace.

**Recommendation: not now.** If this project ever runs on a platform
that already has a workload identity story — Kubernetes with SPIRE
already deployed, or a cloud platform with its own native workload
identity Vault already supports (AWS IAM, GCP, Azure) — replacing the
AppRole pair with that platform's native auth method is the right next
step, and should get its own scoped prompt at that point, verified
live the same way every other claim in this project's own Vault
integration has been.
