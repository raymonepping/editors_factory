import { Router } from "express";
import { getPool } from "../db.js";
import { cleanupRunCredentials } from "../services/revocation.js";
import * as audit from "../audit.js";
import * as state from "../state.js";
import { requireHumanSession } from "../auth/index.js";
import { requireRole } from "../auth/authorize.js";

export const demoRouter = Router();

// v2: currentRunWorkflowMode is the CURRENT RUN's own stored
// demo_runs.workflow_mode — deliberately distinct from GET
// /demo/workflow-mode's in-memory state.getWorkflowMode(), which is
// what the NEXT run (after a reset) will get. Found live (reported
// three times against this exact confusion): an operator switches the
// Execution Model selector, then clicks Start Micro-DAG Run without
// resetting first — the selector's in-memory value updates immediately,
// but the CURRENT run was already created under the old mode and
// switching alone never retroactively changes it, so POST /api/dag/runs
// 409s. That 409 message was already made specific (02_09-era fix), but
// an operator still had to hit the failure once per occurrence to see
// it. Exposing both values here lets the frontend detect the mismatch
// proactively, before the click, instead of only explaining it well
// after the fact.
demoRouter.get("/demo/mode", async (req, res, next) => {
  try {
    const runId = state.getCurrentRunId();
    let currentRunWorkflowMode = null;
    if (runId) {
      const { rows } = await getPool().query(
        `SELECT workflow_mode FROM demo_runs WHERE run_id = $1`,
        [runId],
      );
      currentRunWorkflowMode = rows[0]?.workflow_mode ?? null;
    }
    res.json({
      profile: state.getProfile(),
      runId,
      currentRunWorkflowMode,
    });
  } catch (err) {
    next(err);
  }
});

demoRouter.put(
  "/demo/mode",
  requireHumanSession,
  requireRole("switch_profile"),
  async (req, res, next) => {
    try {
      const { profile } = req.body || {};
      if (profile !== "bad" && profile !== "good") {
        return res
          .status(400)
          .json({ error: 'profile must be "bad" or "good"' });
      }
      const previous = await audit.getActiveRun();
      if (previous) {
        await cleanupRunCredentials(previous.run_id, "profile_switch");
        await audit.endRun(previous.run_id, "completed");
      }

      state.setProfile(profile);
      const workflowModeAtStart = state.getWorkflowMode();
      const runId = await audit.startRun(
        profile,
        workflowModeAtStart,
        state.getFaultInjectionMode(),
        state.getAuthorityMechanism(),
      );
      state.setCurrentRunId(runId);
      state.clearTasks();
      state.clearActiveAgentCCredential();
      state.clearPendingApprovals();

      // Same field GET /demo/mode exposes — this run just captured
      // workflowModeAtStart, so no extra query needed to report it.
      res.json({
        profile,
        runId,
        currentRunWorkflowMode: workflowModeAtStart,
      });
    } catch (err) {
      next(err);
    }
  },
);

demoRouter.get("/demo/workflow-mode", (req, res) => {
  res.json({ workflowMode: state.getWorkflowMode() });
});

/**
 * v2 (prompts/v2/02_02 grounding pass): mirrors PUT /demo/mode's own
 * requireHumanSession + requireRole pattern exactly. Deliberately does
 * NOT start a new run or touch `profile` — workflow_mode and
 * authority_profile are orthogonal controls (02_00) and must never be
 * coupled. Rejects with 409 while a v2 DAG run is genuinely in flight
 * (dag_runs.status = 'running' for the current run) — switching modes
 * mid-DAG would leave that run's own dag_nodes/dag_node_attempts
 * orphaned from demo_runs.workflow_mode. Switching while only v1 work is
 * in flight is unaffected — v1 has no dag_runs row to check.
 */
demoRouter.put(
  "/demo/workflow-mode",
  requireHumanSession,
  requireRole("switch_workflow_mode"),
  async (req, res, next) => {
    try {
      const { workflowMode } = req.body || {};
      if (
        workflowMode !== "fixed_chain" &&
        workflowMode !== "recoverable_dag"
      ) {
        return res.status(400).json({
          error: 'workflowMode must be "fixed_chain" or "recoverable_dag"',
        });
      }
      const runId = state.getCurrentRunId();
      if (runId) {
        const { rows } = await getPool().query(
          `SELECT status FROM dag_runs WHERE run_id = $1`,
          [runId],
        );
        if (rows[0]?.status === "running") {
          return res.status(409).json({
            error:
              "A v2 DAG run is currently in progress for the active run — reset or let it finish before switching workflow_mode.",
          });
        }
      }
      state.setWorkflowMode(workflowMode);
      res.json({ workflowMode });
    } catch (err) {
      next(err);
    }
  },
);

demoRouter.get("/demo/authority-mechanism", (req, res) => {
  res.json({ authorityMechanism: state.getAuthorityMechanism() });
});

/**
 * prompts/v3/03_01: same pattern as PUT /demo/workflow-mode exactly —
 * orthogonal to profile/workflow_mode/fault_injection_mode, sets
 * demo_runs.authority_mechanism for the next triggered run. Guards
 * against switching mid-DAG-run the same way, even though v3 itself
 * never participates in a DAG run (Phase 4's non-goals) — kept
 * consistent with every other per-run control here rather than special-
 * cased, and costs nothing since a v3 run never sets dag_runs.status
 * in the first place.
 */
demoRouter.put(
  "/demo/authority-mechanism",
  requireHumanSession,
  requireRole("switch_workflow_mode"),
  async (req, res, next) => {
    try {
      const { authorityMechanism } = req.body || {};
      if (
        authorityMechanism !== "sentinel_approle" &&
        authorityMechanism !== "vault_native_oauth"
      ) {
        return res.status(400).json({
          error:
            'authorityMechanism must be "sentinel_approle" or "vault_native_oauth"',
        });
      }
      const runId = state.getCurrentRunId();
      if (runId) {
        const { rows } = await getPool().query(
          `SELECT status FROM dag_runs WHERE run_id = $1`,
          [runId],
        );
        if (rows[0]?.status === "running") {
          return res.status(409).json({
            error:
              "A v2 DAG run is currently in progress for the active run — reset or let it finish before switching authority_mechanism.",
          });
        }
      }
      state.setAuthorityMechanism(authorityMechanism);
      res.json({ authorityMechanism });
    } catch (err) {
      next(err);
    }
  },
);

demoRouter.get("/demo/fault-injection-mode", (req, res) => {
  res.json({ faultInjectionMode: state.getFaultInjectionMode() });
});

const VALID_FAULT_MODES = [
  "none",
  "fail_before_mutation",
  "fail_after_mutation",
  "lock_timeout",
];

/**
 * v2 (prompts/v2/02_06/02_07): same pattern as PUT /demo/workflow-mode
 * exactly — sets demo_runs.fault_injection_mode for the next triggered
 * run. The actual fault-injection enforcement point (reading this value
 * during remediate's mutation) is 02_07's own deliverable; this control
 * exists and persists per-run starting now, same as workflow_mode's own
 * column existed in 02_01 before 02_02 built anything that read it.
 */
demoRouter.put(
  "/demo/fault-injection-mode",
  requireHumanSession,
  requireRole("switch_workflow_mode"),
  async (req, res, next) => {
    try {
      const { faultInjectionMode } = req.body || {};
      if (!VALID_FAULT_MODES.includes(faultInjectionMode)) {
        return res.status(400).json({
          error: `faultInjectionMode must be one of: ${VALID_FAULT_MODES.join(", ")}`,
        });
      }
      const runId = state.getCurrentRunId();
      if (runId) {
        const { rows } = await getPool().query(
          `SELECT status FROM dag_runs WHERE run_id = $1`,
          [runId],
        );
        if (rows[0]?.status === "running") {
          return res.status(409).json({
            error:
              "A v2 DAG run is currently in progress for the active run — reset or let it finish before switching fault_injection_mode.",
          });
        }
      }
      state.setFaultInjectionMode(faultInjectionMode);
      res.json({ faultInjectionMode });
    } catch (err) {
      next(err);
    }
  },
);

demoRouter.post(
  "/demo/reset",
  requireHumanSession,
  requireRole("reset_demo"),
  async (req, res, next) => {
    try {
      const runId = state.getCurrentRunId();

      let revoked = 0;
      if (runId) {
        const cleanup = await cleanupRunCredentials(runId, "reset");
        revoked = cleanup.cleaned;
        await audit.endRun(runId, "reset");
      }

      // audit_events must be cleared before delegations — Prompt 01.02
      // Phase 1 added audit_events.delegation_id, a real FK to
      // delegations(delegation_id), so a referencing audit_events row
      // now blocks deleting its delegation first (found live: this
      // order used to be delegations-then-audit_events, which worked
      // only because nothing referenced delegations by id yet).
      //
      // Found live (01_03 validation, ~1/5 runs): factory-agent-d is a
      // real, continuously-running container reacting to the live SSE
      // stream independently of this request. Under the default READ
      // COMMITTED isolation, each statement in this batch takes its own
      // fresh snapshot — so if agent-d's create_finding call inserts an
      // audit_events row for this exact run between this batch's own
      // `DELETE FROM audit_events` and its later `DELETE FROM
      // demo_runs`, that later statement sees a row that did not exist
      // when the batch started and fails the FK check, aborting the
      // whole reset. REPEATABLE READ fixes this at the root rather than
      // retrying around it: the transaction takes ONE snapshot at its
      // first statement and every later statement in it sees only that
      // snapshot, so a concurrent commit from agent-d's own separate
      // connection becomes invisible to the rest of this transaction,
      // exactly as if it happened after reset finished. (Postgres will
      // raise 40001 "could not serialize access" instead of an FK
      // violation if a genuine write conflict occurs under REPEATABLE
      // READ — none of these statements can conflict with agent-d's own
      // insert-only writes to different rows, so that path is not
      // expected to fire here.)
      const client = await getPool().connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        await client.query(
          `DELETE FROM findings; DELETE FROM database_changes; DELETE FROM credential_events;
           DELETE FROM authority_decisions; DELETE FROM audit_events; DELETE FROM delegations;
           DELETE FROM demo_runs;`,
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      state.clearTasks();
      state.clearActiveAgentCCredential();
      state.clearPendingApprovals();

      const newRunId = await audit.startRun(
        state.getProfile(),
        state.getWorkflowMode(),
        state.getFaultInjectionMode(),
      );
      state.setCurrentRunId(newRunId);

      res.json({
        reset: true,
        revokedLeases: revoked,
        runId: newRunId,
        profile: state.getProfile(),
        note: "Evidence tables and Vault leases reset. Product/order data reset separately via `make infra-seed` (see Makefile's `reset` target) — factory-backend-role is intentionally not privileged to touch it.",
      });
    } catch (err) {
      next(err);
    }
  },
);
