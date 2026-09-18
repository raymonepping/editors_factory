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
export async function mintAgentTaggedChildToken(agentId, ttlSeconds, policies = null) {
  const parentToken = await readAgentToken();
  const body = {
    orphan: false,
    ttl: `${ttlSeconds}s`,
    meta: { factory_agent: agentId },
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
 * scoped child token tagged for the calling agent.
 */
export async function issueDatabaseCredential(role, agentId) {
  const ttlSeconds = DB_ROLE_TOKEN_TTL_SECONDS[role];
  if (!ttlSeconds) {
    throw new Error(
      `issueDatabaseCredential: unknown role "${role}" — no child-token TTL mapped`,
    );
  }
  // Scope child token to narrowest policy
  const policies = role === "factory-backend-role" ? ["factory-api"] : ["factory-agent-c-cred"];
  const { clientToken, accessor } = await mintAgentTaggedChildToken(agentId, ttlSeconds, policies);
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

/** Renews a dynamic lease by its exact lease_id and increment. */
export async function renewLease(leaseId, incrementSeconds = 120) {
  const parentToken = await readAgentToken();
  return await vaultRequest("PUT", "sys/leases/renew", {
    token: parentToken,
    body: { lease_id: leaseId, increment: `${incrementSeconds}s` },
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
