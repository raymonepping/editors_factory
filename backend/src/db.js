// src/db.js — two distinct database access paths, deliberately not one:
//
// 1. The backend's OWN operational pool (`pool`), authenticated with the
//    factory-backend-role credential (terraform/vault-database/). Used
//    for evidence-table bookkeeping and read-only product/order tool
//    calls. Reissued before its 1h TTL expires; never touches
//    products/orders/inventory with anything beyond SELECT.
//
// 2. Agent C's per-task mutation connections (`withAgentCredential`),
//    opened fresh for exactly one statement using whatever
//    factory-bad-role/factory-good-role credential was issued for the
//    current active task, then closed. This is what makes real product/
//    order mutation possible ONLY through the credential Agent C was
//    actually issued — see prompts/backend/01_01_orchestrator_api.md.

import pg from "pg";
import { config } from "./config.js";
import { issueDatabaseCredential } from "./vault.js";

const { Pool, Client } = pg;

let pool = null;
let poolCredential = null;
let credentialIssuedAt = null;
let renewalHeartbeat = null;

// prompts/hardening/02_00: how often the heartbeat re-evaluates whether
// the current credential is due for renewal — short relative to
// factory-backend-role's 3600s default_ttl, so a single missed or
// delayed tick leaves ample margin before the real 80%-of-TTL renewal
// point, unlike the single long-delay setTimeout this replaced (which
// produced zero log evidence of ever firing across a live session that
// ran well past when it should have).
const RENEWAL_HEARTBEAT_MS = 60_000;

async function createBackendPool() {
  const cred = await issueDatabaseCredential(
    "factory-backend-role",
    "factory-api",
  );
  const newPool = new Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: cred.username,
    password: cred.password,
    max: 5,
  });
  // Fail fast on a bad credential rather than discovering it on first query.
  await newPool.query("SELECT 1");
  return { pool: newPool, cred };
}

/**
 * Initializes the backend's own operational pool and starts the
 * renewal heartbeat that keeps it fresh before the factory-backend-role
 * lease expires (default_ttl 3600s — reissue at 80% of that, not
 * lease-renewed, matching config.js/vault.js's stated design: simpler
 * to reissue than to manage Vault lease-renew semantics for a demo).
 */
export async function initDbPool() {
  const { pool: newPool, cred } = await createBackendPool();
  pool = newPool;
  poolCredential = cred;
  credentialIssuedAt = Date.now();
  startRenewalHeartbeat();
  return pool;
}

// prompts/hardening/02_00: a short-interval, self-correcting check
// replaces the previous single long-delay setTimeout (due once, at 80%
// of leaseDuration) plus a separate 30s-retry setTimeout in renewNow()'s
// own catch branch. Every tick independently re-evaluates the current
// credential's age against its own renewal threshold and calls
// renewNow() only when actually due — a missed or delayed tick is not
// a failure mode the way losing the one setTimeout callback was, since
// the next tick a minute later re-evaluates from scratch rather than
// depending on one callback having fired at all.
function startRenewalHeartbeat() {
  if (renewalHeartbeat) clearInterval(renewalHeartbeat);
  renewalHeartbeat = setInterval(() => {
    checkAndRenewIfDue().catch((err) => {
      // checkAndRenewIfDue -> renewNow already logs its own outcome;
      // this only guards against an unexpected throw outside that path
      // becoming an unhandled rejection.
      console.error(
        "[db] renewal heartbeat check failed unexpectedly:",
        err.message,
      );
    });
  }, RENEWAL_HEARTBEAT_MS);
  renewalHeartbeat.unref?.();
}

async function checkAndRenewIfDue() {
  if (!poolCredential || credentialIssuedAt === null) return;
  const ageSeconds = (Date.now() - credentialIssuedAt) / 1000;
  const renewAtSeconds = poolCredential.leaseDuration * 0.8;
  if (ageSeconds >= renewAtSeconds) {
    await renewNow("scheduled");
  }
}

// True for the duration of one renewal attempt — guards against the
// scheduled timer and an on-demand call (healthRouter's own recovery
// trigger, added after `docs/troubleshooting.md`'s previously
// unestablished "backend database authentication failed twice after a
// long run" defect) racing each other into two concurrent
// createBackendPool() calls, which would leak one of the two new pools
// and could let a slower one overwrite the other's already-current
// credential with a stale one.
let renewing = false;

/**
 * Reissues the backend's operational credential right now, outside the
 * normal 80%-of-TTL schedule. Exported so healthRouter can call it the
 * moment `/api/health` observes `db.ok: false` — self-healing on the
 * request path, not only the timer path, and logged either way so a
 * recurrence of the credential going stale over a long run is
 * diagnosable from `podman logs factory-api` instead of only inferable
 * from a 503 with no further trace.
 */
export async function renewNow(trigger = "manual") {
  if (renewing) return false;
  renewing = true;
  try {
    const old = pool;
    const { pool: newPool, cred } = await createBackendPool();
    pool = newPool;
    poolCredential = cred;
    credentialIssuedAt = Date.now();
    await old?.end();
    console.log(
      `[db] operational credential renewed (${trigger}): ${cred.username}, next check in ~${RENEWAL_HEARTBEAT_MS / 1000}s intervals until ~${Math.round(cred.leaseDuration * 0.8)}s old`,
    );
    return true;
  } catch (err) {
    // Keep the existing pool alive on a renewal failure — a demo
    // running past a single failed reissue is better than one that
    // drops its own operational connection mid-run.
    // credentialIssuedAt is deliberately left untouched here: the
    // heartbeat's own next tick (RENEWAL_HEARTBEAT_MS later) will see
    // the credential is still past its renewal threshold and retry
    // automatically — no separate retry-timer bookkeeping needed.
    console.error(
      `[db] credential renewal failed (${trigger}), will retry in ~${RENEWAL_HEARTBEAT_MS / 1000}s:`,
      err.message,
    );
    return false;
  } finally {
    renewing = false;
  }
}

/**
 * Opens a throwaway, never-pooled connection with the CURRENT
 * operational credential and runs one query, then closes it.
 * prompts/hardening/02_00: this exists because `pool.query()` can
 * succeed on one of the pool's already-open connections even after the
 * credential backing the pool has been fully revoked — Postgres does
 * not retroactively kill a session just because the role behind it was
 * later dropped. Confirmed live: /api/health reported db.ok: true with
 * a revoked username at the same moment a real request needing a new
 * connection failed outright. Health checks must use this, not
 * getPool().query(), or "healthy" stops meaning what it claims to.
 */
export async function verifyCredentialFresh() {
  if (!poolCredential) {
    throw new Error("DB pool not initialized — call initDbPool() first");
  }
  const client = new Client({
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: poolCredential.username,
    password: poolCredential.password,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    await client.end().catch(() => {});
  }
}

export function getPool() {
  if (!pool)
    throw new Error("DB pool not initialized — call initDbPool() first");
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}

export function getPoolCredentialInfo() {
  return poolCredential
    ? { username: poolCredential.username, leaseId: poolCredential.leaseId }
    : null;
}

/**
 * Opens a short-lived connection with a specific, already-issued
 * Vault credential (Agent C's active factory-bad-role/factory-good-role
 * lease), runs exactly one operation, and closes it. Never pooled —
 * each of these credentials is single-purpose and short-lived by
 * design (prompts/base_project/03_01_postgres_dynamic_creds.md).
 */
export async function withAgentCredential(credential, fn) {
  const client = new Client({
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: credential.username,
    password: credential.password,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
