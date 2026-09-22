// routes/dag.js — v2 (prompts/v2/02_02_v2_backend_dag_orchestrator.md):
// the recoverable micro-DAG's own API surface, entirely additive beside
// v1's existing routes/tasks.js and routes/delegations.js.

import { Router } from "express";
import { getPool } from "../db.js";
import * as state from "../state.js";
import { requireHumanSession } from "../auth/index.js";
import { requireRole } from "../auth/authorize.js";
import { agentAuth } from "../middleware/agentAuth.js";
import { agentAttemptJwtAuth } from "../middleware/agentAttemptJwtAuth.js";
import {
  initializeRun,
  claimNode,
  renewHeartbeat,
  completeAttempt,
  failAttempt,
  retryNode,
  getRunTopology,
} from "../orchestrator/dag-engine.js";

export const dagRouter = Router();

/**
 * Starts DAG execution for the current active run. Requires the current
 * run's demo_runs.workflow_mode to already be "recoverable_dag" (set via
 * PUT /api/demo/workflow-mode before this is called) — this endpoint
 * builds the DAG's own dag_runs/dag_nodes/dag_edges rows, it does not
 * create a demo_runs row or change the workflow mode itself.
 */
dagRouter.post(
  "/dag/runs",
  requireHumanSession,
  requireRole("start_task"),
  async (req, res, next) => {
    try {
      const runId = state.getCurrentRunId();
      if (!runId) {
        return res.status(409).json({ error: "No active run — reset or start one first" });
      }
      const { rows } = await getPool().query(
        `SELECT profile, workflow_mode FROM demo_runs WHERE run_id = $1`,
        [runId],
      );
      const demoRun = rows[0];
      if (!demoRun) {
        return res.status(404).json({ error: `No demo_runs row for ${runId}` });
      }
      if (demoRun.workflow_mode !== "recoverable_dag") {
        return res.status(409).json({
          error: `Current run's workflow_mode is "${demoRun.workflow_mode}", not "recoverable_dag" — switch it first via PUT /api/demo/workflow-mode`,
        });
      }
      await initializeRun(runId, demoRun.profile);
      const topology = await getRunTopology(runId);
      res.status(201).json(topology);
    } catch (err) {
      next(err);
    }
  },
);

dagRouter.get("/dag/runs/:id", requireHumanSession, async (req, res, next) => {
  try {
    const topology = await getRunTopology(req.params.id);
    if (!topology.run) {
      return res.status(404).json({ error: "No such DAG run" });
    }
    res.json(topology);
  } catch (err) {
    next(err);
  }
});

/**
 * Authenticated worker task-claim endpoint. Uses the agent's static
 * pre-shared bearer token (agentAuth), same as v1's own bootstrap
 * endpoint — there is no attempt yet to bind a JWT to until this claim
 * succeeds. Returns 204 with no body when nothing is runnable for this
 * agent right now (agents/src/dagWorker.js, 02_04, polls this).
 */
dagRouter.post("/dag/tasks/claim", agentAuth, async (req, res, next) => {
  try {
    const runId = state.getCurrentRunId();
    if (!runId) return res.status(204).end();
    const claim = await claimNode(req.actorId, runId);
    if (!claim) return res.status(204).end();
    res.status(200).json(claim);
  } catch (err) {
    next(err);
  }
});

dagRouter.post(
  "/dag/tasks/:nodeId/heartbeat",
  agentAttemptJwtAuth,
  async (req, res, next) => {
    try {
      if (req.nodeId !== req.params.nodeId) {
        return res.status(403).json({ error: "Attempt token is not bound to this node" });
      }
      const result = await renewHeartbeat(req.nodeId, req.fencingToken);
      res.json(result);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  },
);

dagRouter.post(
  "/dag/tasks/:nodeId/attempts/:attemptId/complete",
  agentAttemptJwtAuth,
  async (req, res, next) => {
    try {
      if (req.nodeId !== req.params.nodeId || req.attemptId !== req.params.attemptId) {
        return res.status(403).json({ error: "Attempt token is not bound to this node/attempt" });
      }
      const { outputEvidence } = req.body || {};
      const result = await completeAttempt(
        req.runId,
        req.nodeId,
        req.attemptId,
        req.fencingToken,
        outputEvidence,
      );
      res.json(result);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  },
);

dagRouter.post(
  "/dag/tasks/:nodeId/attempts/:attemptId/fail",
  agentAttemptJwtAuth,
  async (req, res, next) => {
    try {
      if (req.nodeId !== req.params.nodeId || req.attemptId !== req.params.attemptId) {
        return res.status(403).json({ error: "Attempt token is not bound to this node/attempt" });
      }
      const { errorDetails } = req.body || {};
      const result = await failAttempt(
        req.runId,
        req.nodeId,
        req.attemptId,
        req.fencingToken,
        errorDetails,
      );
      res.json(result);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  },
);

/**
 * The one and only retry trigger (02_07 grounding pass) — the UI's
 * operator-click retry button and an automated acceptance test both call
 * this exact endpoint; there is no separate implicit/background retry
 * mechanism.
 */
dagRouter.post(
  "/dag/runs/:id/nodes/:nodeKey/retry",
  requireHumanSession,
  requireRole("retry_dag_node"),
  async (req, res, next) => {
    try {
      const operatorId = req.identity?.user || "operator";
      const result = await retryNode(req.params.id, req.params.nodeKey, operatorId);
      res.json(result);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  },
);
