import { Router } from "express";
import { randomUUID } from "node:crypto";
import * as audit from "../audit.js";
import * as state from "../state.js";
import { effectiveAuthorityFor } from "../policy.js";

export const tasksRouter = Router();

// Fixed per the delegation chain (security/authority-model.md) — this
// project's chain is a fixed 4-agent shape, not a general arbitrary-depth
// system, so depth is looked up by identity rather than propagated
// dynamically task-by-task.
const DELEGATION_DEPTH = {
  "agent-a": 1,
  "agent-b": 2,
  "agent-c": 3,
  "agent-d": 0,
};

/**
 * The entry point for the human/frontend trigger — creates the first
 * task, for agent-a, at delegation depth 1. Not agent-authenticated:
 * this is the human boundary (depth 0), not an agent-to-agent hop. Agent-
 * to-agent delegation goes through POST /api/delegations instead, which
 * IS agent-authenticated.
 */
tasksRouter.post("/agents/:agentId/tasks", async (req, res, next) => {
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

    state.createTask({
      taskId,
      actorId: "agent-a",
      delegatedBy: "human",
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
      delegatedBy: "human",
      delegationDepth: 1,
      requestedAuthority: null,
      effectiveAuthority: effectiveAuthority.join(","),
      action: "task.created",
      result: "ALLOW",
      target: "agent-a",
    });

    res
      .status(201)
      .json({
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
});

tasksRouter.get("/tasks/:taskId", (req, res) => {
  const task = state.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: "not found" });
  res.json(task);
});

export { DELEGATION_DEPTH };
