import { Router } from "express";
import { randomUUID, createHash } from "node:crypto";
import { agentJwtAuth } from "../middleware/agentJwtAuth.js";
import { getPool, withAgentCredential } from "../db.js";
import { cleanupTaskCredentials } from "../services/revocation.js";
import * as audit from "../audit.js";
import * as state from "../state.js";
import {
  checkAuthority,
  effectiveAuthorityFor,
  TOOL_TO_ACTION,
} from "../policy.js";

export const actionsRouter = Router();

// ── Two-level idempotency (v2, prompts/v2/02_04) ───────────────────────────
//
// Level 1 — attempt idempotency: an `X-Attempt-Idempotency-Key` header
// (set by agents/src/dagWorker.js from the claim response's own
// attemptIdempotencyKey) dedups a retried HTTP call within the SAME
// attempt — a network blip resending the identical request, not a whole
// new attempt. Purely in-memory and short-lived by design, same as every
// other in-memory piece of this project's runtime state — an attempt
// doesn't survive an API restart either way (index.js's own startup
// recovery). Only caches a successful (< 300) response: a genuine
// failure must be retriable fresh, not replayed forever.
const attemptCallCache = new Map();

function attemptIdempotency(req, res, next) {
  const key = req.get("x-attempt-idempotency-key");
  if (!key) return next();
  const cached = attemptCallCache.get(key);
  if (cached) return res.status(cached.status).json(cached.body);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 300)
      attemptCallCache.set(key, { status: res.statusCode, body });
    return originalJson(body);
  };
  next();
}

// Level 2 — business-effect idempotency: prevents a whole new ATTEMPT
// (Attempt 2 of `remediate`, a fresh attempt_id — not a retried HTTP
// call within Attempt 1) from repeating an irreversible mutation Attempt
// 1 already committed before it crashed. Backed by the dag_business_effects
// ledger table (009_v2_dag_tables.sql). Only applies to a v2
// (attempt-bound) request — req.attemptId is null for v1 traffic, which
// has no dag_node_attempts row to key against and relies on its own
// existing "one task, one remediation" design instead.
//
// Deliberately NOT the literal same Postgres transaction as the mutation
// itself, despite 02_04's own wording — the mutation runs on Agent C's
// own Vault-issued factory-bad-role/factory-good-role connection (a
// separate PostgreSQL role, deliberately never granted write access to
// evidence tables — security/authority-model.md), while this ledger
// lives on the backend's own factory-backend-role connection; spanning
// both in one transaction would require widening that grant, which is
// not worth doing for bookkeeping. The claim step
// (INSERT ... ON CONFLICT DO NOTHING) still atomically decides which
// attempt "wins" the effect before either one touches the domain data,
// which is what actually matters for correctness here.
async function claimBusinessEffect(req, { operation, target, payload }) {
  if (!req.attemptId) return { applicable: false };
  const { rows } = await getPool().query(
    `SELECT run_id, node_key FROM dag_nodes WHERE node_id = $1`,
    [req.nodeId],
  );
  const node = rows[0];
  if (!node) return { applicable: false };
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload ?? {}))
    .digest("hex");
  const businessEffectKey = createHash("sha256")
    .update(
      `${node.run_id}:${node.node_key}:${operation}:${target}:${payloadHash}`,
    )
    .digest("hex");
  const { rows: claimed } = await getPool().query(
    `INSERT INTO dag_business_effects
       (business_effect_key, run_id, node_key, operation, target, payload_hash)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (business_effect_key) DO NOTHING
     RETURNING *`,
    [
      businessEffectKey,
      node.run_id,
      node.node_key,
      operation,
      target,
      payloadHash,
    ],
  );
  if (claimed[0]) return { applicable: true, claimed: true, businessEffectKey };
  const { rows: existing } = await getPool().query(
    `SELECT result FROM dag_business_effects WHERE business_effect_key = $1`,
    [businessEffectKey],
  );
  return {
    applicable: true,
    claimed: false,
    cachedResult: existing[0]?.result ?? null,
  };
}

// v2 (prompts/v2/02_07): deterministic fault injection — the piece
// Scenario 2 (a governed retry actually needing a real failure to
// retry from) depends on, deferred from 02_02/02_04/02_06, where the
// fault_injection_mode column/controls were added without a consumer.
// Only ever fires on attempt_number === 1 — Scenario 2's own "Attempt 2
// completes successfully" requires the retry to actually succeed, or
// the demo loops forever. Thrown errors here carry status 500
// specifically so agents/src/dagWorker.js's executeTool re-throws
// instead of feeding it back to the model as an ordinary, reasonable-
// to-work-around denial (this is meant to simulate the platform itself
// breaking mid-call, not a policy decision).
// v2 (prompts/v2/02_08): genuine PostgreSQL lock contention, not a
// synthetic error string. A holder connection (the SAME agent-issued
// credential — a role may open more than one connection within its
// lease; this requests no second Vault credential) takes a real table
// lock and sleeps; after a brief head start, a second connection on the
// same credential sets a short lock_timeout and tries to take the same
// lock. PostgreSQL itself — not this code — decides it can't get the
// lock in time and raises the real 55P03 error, which is what actually
// surfaces as the attempt's failure.
//
// Only possible for BAD mode. Confirmed live, empirically, before
// writing this (a throwaway SELECT-only test role against this exact
// database): every explicit LOCK TABLE mode beyond the automatic
// ACCESS SHARE a plain SELECT already takes requires real DML privilege
// on the table — a role with SELECT alone gets "permission denied,"
// not a lock. factory-good-role (security/authority-model.md's own
// SELECT-plus-narrow-EXECUTE design) therefore cannot hold ANY
// conflicting table lock at all — which is itself a real, honest
// consequence of GOOD's own narrower grants, not a gap in this fault:
// GOOD mode falls back to the same synthetic, deterministic failure
// fail_before_mutation uses, with a message that says why.
const LOCK_HOLD_MS = 3000;
const LOCK_HEAD_START_MS = 300;
const LOCK_TIMEOUT_MS = 1500;

async function simulateGenuineLockTimeout(cred, tableName) {
  if (cred.role !== "factory-bad-role") {
    const err = new Error(
      `Fault injected (fault_injection_mode=lock_timeout) on attempt 1: ${cred.role} holds SELECT only on ${tableName} and cannot take any table lock beyond the automatic ACCESS SHARE mode a plain SELECT already uses — genuine lock contention is only possible for factory-bad-role. Falling back to a deterministic failure. Retry this node to continue.`,
    );
    err.status = 500;
    throw err;
  }
  const holder = withAgentCredential(cred, async (lockClient) => {
    await lockClient.query("BEGIN");
    await lockClient.query(`LOCK TABLE ${tableName} IN EXCLUSIVE MODE`);
    await new Promise((resolve) => setTimeout(resolve, LOCK_HOLD_MS));
    await lockClient.query("ROLLBACK");
  });
  // Swallow a holder-side failure here — surfaced below instead if the
  // contention attempt itself doesn't fail as expected.
  const holderFailure = holder.catch((err) => err);

  await new Promise((resolve) => setTimeout(resolve, LOCK_HEAD_START_MS));

  let contentionError = null;
  try {
    await withAgentCredential(cred, async (client) => {
      await client.query("BEGIN");
      await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
      await client.query(`LOCK TABLE ${tableName} IN EXCLUSIVE MODE`);
      await client.query("ROLLBACK");
    });
  } catch (err) {
    contentionError = err;
  }

  await holder.catch(() => {}); // let the holder's own connection finish cleanly

  if (!contentionError) {
    const holderErr = await holderFailure;
    const err = new Error(
      holderErr
        ? `Fault injected (fault_injection_mode=lock_timeout): holder connection failed unexpectedly: ${holderErr.message}`
        : "Fault injected (fault_injection_mode=lock_timeout): expected genuine PostgreSQL lock contention did not occur.",
    );
    err.status = 500;
    throw err;
  }
  const err = new Error(
    `Fault injected (fault_injection_mode=lock_timeout) on attempt 1 — genuine PostgreSQL lock contention: ${contentionError.message}`,
  );
  err.status = 500;
  throw err;
}

async function checkFaultInjection(req, matchModes, { cred, tableName } = {}) {
  if (!req.attemptId) return; // v1 traffic — no fault injection
  const { rows } = await getPool().query(
    `SELECT a.attempt_number, dr.fault_injection_mode
       FROM dag_node_attempts a
       JOIN dag_nodes n ON n.node_id = a.node_id
       JOIN demo_runs dr ON dr.run_id = n.run_id
      WHERE a.attempt_id = $1`,
    [req.attemptId],
  );
  const row = rows[0];
  if (!row || Number(row.attempt_number) !== 1) return;
  if (!matchModes.includes(row.fault_injection_mode)) return;

  if (row.fault_injection_mode === "lock_timeout" && cred && tableName) {
    await simulateGenuineLockTimeout(cred, tableName);
    return;
  }

  const err = new Error(
    `Fault injected (fault_injection_mode=${row.fault_injection_mode}) on attempt 1 — deliberate, deterministic failure per the v2 demo scenario (prompts/v2/02_07). Retry this node to continue.`,
  );
  err.status = 500;
  throw err;
}

async function recordBusinessEffectResult(businessEffectKey, result) {
  await getPool().query(
    `UPDATE dag_business_effects SET result = $2 WHERE business_effect_key = $1`,
    [businessEffectKey, JSON.stringify(result)],
  );
}

// Structured filters only — never a raw SQL string from the model
// (prompts/api/01_01_factory_schema_and_tools.md's own Non-goals).
const ORDER_FILTER_COLUMNS = new Set(["status", "customer_ref"]);
const PRODUCT_FILTER_COLUMNS = new Set(["category", "discontinued", "active"]);

function buildWhere(filter, allowedColumns) {
  const clauses = [];
  const values = [];
  for (const [key, value] of Object.entries(filter || {})) {
    if (!allowedColumns.has(key)) {
      const err = new Error(`Unsupported filter column: ${key}`);
      err.status = 400;
      throw err;
    }
    values.push(value);
    clauses.push(`${key} = $${values.length}`);
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

/**
 * Runs the policy check every tool call must pass through, records the
 * authority_decisions row regardless of outcome, and returns whether the
 * caller may proceed. This is the ONE place BAD and GOOD profile
 * actually diverge in behavior — the tool implementation below it is
 * identical in both.
 */
async function authorize(req, toolName) {
  const actorId = req.actorId;
  const profile = state.getProfile();
  const runId = state.getCurrentRunId();
  const requestedAction = TOOL_TO_ACTION[toolName];
  const effectiveAuthority = effectiveAuthorityFor(actorId, profile);
  const decision = checkAuthority({
    actorId,
    requestedAction,
    effectiveAuthority,
  });
  const { taskId, traceId } = state.getCausalContext(actorId);

  await audit.recordAuthorityDecision({
    runId,
    actorId,
    requestedAction,
    policyResult: decision.result,
    reason: decision.reason,
    traceId,
    taskId,
  });

  // Wave 2: Policy denial credential cleanup — immediately revoke any already-issued
  // lease/token held by the actor upon out-of-bounds policy denial
  if (decision.result === "DENY" && actorId === "agent-c") {
    await cleanupTaskCredentials(null, "policy_denial_containment");
  }

  return {
    ...decision,
    actorId,
    runId,
    profile,
    effectiveAuthority,
    requestedAction,
    traceId,
    taskId,
  };
}

// Wave 4: reuses the calling actor's own real trace_id/task_id (its
// currently active task, per state.getCausalContext) rather than minting
// a fresh one per call — audit_events.task_id used to be a random UUID
// with no corresponding row anywhere else, and trace_id reset at every
// single tool call, breaking the one continuous trace a human-triggered
// run is supposed to keep from task.created through to the database
// mutation and Agent D's finding (found live auditing Wave 4). Falls
// back to a fresh id only if the actor genuinely has no active task
// (defensive — every real call site here is reached through authorize(),
// which always has one).
async function recordToolCall({
  runId,
  actorId,
  toolName,
  target,
  result,
  rowsAffected = null,
  traceId = null,
  taskId = null,
}) {
  await audit.recordAuditEvent({
    runId,
    traceId: traceId ?? randomUUID(),
    taskId: taskId ?? randomUUID(),
    actorId,
    toolName,
    target,
    action: toolName,
    result,
    rowsAffected,
  });
}

function denyResponse(res, decision) {
  return res.status(403).json({ error: decision.reason });
}

function requireActiveCredential(res, actorId) {
  const cred = state.getActiveAgentCCredential();
  if (!cred || cred.actorId !== actorId) {
    res.status(409).json({
      error: `${actorId} has no active database credential — call POST /api/credentials first`,
    });
    return null;
  }
  return cred;
}

// ── Read tools ────────────────────────────────────────────────────────────

actionsRouter.get("/health", agentJwtAuth, async (req, res, next) => {
  try {
    const decision = await authorize(req, "get_health");
    if (decision.result === "DENY") return denyResponse(res, decision);
    const { rows } = await getPool().query(
      `SELECT count(*) FILTER (WHERE status = 'inconsistent') AS inconsistent, count(*) AS total FROM orders`,
    );
    res.json({
      status: "ok",
      order_processor_status:
        Number(rows[0].inconsistent) > 0 ? "degraded" : "healthy",
      ...rows[0],
    });
  } catch (err) {
    next(err);
  }
});

actionsRouter.get("/orders", agentJwtAuth, async (req, res, next) => {
  try {
    const decision = await authorize(req, "list_orders");
    if (decision.result === "DENY") return denyResponse(res, decision);
    const { where, values } = buildWhere(
      req.query.status ? { status: req.query.status } : {},
      ORDER_FILTER_COLUMNS,
    );
    const { rows } = await getPool().query(
      `SELECT * FROM orders ${where} ORDER BY id`,
      values,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

actionsRouter.get("/orders/:id", agentJwtAuth, async (req, res, next) => {
  try {
    const decision = await authorize(req, "get_order");
    if (decision.result === "DENY") return denyResponse(res, decision);
    const { rows } = await getPool().query(
      "SELECT * FROM orders WHERE id = $1",
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "not found" });
    const items = await getPool().query(
      "SELECT * FROM order_items WHERE order_id = $1",
      [req.params.id],
    );
    res.json({ ...rows[0], items: items.rows });
  } catch (err) {
    next(err);
  }
});

actionsRouter.get("/products", agentJwtAuth, async (req, res, next) => {
  try {
    const decision = await authorize(req, "list_products");
    if (decision.result === "DENY") return denyResponse(res, decision);
    const { where, values } = buildWhere(
      req.query.category ? { category: req.query.category } : {},
      PRODUCT_FILTER_COLUMNS,
    );
    const { rows } = await getPool().query(
      `SELECT * FROM products ${where} ORDER BY id`,
      values,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── Mutating tools — same code path in BAD and GOOD; only whether the
//    Vault credential + policy decision allow it differs ───────────────────

actionsRouter.patch(
  "/orders/:id/status",
  agentJwtAuth,
  attemptIdempotency,
  async (req, res, next) => {
    try {
      const decision = await authorize(req, "update_order_status");
      if (decision.result === "DENY") return denyResponse(res, decision);
      const cred = requireActiveCredential(res, decision.actorId);
      if (!cred) return;

      const { status } = req.body || {};

      // Found live (02_08): fault injection must run BEFORE the
      // business-effect ledger claim, not after. claimBusinessEffect's
      // own INSERT commits immediately and is not rolled back by a
      // later throw — a fault-injected failure here used to still
      // claim the ledger row, permanently poisoning it (result stays
      // NULL forever) and making every later attempt's identical
      // mutation call silently report "already applied" without the
      // mutation ever actually having happened.
      await checkFaultInjection(req, ["fail_before_mutation", "lock_timeout"], {
        cred,
        tableName: "orders",
      });

      const effect = await claimBusinessEffect(req, {
        operation: "update_order_status",
        target: `orders/${req.params.id}`,
        payload: { status },
      });
      if (effect.applicable && !effect.claimed) {
        return res.json(
          effect.cachedResult ?? {
            note: "already applied by a prior attempt",
          },
        );
      }

      const before = await getPool().query(
        "SELECT * FROM orders WHERE id = $1",
        [req.params.id],
      );
      // Calls set_order_status(id, status) rather than a raw UPDATE — see
      // terraform/vault-database/database.tf's factory_good_role comment
      // for why (a column-level GRANT UPDATE (status) was found to be
      // silently dropped by Vault's PostgreSQL secrets engine). Same call
      // for both profiles, matching this project's "no separate code path
      // for GOOD mode" rule.
      const result = await withAgentCredential(cred, (client) =>
        client.query("SELECT * FROM set_order_status($1, $2)", [
          req.params.id,
          status,
        ]),
      );

      await checkFaultInjection(req, ["fail_after_mutation"]);

      await audit.recordDatabaseChange({
        runId: decision.runId,
        actorId: decision.actorId,
        traceId: decision.traceId,
        taskId: decision.taskId,
        tableName: "orders",
        action: "UPDATE",
        before: before.rows[0],
        after: result.rows[0],
        rowsAffected: result.rowCount,
      });
      await recordToolCall({
        runId: decision.runId,
        actorId: decision.actorId,
        traceId: decision.traceId,
        taskId: decision.taskId,
        toolName: "update_order_status",
        target: `orders/${req.params.id}`,
        result: "ALLOW",
        rowsAffected: result.rowCount,
      });

      if (effect.applicable) {
        await recordBusinessEffectResult(
          effect.businessEffectKey,
          result.rows[0],
        );
      }
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

actionsRouter.delete(
  "/orders",
  agentJwtAuth,
  attemptIdempotency,
  async (req, res, next) => {
    try {
      const decision = await authorize(req, "delete_orders");
      if (decision.result === "DENY") return denyResponse(res, decision);
      const cred = requireActiveCredential(res, decision.actorId);
      if (!cred) return;

      const { where, values } = buildWhere(
        req.body?.filter,
        ORDER_FILTER_COLUMNS,
      );

      // See update_order_status's own comment (found live, 02_08) —
      // fault injection must run before the ledger claim, not after.
      await checkFaultInjection(req, ["fail_before_mutation", "lock_timeout"], {
        cred,
        tableName: "orders",
      });

      const effect = await claimBusinessEffect(req, {
        operation: "delete_orders",
        target: "orders",
        payload: req.body?.filter,
      });
      if (effect.applicable && !effect.claimed) {
        return res.json(
          effect.cachedResult ?? {
            deleted: 0,
            note: "already applied by a prior attempt",
          },
        );
      }

      const before = await getPool().query(
        `SELECT * FROM orders ${where}`,
        values,
      );
      // GOOD mode never reaches here successfully — factory-good-role has
      // no DELETE grant on orders, so this throws a real PostgreSQL
      // permission error, independent of the policy check above
      // (security/authority-model.md's defense-in-depth).
      const result = await withAgentCredential(cred, (client) =>
        client.query(`DELETE FROM orders ${where}`, values),
      );

      await checkFaultInjection(req, ["fail_after_mutation"]);

      await audit.recordDatabaseChange({
        runId: decision.runId,
        actorId: decision.actorId,
        traceId: decision.traceId,
        taskId: decision.taskId,
        tableName: "orders",
        action: "DELETE",
        before: before.rows,
        after: null,
        rowsAffected: result.rowCount,
      });
      await recordToolCall({
        runId: decision.runId,
        actorId: decision.actorId,
        traceId: decision.traceId,
        taskId: decision.taskId,
        toolName: "delete_orders",
        target: "orders",
        result: "ALLOW",
        rowsAffected: result.rowCount,
      });

      const responseBody = { deleted: result.rowCount };
      if (effect.applicable) {
        await recordBusinessEffectResult(
          effect.businessEffectKey,
          responseBody,
        );
      }
      res.json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

actionsRouter.patch(
  "/products/:sku/price",
  agentJwtAuth,
  attemptIdempotency,
  async (req, res, next) => {
    try {
      const decision = await authorize(req, "update_price");
      if (decision.result === "DENY") return denyResponse(res, decision);
      const cred = requireActiveCredential(res, decision.actorId);
      if (!cred) return;

      const { price } = req.body || {};

      // See update_order_status's own comment (found live, 02_08) —
      // fault injection must run before the ledger claim, not after.
      await checkFaultInjection(req, ["fail_before_mutation", "lock_timeout"], {
        cred,
        tableName: "products",
      });

      const effect = await claimBusinessEffect(req, {
        operation: "update_price",
        target: `products/${req.params.sku}`,
        payload: { price },
      });
      if (effect.applicable && !effect.claimed) {
        return res.json(
          effect.cachedResult ?? {
            note: "already applied by a prior attempt",
          },
        );
      }

      const before = await getPool().query(
        "SELECT * FROM products WHERE sku = $1",
        [req.params.sku],
      );
      const result = await withAgentCredential(cred, (client) =>
        client.query(
          "UPDATE products SET price = $1, updated_at = now() WHERE sku = $2 RETURNING *",
          [price, req.params.sku],
        ),
      );

      await checkFaultInjection(req, ["fail_after_mutation"]);

      await audit.recordDatabaseChange({
        runId: decision.runId,
        actorId: decision.actorId,
        traceId: decision.traceId,
        taskId: decision.taskId,
        tableName: "products",
        action: "UPDATE",
        before: before.rows[0],
        after: result.rows[0],
        rowsAffected: result.rowCount,
      });
      await recordToolCall({
        runId: decision.runId,
        actorId: decision.actorId,
        traceId: decision.traceId,
        taskId: decision.taskId,
        toolName: "update_price",
        target: `products/${req.params.sku}`,
        result: "ALLOW",
        rowsAffected: result.rowCount,
      });

      if (effect.applicable) {
        await recordBusinessEffectResult(
          effect.businessEffectKey,
          result.rows[0],
        );
      }
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

actionsRouter.post(
  "/products",
  agentJwtAuth,
  attemptIdempotency,
  async (req, res, next) => {
    try {
      const decision = await authorize(req, "insert_product");
      if (decision.result === "DENY") return denyResponse(res, decision);
      const cred = requireActiveCredential(res, decision.actorId);
      if (!cred) return;

      const { sku, name, category, price } = req.body || {};

      // See update_order_status's own comment (found live, 02_08) —
      // fault injection must run before the ledger claim, not after.
      await checkFaultInjection(req, ["fail_before_mutation", "lock_timeout"], {
        cred,
        tableName: "products",
      });

      const effect = await claimBusinessEffect(req, {
        operation: "insert_product",
        target: sku,
        payload: { sku, name, category, price },
      });
      if (effect.applicable && !effect.claimed) {
        return res.status(200).json(
          effect.cachedResult ?? {
            note: "already applied by a prior attempt",
          },
        );
      }

      const result = await withAgentCredential(cred, (client) =>
        client.query(
          "INSERT INTO products (sku, name, category, price) VALUES ($1,$2,$3,$4) RETURNING *",
          [sku, name, category, price],
        ),
      );

      await checkFaultInjection(req, ["fail_after_mutation"]);

      await audit.recordDatabaseChange({
        runId: decision.runId,
        actorId: decision.actorId,
        traceId: decision.traceId,
        taskId: decision.taskId,
        tableName: "products",
        action: "INSERT",
        before: null,
        after: result.rows[0],
        rowsAffected: result.rowCount,
      });
      await recordToolCall({
        runId: decision.runId,
        actorId: decision.actorId,
        traceId: decision.traceId,
        taskId: decision.taskId,
        toolName: "insert_product",
        target: sku,
        result: "ALLOW",
        rowsAffected: result.rowCount,
      });

      if (effect.applicable) {
        await recordBusinessEffectResult(
          effect.businessEffectKey,
          result.rows[0],
        );
      }
      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

actionsRouter.delete(
  "/products",
  agentJwtAuth,
  attemptIdempotency,
  async (req, res, next) => {
    try {
      const decision = await authorize(req, "delete_products");
      if (decision.result === "DENY") return denyResponse(res, decision);
      const cred = requireActiveCredential(res, decision.actorId);
      if (!cred) return;

      const { where, values } = buildWhere(
        req.body?.filter,
        PRODUCT_FILTER_COLUMNS,
      );

      // See update_order_status's own comment (found live, 02_08) —
      // fault injection must run before the ledger claim, not after.
      await checkFaultInjection(req, ["fail_before_mutation", "lock_timeout"], {
        cred,
        tableName: "products",
      });

      const effect = await claimBusinessEffect(req, {
        operation: "delete_products",
        target: "products",
        payload: req.body?.filter,
      });
      if (effect.applicable && !effect.claimed) {
        return res.json(
          effect.cachedResult ?? {
            deleted: 0,
            note: "already applied by a prior attempt",
          },
        );
      }

      const before = await getPool().query(
        `SELECT * FROM products ${where}`,
        values,
      );
      const result = await withAgentCredential(cred, (client) =>
        client.query(`DELETE FROM products ${where}`, values),
      );

      await checkFaultInjection(req, ["fail_after_mutation"]);

      await audit.recordDatabaseChange({
        runId: decision.runId,
        actorId: decision.actorId,
        traceId: decision.traceId,
        taskId: decision.taskId,
        tableName: "products",
        action: "DELETE",
        before: before.rows,
        after: null,
        rowsAffected: result.rowCount,
      });
      await recordToolCall({
        runId: decision.runId,
        actorId: decision.actorId,
        traceId: decision.traceId,
        taskId: decision.taskId,
        toolName: "delete_products",
        target: "products",
        result: "ALLOW",
        rowsAffected: result.rowCount,
      });

      const responseBody = { deleted: result.rowCount };
      if (effect.applicable) {
        await recordBusinessEffectResult(
          effect.businessEffectKey,
          responseBody,
        );
      }
      res.json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

actionsRouter.post(
  "/services/order-processor/restart",
  agentJwtAuth,
  async (req, res, next) => {
    try {
      const decision = await authorize(req, "restart_order_processor");
      if (decision.result === "DENY") return denyResponse(res, decision);
      // No real process to restart — the "order processor" is a narrative
      // concept over the orders table, not a separate service
      // (prompts/base_project/01_01_factory_stack.md's non-goals keep this
      // demo boring/small). Recorded like any other tool call.
      await recordToolCall({
        runId: decision.runId,
        actorId: decision.actorId,
        traceId: decision.traceId,
        taskId: decision.taskId,
        toolName: "restart_order_processor",
        target: "order-processor",
        result: "ALLOW",
      });
      res.json({ restarted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── Agent D: detection-only ──────────────────────────────────────────────

actionsRouter.post("/findings", agentJwtAuth, async (req, res, next) => {
  try {
    const decision = await authorize(req, "create_finding");
    if (decision.result === "DENY") return denyResponse(res, decision);
    const {
      severity,
      title,
      detail,
      correlatesWithEventId,
      correlatesWithEventType,
    } = req.body || {};
    const finding = await audit.recordFinding({
      runId: decision.runId,
      actorId: decision.actorId,
      severity,
      title,
      detail,
      correlatesWithEventId: correlatesWithEventId || null,
      correlatesWithEventType: correlatesWithEventType || null,
    });
    await recordToolCall({
      runId: decision.runId,
      actorId: decision.actorId,
      traceId: decision.traceId,
      taskId: decision.taskId,
      toolName: "create_finding",
      target: title,
      result: "ALLOW",
    });
    res.status(201).json(finding);
  } catch (err) {
    next(err);
  }
});

// /tools/* alias — mounted a second time at that prefix in index.js.
export const toolsRouter = actionsRouter;
