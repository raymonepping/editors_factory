import { Router } from "express";
import { randomUUID } from "node:crypto";
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

actionsRouter.patch("/orders/:id/status", agentJwtAuth, async (req, res, next) => {
  try {
    const decision = await authorize(req, "update_order_status");
    if (decision.result === "DENY") return denyResponse(res, decision);
    const cred = requireActiveCredential(res, decision.actorId);
    if (!cred) return;

    const before = await getPool().query("SELECT * FROM orders WHERE id = $1", [
      req.params.id,
    ]);
    const { status } = req.body || {};
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

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

actionsRouter.delete("/orders", agentJwtAuth, async (req, res, next) => {
  try {
    const decision = await authorize(req, "delete_orders");
    if (decision.result === "DENY") return denyResponse(res, decision);
    const cred = requireActiveCredential(res, decision.actorId);
    if (!cred) return;

    const { where, values } = buildWhere(
      req.body?.filter,
      ORDER_FILTER_COLUMNS,
    );
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

    res.json({ deleted: result.rowCount });
  } catch (err) {
    next(err);
  }
});

actionsRouter.patch(
  "/products/:sku/price",
  agentJwtAuth,
  async (req, res, next) => {
    try {
      const decision = await authorize(req, "update_price");
      if (decision.result === "DENY") return denyResponse(res, decision);
      const cred = requireActiveCredential(res, decision.actorId);
      if (!cred) return;

      const before = await getPool().query(
        "SELECT * FROM products WHERE sku = $1",
        [req.params.sku],
      );
      const { price } = req.body || {};
      const result = await withAgentCredential(cred, (client) =>
        client.query(
          "UPDATE products SET price = $1, updated_at = now() WHERE sku = $2 RETURNING *",
          [price, req.params.sku],
        ),
      );

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

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

actionsRouter.post("/products", agentJwtAuth, async (req, res, next) => {
  try {
    const decision = await authorize(req, "insert_product");
    if (decision.result === "DENY") return denyResponse(res, decision);
    const cred = requireActiveCredential(res, decision.actorId);
    if (!cred) return;

    const { sku, name, category, price } = req.body || {};
    const result = await withAgentCredential(cred, (client) =>
      client.query(
        "INSERT INTO products (sku, name, category, price) VALUES ($1,$2,$3,$4) RETURNING *",
        [sku, name, category, price],
      ),
    );

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

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

actionsRouter.delete("/products", agentJwtAuth, async (req, res, next) => {
  try {
    const decision = await authorize(req, "delete_products");
    if (decision.result === "DENY") return denyResponse(res, decision);
    const cred = requireActiveCredential(res, decision.actorId);
    if (!cred) return;

    const { where, values } = buildWhere(
      req.body?.filter,
      PRODUCT_FILTER_COLUMNS,
    );
    const before = await getPool().query(
      `SELECT * FROM products ${where}`,
      values,
    );
    const result = await withAgentCredential(cred, (client) =>
      client.query(`DELETE FROM products ${where}`, values),
    );

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

    res.json({ deleted: result.rowCount });
  } catch (err) {
    next(err);
  }
});

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
    const { severity, title, detail, correlatesWithEventId, correlatesWithEventType } =
      req.body || {};
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
