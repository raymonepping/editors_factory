// src/services/watchdog.js — v2 (prompts/v2/02_02): crash-recovery
// heartbeat watchdog for the recoverable micro-DAG. A worker that
// stopped renewing its heartbeat (crashed, network-partitioned, or just
// slow past its 15s window — dagWorker.js renews every 5s, 02_04) is
// exactly the case v1 has no answer for; this is what "retry the work,
// not the authority" needs to actually recover from an attempt that
// silently died mid-flight, not just one that explicitly failed.

import { getPool } from "../db.js";
import { publishEvent } from "../events.js";
import { revokeAttempt } from "./revocation.js";
import { evaluateRunnableNodes } from "../orchestrator/dag-engine.js";

const INTERVAL_MS = 5000;
let timer = null;

async function sweep() {
  const pool = getPool();
  const { rows: timedOut } = await pool.query(
    `SELECT n.node_id, n.node_key, n.run_id, a.attempt_id
       FROM dag_nodes n
       JOIN dag_node_attempts a
         ON a.node_id = n.node_id AND a.attempt_number = n.current_attempt_number
      WHERE n.status = 'running' AND n.heartbeat_expires_at < now()`,
  );

  const affectedRuns = new Set();
  for (const row of timedOut) {
    await pool.query(
      `UPDATE dag_nodes SET status = 'failed', updated_at = now() WHERE node_id = $1`,
      [row.node_id],
    );
    await pool.query(
      `UPDATE dag_node_attempts SET execution_status = 'timed_out', ended_at = now() WHERE attempt_id = $1`,
      [row.attempt_id],
    );
    publishEvent("DAG_ATTEMPT_TIMED_OUT", {
      run_id: row.run_id,
      node_id: row.node_id,
      node_key: row.node_key,
      attempt_id: row.attempt_id,
    });
    // revokeAttempt() itself now always emits EVIDENCE_LEASE_REVOKED
    // (services/revocation.js, found live during 02_05) — no separate
    // publish needed here.
    await revokeAttempt(row.attempt_id, "watchdog_timeout");
    affectedRuns.add(row.run_id);
  }

  for (const runId of affectedRuns) {
    await evaluateRunnableNodes(runId);
  }
}

/** Starts the 5s sweep. Idempotent — calling it twice does not double the timer. */
export function startWatchdog() {
  if (timer) return;
  timer = setInterval(() => {
    sweep().catch((err) => {
      console.error("[watchdog] sweep failed:", err.message);
    });
  }, INTERVAL_MS);
  timer.unref?.();
  console.log(`[watchdog] started (interval ${INTERVAL_MS}ms)`);
}

export function stopWatchdog() {
  if (timer) clearInterval(timer);
  timer = null;
}
