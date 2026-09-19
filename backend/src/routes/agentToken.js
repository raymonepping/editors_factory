// routes/agentToken.js — Wave 6 bootstrap endpoint (ADR
// docs/validation/ADR_001_agent_api_identity.md). The ONLY route that
// still accepts a static per-agent bearer token (via the unmodified
// middleware/agentAuth.js) — its output, a short-lived task-bound JWT,
// is what every other agent-facing route now requires instead.

import { Router } from "express";
import { agentAuth } from "../middleware/agentAuth.js";
import { signAgentToken } from "../auth/agentJwt.js";
import { config } from "../config.js";
import * as state from "../state.js";

export const agentTokenRouter = Router();

agentTokenRouter.post("/agents/token", agentAuth, (req, res) => {
  const actorId = req.actorId;
  const runId = state.getCurrentRunId();

  // agent-d is never part of the delegation chain and so never has a
  // task (agents/identities/agent-d.js's own header comment) — its token
  // is bound to the current run instead of a task.
  if (actorId === "agent-d") {
    const token = signAgentToken({
      actorId,
      runId,
      taskId: null,
      ttlSeconds: config.auth.agentJwtTtlSeconds,
    });
    return res.json({ token, ttlSeconds: config.auth.agentJwtTtlSeconds });
  }

  const { taskId } = state.getCausalContext(actorId);
  if (!taskId) {
    // Verifies the expected workload/task context before issuing
    // anything (section 15 of the improvement prompt) — a bootstrap
    // credential alone is never enough.
    return res
      .status(400)
      .json({ error: `${actorId} has no active task to bind a token to` });
  }

  const token = signAgentToken({
    actorId,
    runId,
    taskId,
    ttlSeconds: config.auth.agentJwtTtlSeconds,
  });
  res.json({ token, ttlSeconds: config.auth.agentJwtTtlSeconds });
});
