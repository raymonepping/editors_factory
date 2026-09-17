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
export async function mintAgentTaggedChildToken(agentId, ttlSeconds) {
  const parentToken = await readAgentToken();
  const data = await vaultRequest("POST", "auth/token/create", {
    token: parentToken,
    body: {
      orphan: false,
      ttl: `${ttlSeconds}s`,
      // The raw HTTP API's field is `meta`, NOT `metadata` — found live:
      // `-metadata=` is only the `vault token create` CLI flag name; the
      // JSON body key it actually sends is `meta`. Using `metadata` here
      // silently created a real child token with NO metadata at all
      // (no error — Vault just ignored the unrecognized field), which
      // then failed the require-agent-c-for-db-creds Sentinel EGP with
      // a confusing "Result value was 'undefined'" trace instead of an
      // obvious "bad request".
      meta: { factory_agent: agentId },
      no_default_policy: false,
    },
  });
  return data.auth.client_token;
}

// Child-token TTL per database role — must be >= the role's own
// default_ttl (terraform/vault-database/database.tf) so the credential
// this token brokers doesn't get cascade-revoked out from under itself
// (see mintAgentTaggedChildToken's own comment). A little headroom over
// the role's default_ttl absorbs the few hundred ms between minting the
// token and the `database/creds/*` read actually landing.
const DB_ROLE_TOKEN_TTL_SECONDS = {
  "factory-bad-role": 86400 + 30, // matches default_ttl 24h
  "factory-good-role": 120 + 30, // matches default_ttl 2m
  "factory-backend-role": 3600 + 30, // matches default_ttl 1h
};

/**
 * Issues a dynamic PostgreSQL credential from the given database role
 * (factory-bad-role | factory-good-role | factory-backend-role), using a
 * child token tagged for the calling agent (only ever "agent-c" for the
 * Sentinel-gated roles per prompts/backend/01_01_orchestrator_api.md's
 * own design — this function does not itself enforce that; the caller in
 * routes/credentials.js does).
 */
export async function issueDatabaseCredential(role, agentId) {
  const ttlSeconds = DB_ROLE_TOKEN_TTL_SECONDS[role];
  if (!ttlSeconds) {
    throw new Error(
      `issueDatabaseCredential: unknown role "${role}" — no child-token TTL mapped`,
    );
  }
  const childToken = await mintAgentTaggedChildToken(agentId, ttlSeconds);
  const data = await vaultRequest("GET", `database/creds/${role}`, {
    token: childToken,
  });
  return {
    username: data.data.username,
    password: data.data.password,
    leaseId: data.lease_id,
    leaseDuration: data.lease_duration,
  };
}

/** Revokes one lease by its exact lease_id — matches factory-api's own
 * policy grant (`sys/leases/revoke/*`, capability "update"). `make
 * reset` revokes every lease_id recorded in credential_events for the
 * run being reset, rather than a prefix revoke (which would need a
 * broader, unused policy grant). */
export async function revokeLease(leaseId) {
  const parentToken = await readAgentToken();
  await vaultRequest("PUT", "sys/leases/revoke", {
    token: parentToken,
    body: { lease_id: leaseId },
  });
}

export async function vaultHealthCheck() {
  try {
    await readAgentToken();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
