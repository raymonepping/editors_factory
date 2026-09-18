import { Router } from "express";
import { randomUUID } from "node:crypto";
import * as audit from "../audit.js";
import * as state from "../state.js";
import { effectiveAuthorityFor } from "../policy.js";
import { requireHumanSession } from "../auth/index.js";
import { requireRole } from "../auth/authorize.js";

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

export { DELEGATION_DEPTH };
