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
let renewalTimer = null;

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
 * Initializes the backend's own operational pool and schedules its
 * reissue before the factory-backend-role lease expires (default_ttl
 * 3600s — reissue at 80% of that, not lease-renewed, matching
 * config.js/vault.js's stated design: simpler to reissue than to manage
 * Vault lease-renew semantics for a demo).
 */
export async function initDbPool() {
  const { pool: newPool, cred } = await createBackendPool();
  pool = newPool;
  poolCredential = cred;
  scheduleRenewal(cred.leaseDuration);
  return pool;
}

function scheduleRenewal(leaseDurationSeconds) {
  if (renewalTimer) clearTimeout(renewalTimer);
  const renewInMs = Math.max(leaseDurationSeconds * 0.8, 10) * 1000;
  renewalTimer = setTimeout(() => {
    renewNow("scheduled").catch(() => {
      // renewNow() already logs and reschedules its own retry — nothing
      // further to do here. A setTimeout callback's own rejection would
      // otherwise be an unhandled promise rejection.
    });
  }, renewInMs);
  renewalTimer.unref?.();
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
    scheduleRenewal(cred.leaseDuration);
    await old?.end();
    console.log(
      `[db] operational credential renewed (${trigger}): ${cred.username}, next renewal in ~${Math.round(cred.leaseDuration * 0.8)}s`,
    );
    return true;
  } catch (err) {
    // Keep the existing pool alive on a renewal failure — a demo
    // running past a single failed reissue is better than one that
    // drops its own operational connection mid-run. Retry sooner.
    console.error(
      `[db] credential renewal failed (${trigger}), retrying in 30s:`,
      err.message,
    );
    if (renewalTimer) clearTimeout(renewalTimer);
    renewalTimer = setTimeout(() => scheduleRenewal(0), 30_000);
    renewalTimer.unref?.();
    return false;
  } finally {
    renewing = false;
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
