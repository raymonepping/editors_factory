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

Vault Agent authenticates the API through AppRole and renews its parent token. When Agent C requests a database credential, the API creates a short-lived child token tagged with `factory_agent=agent-c`. A hard-mandatory Sentinel endpoint policy requires that metadata for the two Agent C credential paths.

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
