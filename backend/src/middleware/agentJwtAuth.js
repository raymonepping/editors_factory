// middleware/agentJwtAuth.js — Wave 6: replaces middleware/agentAuth.js
// on every route an agent calls to actually do work (tool calls,
// delegation, credential requests, task lookup). agentAuth.js itself is
// NOT deleted — it still guards the one route that legitimately still
// accepts a static per-agent bearer token, routes/agentToken.js's
// bootstrap endpoint (ADR docs/validation/ADR_001_agent_api_identity.md).
//
// Sets req.actorId exactly like agentAuth.js did, so every route handler
// downstream (which already reads req.actorId) needed no changes.

import { verifyAgentToken } from "../auth/agentJwt.js";
import * as state from "../state.js";

export function agentJwtAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    return res
      .status(401)
      .json({ error: "Missing Authorization: Bearer <agent-jwt>" });
  }

  let claims;
  try {
    claims = verifyAgentToken(match[1]);
  } catch (err) {
    return res
      .status(401)
      .json({ error: `Invalid agent token: ${err.message}` });
  }

  // Structural revocation, not a separate revoked-jti store: a JWT bound
  // to a task is only honored while that exact task is still the actor's
  // own active task in state.js — the same lifecycle Wave 2/2.5's
  // revocation already clears at every terminal boundary (completion,
  // denial, profile switch, reset). Agent D has no task (never part of
  // the delegation chain — agents/identities/agent-d.js's own header
  // comment) so its token is bound to the run instead, revoked the
  // moment a new run starts.
  if (claims.task_id) {
    const task = state.getTask(claims.task_id);
    if (!task || task.actorId !== claims.sub) {
      return res
        .status(401)
        .json({ error: "Agent token's task is no longer active" });
    }
  } else if (claims.run_id !== state.getCurrentRunId()) {
    return res
      .status(401)
      .json({ error: "Agent token's run is no longer active" });
  }

  req.actorId = claims.sub;
  req.taskId = claims.task_id;
  req.runId = claims.run_id;
  next();
}
