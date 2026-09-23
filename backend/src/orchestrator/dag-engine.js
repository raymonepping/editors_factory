// src/orchestrator/dag-engine.js — v2 RecoverableMicroDagEngine
// (prompts/v2/02_02_v2_backend_dag_orchestrator.md). Registers itself
// under workflow_mode="recoverable_dag" against orchestrator/index.js's
// registry. Implements 02_00's fixed 5-node topology:
//
//   triage (agent-a) -> investigate (agent-b) -+-> remediate (agent-c) -+-> verify (backend-internal)
//                                               +-> notify (backend-internal) -+
//
// "notify" and "verify" have agent_role="backend-internal" — there is no
// authenticated worker for them, so evaluateRunnableNodes executes them
// itself, synchronously, the moment they become runnable (grounding-pass
// addition — no separate claim/heartbeat/complete round trip for these).

import { randomUUID } from "node:crypto";
import { getPool } from "../db.js";
import { publishEvent } from "../events.js";
import * as audit from "../audit.js";
import { signAgentToken } from "../auth/agentJwt.js";
import { config } from "../config.js";
import { revokeAttempt } from "../services/revocation.js";
import { registerEngine } from "./index.js";
import { withDagSpan } from "../tracing.js";

const WORKFLOW_DEFINITION_KEY = "order_anomaly_remediation_v2";

const TOPOLOGY = Object.freeze({
  nodes: [
    { key: "triage", agentRole: "agent-a" },
    { key: "investigate", agentRole: "agent-b" },
    { key: "remediate", agentRole: "agent-c" },
    { key: "notify", agentRole: "backend-internal" },
    { key: "verify", agentRole: "backend-internal" },
  ],
  edges: [
    ["triage", "investigate"],
    ["investigate", "remediate"],
    ["investigate", "notify"],
    ["remediate", "verify"],
    ["notify", "verify"],
  ],
  sink: "verify",
});

/**
 * Inserts dag_runs, dag_nodes, and dag_edges for a new run from the
 * fixed topology above, then promotes whatever is immediately runnable
 * (the root node, `triage`, which has no upstream dependency).
 */
export async function initializeRun(runId, profile) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO dag_runs (run_id, workflow_definition_key, status, started_at)
     VALUES ($1, $2, 'running', now())
     ON CONFLICT (run_id) DO NOTHING`,
    [runId, WORKFLOW_DEFINITION_KEY],
  );

  const nodeIdByKey = new Map();
  for (const node of TOPOLOGY.nodes) {
    const { rows } = await pool.query(
      `INSERT INTO dag_nodes (run_id, node_key, agent_role, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (run_id, node_key) DO UPDATE SET node_key = EXCLUDED.node_key
       RETURNING node_id`,
      [runId, node.key, node.agentRole],
    );
    nodeIdByKey.set(node.key, rows[0].node_id);
  }

  for (const [fromKey, toKey] of TOPOLOGY.edges) {
    await pool.query(
      `INSERT INTO dag_edges (run_id, from_node_id, to_node_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (from_node_id, to_node_id) DO NOTHING`,
      [runId, nodeIdByKey.get(fromKey), nodeIdByKey.get(toKey)],
    );
  }

  publishEvent("dag_runs", { run_id: runId, status: "running" });
  await evaluateRunnableNodes(runId);
  return { runId, nodeIdByKey };
}

/**
 * Promotes every dependency-satisfied `pending` node to `runnable`, then
 * immediately and synchronously executes any backend-internal node among
 * them (notify/verify — no agent worker exists to claim these). Loops
 * until a full pass makes no further change, since executing one
 * backend-internal node can make another node runnable in turn. Also
 * evaluates run-completion semantics after each settle.
 */
export async function evaluateRunnableNodes(runId) {
  const pool = getPool();
  let changed = true;
  while (changed) {
    changed = false;

    const { rows: promotable } = await pool.query(
      `SELECT dn.node_id, dn.node_key, dn.agent_role
         FROM dag_nodes dn
        WHERE dn.run_id = $1
          AND dn.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM dag_edges de
            JOIN dag_nodes upstream ON de.from_node_id = upstream.node_id
            WHERE de.to_node_id = dn.node_id AND upstream.status != 'completed'
          )`,
      [runId],
    );

    for (const node of promotable) {
      await pool.query(
        `UPDATE dag_nodes SET status = 'runnable', updated_at = now() WHERE node_id = $1`,
        [node.node_id],
      );
      publishEvent("dag_nodes", {
        run_id: runId,
        node_id: node.node_id,
        node_key: node.node_key,
        status: "runnable",
      });
      changed = true;

      if (node.agent_role === "backend-internal") {
        await executeBackendNode(runId, node.node_key);
        changed = true; // completing a backend node can unlock more nodes
      }
    }
  }

  await evaluateRunCompletion(runId);
}

/**
 * Executes a backend-owned node (`notify`, `verify`) directly, with no
 * agent worker and no claim/heartbeat/complete round trip — transitions
 * runnable -> running -> completed|failed within this one call.
 */
export async function executeBackendNode(runId, nodeKey) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE dag_nodes SET status = 'running', claimed_by = 'backend-internal',
            claimed_at = now(), updated_at = now()
      WHERE run_id = $1 AND node_key = $2 AND status = 'runnable'
      RETURNING node_id, current_attempt_number + 1 AS attempt_number, current_fencing_token + 1 AS fencing_token`,
    [runId, nodeKey],
  );
  const node = rows[0];
  if (!node) return; // already handled (defensive — evaluateRunnableNodes only calls this once per promotion)

  await pool.query(
    `UPDATE dag_nodes SET current_attempt_number = $2, current_fencing_token = $3 WHERE node_id = $1`,
    [node.node_id, node.attempt_number, node.fencing_token],
  );
  const { rows: attemptRows } = await pool.query(
    `INSERT INTO dag_node_attempts
       (node_id, attempt_number, fencing_token, agent_identity, attempt_idempotency_key, execution_status, authority_status, started_at)
     VALUES ($1, $2, $3, 'backend-internal', $4, 'running', 'active', now())
     RETURNING attempt_id`,
    [
      node.node_id,
      node.attempt_number,
      node.fencing_token,
      `${runId}:${nodeKey}:${node.attempt_number}`,
    ],
  );
  const attemptId = attemptRows[0].attempt_id;

  try {
    const outputEvidence = await runBackendNodeLogic(runId, nodeKey);
    await pool.query(
      `UPDATE dag_node_attempts SET execution_status = 'completed', output_evidence = $2, ended_at = now() WHERE attempt_id = $1`,
      [attemptId, JSON.stringify(outputEvidence)],
    );
    await pool.query(
      `UPDATE dag_nodes SET status = 'completed', updated_at = now() WHERE node_id = $1`,
      [node.node_id],
    );
    publishEvent("dag_nodes", {
      run_id: runId,
      node_id: node.node_id,
      node_key: nodeKey,
      status: "completed",
    });
  } catch (err) {
    await pool.query(
      `UPDATE dag_node_attempts SET execution_status = 'failed', error_details = $2, ended_at = now() WHERE attempt_id = $1`,
      [attemptId, JSON.stringify({ message: err.message })],
    );
    await pool.query(
      `UPDATE dag_nodes SET status = 'failed', updated_at = now() WHERE node_id = $1`,
      [node.node_id],
    );
    publishEvent("dag_nodes", {
      run_id: runId,
      node_id: node.node_id,
      node_key: nodeKey,
      status: "failed",
    });
  }
  // Backend-internal nodes never hold a Vault credential, so there is
  // nothing for revokeAttempt to revoke — authority_status stays 'active'
  // by design (it was never issued any authority to begin with).
}

/**
 * The actual work each backend-internal node performs. Deliberately
 * small and concrete: `notify` records an audit event (no real
 * notification channel in this demo — see docs/architecture.md's
 * existing evidence-only telemetry model); `verify` queries live row
 * counts as an observable, honest check that the run's evidence lines
 * up with visible database state.
 */
async function runBackendNodeLogic(runId, nodeKey) {
  if (nodeKey === "notify") {
    // audit_events.task_id is NOT NULL (002_evidence.sql) — v1's every
    // other writer always has a real task; a backend-internal DAG node
    // has none, so this is a synthetic id for this one event row, not a
    // reference to any dag_node_attempts/tasks row.
    await audit.recordAuditEvent({
      runId,
      traceId: randomUUID(),
      taskId: randomUUID(),
      actorId: "backend-internal",
      action: "dag.notify",
      result: "ALLOW",
      target: "operator",
    });
    return { notified: true };
  }
  if (nodeKey === "verify") {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*) FROM orders) AS orders,
         (SELECT count(*) FROM order_items) AS order_items,
         (SELECT count(*) FROM products) AS products,
         (SELECT count(*) FROM inventory) AS inventory`,
    );
    return { verified: true, counts: rows[0] };
  }
  throw new Error(
    `No backend-internal execution logic registered for node "${nodeKey}"`,
  );
}

/**
 * Authenticated worker claim — the only path into a node for triage/
 * investigate/remediate (agent-a/b/c). Atomic: locks a runnable node for
 * this agent's role, advances its fencing token and attempt number, and
 * inserts the new attempt row, all in one statement. Mints the
 * attempt-bound JWT (02_02 grounding pass) the caller must present to
 * every subsequent call for this attempt.
 */
export async function claimNode(actorId, runId) {
  return withDagSpan(
    "dag.claim",
    { "factory.run_id": runId, "factory.agent_id": actorId },
    (span) => claimNodeInner(actorId, runId, span),
  );
}

async function claimNodeInner(actorId, runId, span) {
  const pool = getPool();
  const claimToken = randomUUID();
  const { rows } = await pool.query(
    `WITH candidate AS (
       SELECT dn.node_id, dn.node_key,
              dn.current_fencing_token + 1 AS next_fence,
              dn.current_attempt_number + 1 AS next_attempt
         FROM dag_nodes dn
        WHERE dn.run_id = $1 AND dn.agent_role = $2 AND dn.status = 'runnable'
        ORDER BY dn.created_at ASC
        FOR UPDATE OF dn SKIP LOCKED
        LIMIT 1
     ),
     claimed AS (
       UPDATE dag_nodes dn
          SET status = 'running',
              current_fencing_token = candidate.next_fence,
              current_attempt_number = candidate.next_attempt,
              claim_token = $3,
              claimed_by = $2,
              claimed_at = now(),
              heartbeat_expires_at = now() + INTERVAL '15 seconds',
              updated_at = now()
         FROM candidate
        WHERE dn.node_id = candidate.node_id
        RETURNING dn.node_id, dn.node_key, dn.current_attempt_number, dn.current_fencing_token
     )
     INSERT INTO dag_node_attempts
       (node_id, attempt_number, fencing_token, agent_identity, attempt_idempotency_key, execution_status, authority_status)
     SELECT claimed.node_id, claimed.current_attempt_number, claimed.current_fencing_token, $2,
            $1 || ':' || claimed.node_key || ':' || claimed.current_attempt_number,
            'running', 'active'
       FROM claimed
     RETURNING attempt_id, node_id,
       (SELECT node_key FROM dag_nodes WHERE node_id = dag_node_attempts.node_id) AS node_key,
       attempt_number, fencing_token, attempt_idempotency_key`,
    [runId, actorId, claimToken],
  );

  const claim = rows[0];
  if (!claim) {
    span.setAttribute("factory.claimed", false);
    return null; // nothing runnable for this agent right now
  }
  span.setAttribute("factory.claimed", true);
  span.setAttribute("factory.node_key", claim.node_key);
  span.setAttribute("factory.attempt_id", claim.attempt_id);
  span.setAttribute("factory.attempt_number", Number(claim.attempt_number));

  const attemptToken = signAgentToken({
    actorId,
    runId,
    taskId: null,
    attemptId: claim.attempt_id,
    nodeId: claim.node_id,
    fencingToken: Number(claim.fencing_token),
    ttlSeconds: config.auth.agentJwtTtlSeconds,
  });

  publishEvent("dag_nodes", {
    run_id: runId,
    node_id: claim.node_id,
    node_key: claim.node_key,
    status: "running",
    claimed_by: actorId,
  });
  // Distinctly-named alongside the generic table-mirror event above —
  // matches DAG_ATTEMPT_TIMED_OUT/EVIDENCE_LEASE_REVOKED's own pattern,
  // and is what agent-d's classify() (02_05) actually matches on.
  publishEvent("DAG_NODE_CLAIMED", {
    run_id: runId,
    node_id: claim.node_id,
    node_key: claim.node_key,
    attempt_id: claim.attempt_id,
    attempt_number: claim.attempt_number,
    agent_id: actorId,
  });

  const upstreamEvidence = await getUpstreamEvidence(claim.node_id);
  // Found live building 02_06: dag_node_attempts.input_evidence (the
  // schema column, since 009_v2_dag_tables.sql) was never actually
  // written anywhere — claimNode computed upstreamEvidence to hand to
  // the worker, but nothing persisted it back onto the attempt's own
  // row, which is what the frontend's evidence-hash verification badge
  // needs to compare against. Written here, once, at claim time — it is
  // immutable input, not something later steps update.
  if (Object.keys(upstreamEvidence).length) {
    await pool.query(
      `UPDATE dag_node_attempts SET input_evidence = $2 WHERE attempt_id = $1`,
      [claim.attempt_id, JSON.stringify(upstreamEvidence)],
    );
  }

  return {
    nodeId: claim.node_id,
    nodeKey: claim.node_key,
    attemptId: claim.attempt_id,
    attemptNumber: claim.attempt_number,
    fencingToken: Number(claim.fencing_token),
    attemptIdempotencyKey: claim.attempt_idempotency_key,
    attemptToken,
    ttlSeconds: config.auth.agentJwtTtlSeconds,
    heartbeatIntervalSeconds: 5,
    upstreamEvidence,
  };
}

/**
 * v2 (02_04's "Evidence Preservation & Immutability"): every completed
 * ancestor node's output_evidence, keyed by node_key, transitively —
 * not just direct predecessors, so `remediate` sees `triage`'s report
 * even though its own direct edge is only from `investigate`. Only
 * `completed` ancestors are included; an `invalidated` one (from a prior
 * retry — see retryNode) is deliberately excluded, since its evidence is
 * exactly what the retry decided could no longer be trusted.
 */
async function getUpstreamEvidence(nodeId) {
  const { rows } = await getPool().query(
    `WITH RECURSIVE ancestors AS (
       SELECT from_node_id AS node_id FROM dag_edges WHERE to_node_id = $1
       UNION
       SELECT de.from_node_id FROM dag_edges de JOIN ancestors a ON de.to_node_id = a.node_id
     )
     SELECT dn.node_key, a.output_evidence
       FROM dag_nodes dn
       JOIN ancestors anc ON dn.node_id = anc.node_id
       JOIN dag_node_attempts a ON a.node_id = dn.node_id AND a.attempt_number = dn.current_attempt_number
      WHERE dn.status = 'completed'`,
    [nodeId],
  );
  const evidence = {};
  for (const row of rows) evidence[row.node_key] = row.output_evidence;
  return evidence;
}

/** Extends heartbeat_expires_at by 15s — must be the attempt's own current fencing token. */
export async function renewHeartbeat(nodeId, fencingToken) {
  const { rows } = await getPool().query(
    `UPDATE dag_nodes
        SET heartbeat_expires_at = now() + INTERVAL '15 seconds', updated_at = now()
      WHERE node_id = $1 AND current_fencing_token = $2 AND status = 'running'
      RETURNING node_id`,
    [nodeId, fencingToken],
  );
  if (!rows[0]) {
    const err = new Error(
      "Stale fencing token — this attempt is no longer current",
    );
    err.status = 409;
    throw err;
  }
  return { ok: true };
}

/**
 * Found live: fencing-token equality alone is not sufficient. The
 * watchdog can terminate an attempt (execution_status='timed_out')
 * without incrementing current_fencing_token — that only happens on the
 * NEXT claim, which may not have occurred yet. A late completion from
 * the original, abandoned worker would then present a fencing token that
 * still matches dag_nodes.current_fencing_token and be wrongly accepted.
 * Requiring the attempt's own execution_status to still be 'running'
 * closes this — a terminal execution_status (from the watchdog OR an
 * earlier complete/fail call) always blocks a late arrival, independent
 * of whether a fresh claim has happened yet.
 */
async function assertCurrentFencingToken(nodeId, attemptId, fencingToken) {
  const { rows } = await getPool().query(
    `SELECT n.current_fencing_token, a.execution_status
       FROM dag_nodes n
       JOIN dag_node_attempts a ON a.node_id = n.node_id
      WHERE n.node_id = $1 AND a.attempt_id = $2`,
    [nodeId, attemptId],
  );
  const row = rows[0];
  if (
    !row ||
    Number(row.current_fencing_token) !== Number(fencingToken) ||
    row.execution_status !== "running"
  ) {
    const err = new Error(
      "Stale fencing token — this attempt is no longer current",
    );
    err.status = 409;
    throw err;
  }
}

/**
 * Marks an attempt (and its node) completed, revokes its authority
 * immediately (success does not extend a credential's life one second
 * past the work it was issued for), and cascades to whatever the
 * completion just unblocked.
 */
export async function completeAttempt(
  runId,
  nodeId,
  attemptId,
  fencingToken,
  outputEvidence,
) {
  return withDagSpan(
    "dag.complete",
    { "factory.run_id": runId, "factory.node_id": nodeId, "factory.attempt_id": attemptId },
    async (span) => {
      await assertCurrentFencingToken(nodeId, attemptId, fencingToken);
      const pool = getPool();
      await pool.query(
        `UPDATE dag_node_attempts SET execution_status = 'completed', output_evidence = $2, ended_at = now() WHERE attempt_id = $1`,
        [attemptId, JSON.stringify(outputEvidence ?? {})],
      );
      const { rows } = await pool.query(
        `UPDATE dag_nodes SET status = 'completed', updated_at = now() WHERE node_id = $1 RETURNING node_key`,
        [nodeId],
      );
      span.setAttribute("factory.node_key", rows[0]?.node_key ?? "");
      publishEvent("dag_nodes", {
        run_id: runId,
        node_id: nodeId,
        node_key: rows[0]?.node_key,
        status: "completed",
      });
      await revokeAttempt(attemptId, "attempt_completed");
      await evaluateRunnableNodes(runId);
      return { ok: true };
    },
  );
}

/** Marks an attempt (and its node) failed and revokes its authority immediately. */
export async function failAttempt(
  runId,
  nodeId,
  attemptId,
  fencingToken,
  errorDetails,
) {
  return withDagSpan(
    "dag.fail",
    { "factory.run_id": runId, "factory.node_id": nodeId, "factory.attempt_id": attemptId },
    async (span) => {
      await assertCurrentFencingToken(nodeId, attemptId, fencingToken);
      const pool = getPool();
      await pool.query(
        `UPDATE dag_node_attempts SET execution_status = 'failed', error_details = $2, ended_at = now() WHERE attempt_id = $1`,
        [attemptId, JSON.stringify(errorDetails ?? {})],
      );
      const { rows } = await pool.query(
        `UPDATE dag_nodes SET status = 'failed', updated_at = now() WHERE node_id = $1 RETURNING node_key`,
        [nodeId],
      );
      span.setAttribute("factory.node_key", rows[0]?.node_key ?? "");
      publishEvent("dag_nodes", {
        run_id: runId,
        node_id: nodeId,
        node_key: rows[0]?.node_key,
        status: "failed",
      });
      await revokeAttempt(attemptId, "attempt_failed");
      await evaluateRunCompletion(runId);
      return { ok: true };
    },
  );
}

/**
 * Operator-triggered selective retry — the one and only retry trigger
 * (02_07 grounding pass resolved "operator click or automated retry"
 * ambiguity to this single endpoint/function). Only a `failed` node can
 * be retried. Invalidates strictly-downstream nodes that had already
 * progressed on the assumption the failed node would succeed, revoking
 * any of their still-active attempts, and makes the target runnable
 * again for a fresh claim.
 */
export async function retryNode(runId, nodeKey, operatorId) {
  return withDagSpan(
    "dag.retry",
    { "factory.run_id": runId, "factory.node_key": nodeKey, "factory.operator_id": operatorId || "operator" },
    () => retryNodeInner(runId, nodeKey, operatorId),
  );
}

async function retryNodeInner(runId, nodeKey, operatorId) {
  const pool = getPool();
  const { rows: targetRows } = await pool.query(
    `SELECT node_id, status FROM dag_nodes WHERE run_id = $1 AND node_key = $2`,
    [runId, nodeKey],
  );
  const target = targetRows[0];
  if (!target) {
    const err = new Error(`No such node "${nodeKey}" in run ${runId}`);
    err.status = 404;
    throw err;
  }
  if (target.status !== "failed") {
    const err = new Error(
      `Node "${nodeKey}" is "${target.status}", not "failed" — only a failed node can be retried`,
    );
    err.status = 409;
    throw err;
  }

  const { rows: downstream } = await pool.query(
    `WITH RECURSIVE reachable AS (
       SELECT to_node_id AS node_id FROM dag_edges WHERE from_node_id = $1
       UNION
       SELECT de.to_node_id FROM dag_edges de JOIN reachable r ON de.from_node_id = r.node_id
     )
     SELECT DISTINCT dn.node_id, dn.node_key, dn.status
       FROM dag_nodes dn JOIN reachable r ON dn.node_id = r.node_id`,
    [target.node_id],
  );

  const actuallyInvalidated = [];
  for (const node of downstream) {
    if (["completed", "running", "runnable"].includes(node.status)) {
      actuallyInvalidated.push(node.node_key);
      await pool.query(
        `UPDATE dag_nodes SET status = 'invalidated', updated_at = now() WHERE node_id = $1`,
        [node.node_id],
      );
      publishEvent("dag_nodes", {
        run_id: runId,
        node_id: node.node_id,
        node_key: node.node_key,
        status: "invalidated",
      });
      // Distinctly-named (02_05) — agent-d's classify() matches on this,
      // not the generic table-mirror event above.
      publishEvent("DAG_NODE_INVALIDATED", {
        run_id: runId,
        node_id: node.node_id,
        node_key: node.node_key,
      });
      const { rows: activeAttempts } = await pool.query(
        `SELECT attempt_id FROM dag_node_attempts WHERE node_id = $1 AND authority_status = 'active'`,
        [node.node_id],
      );
      for (const a of activeAttempts) {
        await revokeAttempt(a.attempt_id, "downstream_invalidated");
      }
    }
  }

  // Reset to 'pending', not directly to 'runnable': evaluateRunnableNodes
  // below is what promotes pending -> runnable (re-verifying the
  // dependency condition) AND executes it immediately if it's
  // backend-internal — setting 'runnable' directly here would skip that
  // promotion step and a backend-internal node would never actually run
  // (found live: notify stuck at "runnable" forever after a retry).
  await pool.query(
    `UPDATE dag_nodes SET status = 'pending', updated_at = now() WHERE node_id = $1`,
    [target.node_id],
  );
  publishEvent("dag_nodes", {
    run_id: runId,
    node_id: target.node_id,
    node_key: nodeKey,
    status: "pending",
  });
  await audit.recordAuditEvent({
    runId,
    traceId: randomUUID(),
    taskId: randomUUID(), // synthetic — see notify's own comment in runBackendNodeLogic
    actorId: operatorId || "operator",
    action: "dag.retry",
    result: "ALLOW",
    target: nodeKey,
  });

  await pool.query(`UPDATE dag_runs SET status = 'running' WHERE run_id = $1`, [
    runId,
  ]);
  // A retried backend-internal node (e.g. `notify`) has no agent worker
  // to claim it — evaluateRunnableNodes is what actually executes it,
  // same as the very first time it became runnable during initializeRun.
  await evaluateRunnableNodes(runId);
  return {
    ok: true,
    retried: nodeKey,
    // Found live (02_05): this used to report the FULL downstream set
    // (every node reachable via dag_edges), including ones still
    // 'pending' that were never actually touched — misleading callers
    // into believing a state change happened where none did. Now
    // reports only nodes that genuinely transitioned to 'invalidated'.
    invalidatedDownstream: actuallyInvalidated,
  };
}

/**
 * Run-completion semantics (02_02 grounding pass): `completed` only when
 * the sink node (`verify`) is `completed`; `failed` when any node is
 * `failed` with no path back to `runnable` (i.e. nothing left that could
 * still reach `verify`); `cancelled` is never inferred here — only set
 * by an explicit operator action (cancelRun).
 */
async function evaluateRunCompletion(runId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT node_key, status FROM dag_nodes WHERE run_id = $1`,
    [runId],
  );
  const sink = rows.find((n) => n.node_key === TOPOLOGY.sink);
  if (sink?.status === "completed") {
    await pool.query(
      `UPDATE dag_runs SET status = 'completed', completed_at = now() WHERE run_id = $1 AND status != 'completed'`,
      [runId],
    );
    publishEvent("dag_runs", { run_id: runId, status: "completed" });
    return;
  }
  // Found live (prompts/v2/02_07's own acceptance test): 'pending' is
  // never "still viable" on its own — a node stays 'pending' precisely
  // because its own upstream hasn't completed, and evaluateRunnableNodes
  // only ever promotes it once that upstream reaches 'completed'. If
  // that upstream is 'failed' instead, the pending node can NEVER be
  // promoted without an operator retry — counting it here as "still
  // runnable" meant a failed root node (e.g. triage) left the run
  // 'running' forever, since every downstream node was (permanently,
  // absent a retry) stuck 'pending'. Only 'runnable'/'running' reflect
  // actual, current progress; dag_runs.status='failed' means "blocked
  // right now," not "can never succeed" — retryNode() already flips it
  // back to 'running' explicitly the moment an operator acts.
  const hasFailedNode = rows.some((n) => n.status === "failed");
  const hasActiveProgress = rows.some((n) =>
    ["runnable", "running"].includes(n.status),
  );
  if (hasFailedNode && !hasActiveProgress) {
    await pool.query(
      `UPDATE dag_runs SET status = 'failed', completed_at = now() WHERE run_id = $1 AND status NOT IN ('completed', 'failed')`,
      [runId],
    );
    publishEvent("dag_runs", { run_id: runId, status: "failed" });
  }
}

export async function cancelRun(runId, reason) {
  const pool = getPool();
  const { rows: activeAttempts } = await pool.query(
    `SELECT attempt_id FROM dag_node_attempts a
       JOIN dag_nodes n ON n.node_id = a.node_id
      WHERE n.run_id = $1 AND a.authority_status = 'active'`,
    [runId],
  );
  for (const a of activeAttempts) {
    await revokeAttempt(a.attempt_id, "run_reset");
  }
  await pool.query(
    `UPDATE dag_runs SET status = 'cancelled', completed_at = now() WHERE run_id = $1`,
    [runId],
  );
  publishEvent("dag_runs", { run_id: runId, status: "cancelled", reason });
  return { ok: true };
}

export async function getRunTopology(runId) {
  const pool = getPool();
  const { rows: nodes } = await pool.query(
    `SELECT * FROM dag_nodes WHERE run_id = $1 ORDER BY created_at ASC`,
    [runId],
  );
  const { rows: edges } = await pool.query(
    `SELECT from_node_id, to_node_id FROM dag_edges WHERE run_id = $1`,
    [runId],
  );
  const { rows: attempts } = await pool.query(
    `SELECT a.* FROM dag_node_attempts a
       JOIN dag_nodes n ON n.node_id = a.node_id
      WHERE n.run_id = $1
      ORDER BY a.started_at ASC`,
    [runId],
  );
  const { rows: runRows } = await pool.query(
    `SELECT * FROM dag_runs WHERE run_id = $1`,
    [runId],
  );
  return { run: runRows[0] || null, nodes, edges, attempts };
}

// -- BaseWorkflowEngine contract (orchestrator/index.js) --------------------

const RecoverableMicroDagEngine = {
  async startRun(demoRun) {
    await initializeRun(demoRun.run_id, demoRun.profile);
    return getRunTopology(demoRun.run_id);
  },
  async claimTask(authenticatedAgent, options) {
    return claimNode(authenticatedAgent, options?.runId);
  },
  async completeAttempt(
    nodeId,
    attemptId,
    fencingToken,
    outputEvidence,
    options,
  ) {
    return completeAttempt(
      options?.runId,
      nodeId,
      attemptId,
      fencingToken,
      outputEvidence,
    );
  },
  async failAttempt(nodeId, attemptId, fencingToken, errorDetails, options) {
    return failAttempt(
      options?.runId,
      nodeId,
      attemptId,
      fencingToken,
      errorDetails,
    );
  },
  async retryNode(runId, nodeKey, operatorId) {
    return retryNode(runId, nodeKey, operatorId);
  },
  async cancelRun(runId, reason) {
    return cancelRun(runId, reason);
  },
};

registerEngine("recoverable_dag", RecoverableMicroDagEngine);

export { TOPOLOGY, RecoverableMicroDagEngine };
