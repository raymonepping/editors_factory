// src/vault.js — reads the Vault Agent-rendered token, mints the
// short-lived factory_agent=agent-c child token, brokers database
// credentials, revokes leases. Does NOT perform AppRole login itself —
// Vault Agent (compose/vault/vault-agent/) already owns that.
//
// TLS trust: the container sets NODE_EXTRA_CA_CERTS to the Factory CA
// chain (see compose/api/compose.yaml), so plain `fetch()` already
// trusts vault-1/2/3's certificates without any custom agent/dispatcher
// code here.

import { readFile } from "node:fs/promises";
import { config } from "./config.js";

async function readAgentToken() {
  const raw = await readFile(config.vault.tokenFile, "utf8");
  const token = raw.trim();
  if (!token) {
    throw new Error(
      `Vault Agent token file is empty: ${config.vault.tokenFile}`,
    );
  }
  return token;
}

async function vaultRequest(method, path, { token, body } = {}) {
  const url = `${config.vault.addr}/v1/${path}`;
  const headers = {
    "X-Vault-Token": token,
    "X-Vault-Namespace": config.vault.namespace,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const errors = data?.errors?.join("; ") || res.statusText;
    const err = new Error(
      `Vault ${method} ${path} failed: ${res.status} ${errors}`,
    );
    err.status = res.status;
    err.vaultErrors = data?.errors;
    throw err;
  }
  return data;
}

/** Reads one field from a KV v2 secret at `secret/<path>`, using the
 * Vault Agent-rendered factory-api token. KV v2 double-nests its payload
 * (`{data: {data: {...}}}`) — this returns the inner object. */
async function getKvSecret(path) {
  const data = await vaultRequest("GET", `secret/data/${path}`, {
    token: await readAgentToken(),
  });
  return data.data.data;
}

/**
 * prompts/improvements/01_07_vault_kv_secrets_migration.md: fetches the
 * static secrets factory-api itself consumes (agent bearer tokens for
 * validating incoming requests, the JWT signing secret, the CLI operator
 * token, the OIDC client secret) from Vault KV and writes them into the
 * already-imported `config` object in place — every consumer of `config`
 * already reads these fields inside a function body at call time, not at
 * its own module load time (checked directly before writing this), so
 * mutating the shared object here, before `app.listen()`, is sufficient;
 * nothing needs to re-import `config` afterward.
 *
 * Fails fast, matching db.js's own createBackendPool: a demo that cannot
 * reach its own secrets should not start half-configured.
 */
export async function loadSecretsFromVault(config) {
  const [agents, jwt, cli, oidcSecret] = await Promise.all([
    getKvSecret("agents/bearer-tokens"),
    getKvSecret("backend/jwt-signing-secret"),
    getKvSecret("backend/cli-operator-token"),
    getKvSecret("identity/oidc-client-secret"),
  ]);

  for (const id of ["agent-a", "agent-b", "agent-c", "agent-d"]) {
    const field = id.replace("-", "_"); // agent-a -> agent_a
    const value = agents[field];
    if (!value)
      throw new Error(`Vault KV agents/bearer-tokens missing field "${field}"`);
    config.agentTokens[id] = value;
  }
  if (!jwt.value)
    throw new Error(
      'Vault KV backend/jwt-signing-secret missing field "value"',
    );
  config.auth.agentJwtSecret = jwt.value;
  if (!cli.value)
    throw new Error(
      'Vault KV backend/cli-operator-token missing field "value"',
    );
  config.auth.cliOperatorToken = cli.value;
  if (!oidcSecret.value)
    throw new Error(
      'Vault KV identity/oidc-client-secret missing field "value"',
    );
  config.oidc.clientSecret = oidcSecret.value;
}

/**
 * Mints a short-lived child token from the Vault Agent-rendered
 * factory-api token, tagged with metadata identifying the calling agent.
 * The require-agent-c-for-db-creds Sentinel EGP checks this metadata —
 * not a request header, which Vault Enterprise's Sentinel `request`
 * object does not expose (see prompts/base_project/02_02_vault_follow_up.md
 * for the full account of why).
 *
 * `ttlSeconds` must be >= the TTL of whatever the token is about to
 * request. Found live: Vault ties a dynamic secret's lease to the
 * client token that requested it — when that token expires (or is
 * otherwise revoked), Vault cascade-revokes every lease created through
 * it, regardless of the lease's OWN configured TTL. An earlier version
 * of this function hardcoded `ttl: '60s'` (short-lived "just long enough
 * to make one call" felt safest), which meant every database credential
 * this function ever brokered — including factory-backend-role's 1h
 * pool credential and factory-bad-role's 24h credential — was silently
 * dropped from PostgreSQL (via the role's revocation_statements) about
 * 60-75s after issuance, no matter what `database/creds/*` itself
 * reported as `lease_duration`. Reproduced directly: minted a 60s child
 * token, read database/creds/factory-backend-role (lease_duration=3600
 * reported), confirmed the dynamic role existed in pg_roles immediately
 * after, then confirmed it was gone ~75s later while Vault's own
 * `sys/leases/lookup` still showed ~59m of TTL remaining on the lease —
 * i.e. Vault's lease bookkeeping and the actual PostgreSQL state had
 * silently diverged. The token's own policy scope is already identical
 * to its AppRole parent (no_default_policy is left false, no narrower
 * policy is attached) — the metadata tag, not the TTL, is what's meant
 * to bound it — so lengthening the TTL to match the credential's own
 * lifetime doesn't widen this token's authority, only its lifespan.
 */
/**
 * `dagContext` (v2, prompts/v2/02_03) is optional and additive — every
 * existing v1 call site passes none, and gets exactly the same token
 * shape as before plus one new always-present tag. Shape:
 * `{ workflowMode, runId, nodeId, nodeKey, attemptId, attemptNumber, profile }`.
 * `factory_workflow_mode` is the one field set unconditionally — Sentinel
 * (terraform/vault-sentinel/main.tf) branches on it to decide whether the
 * rest of the attempt fields are required, so unlike factory_task it
 * can't be conditionally omitted; "fixed_chain" is the correct default
 * for every caller that passes no dagContext at all.
 */
export async function mintAgentTaggedChildToken(
  agentId,
  ttlSeconds,
  policies = null,
  taskId = null,
  dagContext = null,
) {
  const parentToken = await readAgentToken();
  const meta = { factory_agent: agentId };
  // prompts/improvements/01_08_agentic_iam_inspired_hardening.md Phase 2:
  // require-agent-c-for-db-creds now also requires this metadata key to
  // be present and non-empty (verified live) — closes the narrow gap
  // where a factory_agent=agent-c child token could exist without any
  // task binding at all. Vault token metadata values must be strings;
  // taskId is already a UUID string, no conversion needed. Omitted
  // entirely (not set to an empty string) when there is no task — the
  // Sentinel rule's own `else ""` only needs to handle the key being
  // absent, and factory-backend-role's own credential path (this
  // function's other caller, db.js) isn't gated by that EGP at all.
  if (taskId) {
    meta.factory_task = taskId;
  }
  meta.factory_workflow_mode = dagContext?.workflowMode || "fixed_chain";
  if (dagContext?.workflowMode === "recoverable_dag") {
    meta.factory_run_id = dagContext.runId;
    meta.factory_node_id = dagContext.nodeId;
    meta.factory_node_key = dagContext.nodeKey;
    meta.factory_attempt_id = dagContext.attemptId;
    meta.factory_attempt_number = String(dagContext.attemptNumber);
    meta.factory_profile = dagContext.profile;
  }
  const body = {
    orphan: false,
    ttl: `${ttlSeconds}s`,
    meta,
    no_default_policy: true,
  };
  if (policies && policies.length) {
    body.policies = policies;
  }
  const data = await vaultRequest("POST", "auth/token/create", {
    token: parentToken,
    body,
  });
  return {
    clientToken: data.auth.client_token,
    accessor: data.auth.accessor,
  };
}

// Child-token TTL per database role — bounded to task lifetime
const DB_ROLE_TOKEN_TTL_SECONDS = {
  "factory-bad-role": 300 + 30, // matches default_ttl 5m (Wave 3)
  "factory-good-role": 120 + 30, // matches default_ttl 2m
  "factory-backend-role": 3600 + 30, // matches default_ttl 1h
};

/**
 * Issues a dynamic PostgreSQL credential from the given database role
 * (factory-bad-role | factory-good-role | factory-backend-role), using a
 * scoped child token tagged for the calling agent. `taskId` is required
 * in practice for factory-bad-role/factory-good-role — the Sentinel EGP
 * now denies the request without it (see mintAgentTaggedChildToken's own
 * comment) — and irrelevant for factory-backend-role, which has no task.
 */
export async function issueDatabaseCredential(
  role,
  agentId,
  taskId = null,
  dagContext = null,
) {
  const ttlSeconds = DB_ROLE_TOKEN_TTL_SECONDS[role];
  if (!ttlSeconds) {
    throw new Error(
      `issueDatabaseCredential: unknown role "${role}" — no child-token TTL mapped`,
    );
  }
  // Scope child token to narrowest policy
  const policies =
    role === "factory-backend-role"
      ? ["factory-api"]
      : ["factory-agent-c-cred"];
  const { clientToken, accessor } = await mintAgentTaggedChildToken(
    agentId,
    ttlSeconds,
    policies,
    taskId,
    dagContext,
  );
  const data = await vaultRequest("GET", `database/creds/${role}`, {
    token: clientToken,
  });
  return {
    username: data.data.username,
    password: data.data.password,
    leaseId: data.lease_id,
    leaseDuration: data.lease_duration,
    tokenAccessor: accessor,
  };
}

/**
 * Issues a dynamic PostgreSQL credential through the Control-Group-gated
 * supervised policy instead of the normal factory-agent-c-cred one
 * (prompts/improvements/01_08_agentic_iam_inspired_hardening.md Phase 4)
 * — used only when the backend's own anomaly trigger fires
 * (routes/credentials.js), never for the normal unattended demo-bad/
 * demo-good flow. Vault does not release the credential here: it
 * returns a wrap_info block (a limited-duration wrapping token plus
 * its accessor) instead of `data`, confirmed live before writing this.
 * Returns that wrap info for the caller to hold as a pending approval —
 * see authorizeControlGroupRequest() and unwrapCredential() for the
 * other two steps of this three-step flow.
 *
 * Deliberately does NOT reuse DB_ROLE_TOKEN_TTL_SECONDS here. Found
 * live: a Control Group's approval stays tied to the ORIGINAL
 * requesting child token remaining valid — authorizing after that
 * token has expired returns `approved: false` ("Request needs further
 * authorization") and the pending request becomes permanently
 * unusable, even though the wrapping token itself has a much longer
 * default TTL (24h). The database role's own short TTL (2-5 minutes)
 * is nowhere near enough time for a human to actually notice and click
 * approve — it would make this path fail almost every time by
 * construction. SUPERVISED_APPROVAL_WINDOW_SECONDS below is a
 * separate, generous window for the wait itself; the eventually-issued
 * credential still gets its own normal (short) lease from the role's
 * own default_ttl once unwrapped, confirmed live to be unaffected by
 * how long the approval took.
 */
const SUPERVISED_APPROVAL_WINDOW_SECONDS = 1800; // 30 minutes

export async function issueSupervisedDatabaseCredential(role, agentId, taskId) {
  const { clientToken } = await mintAgentTaggedChildToken(
    agentId,
    SUPERVISED_APPROVAL_WINDOW_SECONDS,
    ["factory-agent-c-cred-supervised"],
    taskId,
  );
  const data = await vaultRequest("GET", `database/creds/${role}`, {
    token: clientToken,
  });
  if (!data.wrap_info) {
    throw new Error(
      "issueSupervisedDatabaseCredential: expected a Control-Group wrap_info response but Vault returned a credential directly — the supervised policy's control_group block may be missing or misconfigured",
    );
  }
  return {
    wrapToken: data.wrap_info.token,
    wrapAccessor: data.wrap_info.accessor,
    wrapTtl: data.wrap_info.ttl,
  };
}

/**
 * Authorizes one pending Control Group request, called only at the
 * moment a human clicks "Authorize" in the dashboard. Logs in fresh as
 * the control-group-authorizer AppRole identity for this one call —
 * that identity is never held standing (its own AppRole role_name
 * token_ttl is 5 minutes, terraform/vault-platform/control_groups.tf —
 * it expires on its own shortly after, no explicit revoke needed).
 *
 * Deliberately does NOT revoke this token before returning, even
 * though that was the original design. Found live: Vault re-validates
 * the authorizing identity at UNWRAP time, not only at the moment
 * authorize() is called — revoking the authorizer's token immediately
 * after authorizing (the obvious "hold it for the shortest possible
 * window" instinct) made every subsequent unwrap fail with "Request
 * needs further authorization", reproduced twice, fixed once by simply
 * not revoking early. The credentials.js route unwraps immediately
 * after calling this, so the token only needs to survive that one
 * extra round trip — its own short TTL already bounds it tightly
 * enough after that.
 */
export async function authorizeControlGroupRequest(accessor) {
  const roleId = config.controlGroup.authorizerRoleId;
  const secretId = config.controlGroup.authorizerSecretId;
  if (!roleId || !secretId) {
    throw new Error(
      "authorizeControlGroupRequest: CONTROL_GROUP_AUTHORIZER_ROLE_ID/SECRET_ID not configured",
    );
  }
  const login = await vaultRequest("POST", "auth/approle/login", {
    body: { role_id: roleId, secret_id: secretId },
  });
  const authorizerToken = login.auth.client_token;
  const result = await vaultRequest("PUT", "sys/control-group/authorize", {
    token: authorizerToken,
    body: { accessor },
  });
  return { approved: result.data?.approved === true };
}

/**
 * Unwraps a Control Group wrapping token after authorization to
 * retrieve the actual database credential — the wrapping token itself
 * IS the authentication for this one call (it was never meant to be
 * combined with any other token), matching `vault unwrap`'s own
 * behavior.
 */
export async function unwrapCredential(wrapToken) {
  const data = await vaultRequest("POST", "sys/wrapping/unwrap", {
    token: wrapToken,
  });
  return {
    username: data.data.username,
    password: data.data.password,
    leaseId: data.lease_id,
    leaseDuration: data.lease_duration,
  };
}

/** Renews a dynamic lease by its exact lease_id and increment. */
export async function renewLease(leaseId, incrementSeconds = 120) {
  const parentToken = await readAgentToken();
  return await vaultRequest("PUT", "sys/leases/renew", {
    token: parentToken,
    body: { lease_id: leaseId, increment: `${incrementSeconds}s` },
  });
}

/**
 * Renews the CHILD TOKEN that originally requested a credential, by
 * accessor. Necessary alongside renewLease(), not instead of it —
 * mintAgentTaggedChildToken()'s own comment documents that a lease is
 * revoked when the child token that created it expires, regardless of
 * the lease's own TTL; renewing only the lease without also renewing the
 * token that owns it would silently stop working the moment the child
 * token's original TTL elapses. Confirmed by direct testing (Wave 2.5,
 * a deliberately short test TTL) rather than assumed from Vault's docs
 * alone, matching this file's own established discipline.
 */
export async function renewTokenByAccessor(accessor, incrementSeconds = 120) {
  const parentToken = await readAgentToken();
  return await vaultRequest("PUT", "auth/token/renew-accessor", {
    token: parentToken,
    body: { accessor, increment: `${incrementSeconds}s` },
  });
}

/** Revokes one lease by its exact lease_id. Treats 400/404 as already-revoked. */
export async function revokeLease(leaseId) {
  try {
    const parentToken = await readAgentToken();
    await vaultRequest("PUT", "sys/leases/revoke", {
      token: parentToken,
      body: { lease_id: leaseId },
    });
    return { ok: true, status: "revoked" };
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      return { ok: true, status: "already_revoked_or_expired" };
    }
    throw err;
  }
}

/** Revokes a token by accessor. Treats 400/404 as already-revoked. */
export async function revokeTokenAccessor(accessor) {
  try {
    const parentToken = await readAgentToken();
    await vaultRequest("PUT", "auth/token/revoke-accessor", {
      token: parentToken,
      body: { accessor },
    });
    return { ok: true, status: "revoked" };
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      return { ok: true, status: "already_revoked_or_expired" };
    }
    throw err;
  }
}

export async function vaultHealthCheck() {
  try {
    await readAgentToken();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
