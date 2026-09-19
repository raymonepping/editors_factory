import { Router } from "express";
import { randomUUID } from "node:crypto";
import * as audit from "../audit.js";
import * as state from "../state.js";
import { effectiveAuthorityFor } from "../policy.js";
import { requireHumanSession } from "../auth/index.js";
import { requireRole } from "../auth/authorize.js";
import { agentJwtAuth } from "../middleware/agentJwtAuth.js";
import { cleanupTaskCredentials } from "../services/revocation.js";

export const tasksRouter = Router();

const DELEGATION_DEPTH = {
  "agent-a": 1,
  "agent-b": 2,
  "agent-c": 3,
  "agent-d": 0,
};

/**
 * The entry point for the human/frontend trigger — creates the first
 * task, for agent-a, at delegation depth 1. Protected by human session AuthN/AuthZ.
 */
tasksRouter.post(
  "/agents/:agentId/tasks",
  requireHumanSession,
  requireRole("start_task"),
  async (req, res, next) => {
    try {
      const { agentId } = req.params;
      if (agentId !== "agent-a") {
        return res.status(400).json({
          error:
            "Only agent-a accepts a direct (human-originated) task. Use POST /api/delegations for agent-to-agent delegation.",
        });
      }
      const { goal } = req.body || {};
      if (!goal) return res.status(400).json({ error: "goal is required" });

      let runId = state.getCurrentRunId();
      if (!runId) {
        runId = await audit.startRun(state.getProfile());
        state.setCurrentRunId(runId);
      }

      const traceId = randomUUID();
      const taskId = randomUUID();
      const effectiveAuthority = effectiveAuthorityFor(
        "agent-a",
        state.getProfile(),
      );

      const humanUser = req.identity?.user || "human";
      // Prompt 01.02 Phase 1: stable identity for the root task's own
      // evidence row, distinct from the display name above — null for
      // every identity domain that isn't a real Keycloak session
      // (disabled-auth demo mode, the CLI operator token), by design.
      const humanSubjectId = req.identity?.subjectId ?? null;

      state.createTask({
        taskId,
        actorId: "agent-a",
        delegatedBy: humanUser,
        delegationDepth: 1,
        effectiveAuthority,
        traceId,
        parentTaskId: null,
        goal,
      });

      await audit.recordAuditEvent({
        runId,
        traceId,
        taskId,
        actorId: "agent-a",
        delegatedBy: humanUser,
        humanSubjectId,
        delegationDepth: 1,
        requestedAuthority: null,
        effectiveAuthority: effectiveAuthority.join(","),
        action: "task.created",
        result: "ALLOW",
        target: "agent-a",
      });

      res.status(201).json({
        taskId,
        traceId,
        actorId: "agent-a",
        delegationDepth: 1,
        effectiveAuthority,
        goal,
        runId,
      });
    } catch (err) {
      next(err);
    }
  },
);

tasksRouter.get("/tasks/:taskId", requireHumanSession, (req, res) => {
  const task = state.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: "not found" });
  res.json(task);
});

/**
 * Prompt 01.02 Phase 2 (input/Codex_Feedback.md): agents/src/runtime.js
 * calls this the moment its own runLoop reaches a genuine terminal state
 * for a task — never on the "delegated onward" path, where the task is
 * correctly still active, just owned by the next agent. Closes a real
 * gap: before this, nothing told the backend a task's work was actually
 * over, so a successfully-completed BAD run's credential stayed active
 * until the next reset/profile-switch/denial, not revoked at the moment
 * the work that justified it ended.
 *
 * agentJwtAuth already guarantees req.taskId is this exact agent's own
 * active task (or the request would have already 401'd) — the route
 * param is checked against it anyway, defensively, rather than trusted
 * on its own.
 */
tasksRouter.post(
  "/tasks/:taskId/complete",
  agentJwtAuth,
  async (req, res, next) => {
    try {
      if (req.taskId !== req.params.taskId) {
        return res.status(403).json({
          error: "token is not bound to the task named in the URL",
        });
      }
      const task = state.completeTask(req.params.taskId);
      if (!task) {
        return res.status(404).json({ error: "not found" });
      }
      if (req.actorId === "agent-c") {
        await cleanupTaskCredentials(req.params.taskId, "task_completed");
      }
      res.json({ completed: true, taskId: req.params.taskId });
    } catch (err) {
      next(err);
    }
  },
);

export { DELEGATION_DEPTH };
