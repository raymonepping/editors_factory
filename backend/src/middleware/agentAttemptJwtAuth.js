// middleware/agentAttemptJwtAuth.js — v2 (prompts/v2/02_02): guards the
// worker-facing DAG attempt endpoints (heartbeat/complete/fail). Requires
// the short-lived attempt JWT minted by dag-engine.js's claimNode(), not
// the agent's own static bearer token or its ordinary task-bound JWT —
// so a worker can only act on the exact attempt it was actually handed,
// even if it also happens to hold other valid credentials.
//
// Mirrors agentJwtAuth.js's own structural-revocation pattern: liveness
// is checked against dag_node_attempts/dag_nodes directly (the attempt's
// own fencing token must still be current), not a separate revoked-jti
// store.

import { verifyAgentToken } from "../auth/agentJwt.js";
import { getPool } from "../db.js";

export async function agentAttemptJwtAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    return res
      .status(401)
      .json({ error: "Missing Authorization: Bearer <attempt-jwt>" });
  }

  let claims;
  try {
    claims = verifyAgentToken(match[1]);
  } catch (err) {
    return res
      .status(401)
      .json({ error: `Invalid attempt token: ${err.message}` });
  }

  if (!claims.attempt_id || !claims.node_id || claims.fencing_token == null) {
    return res.status(401).json({
      error:
        "Token is not attempt-bound — expected an attempt JWT from POST /api/dag/tasks/claim, not a task JWT",
    });
  }

  try {
    const { rows } = await getPool().query(
      `SELECT n.current_fencing_token, n.status AS node_status,
              a.execution_status
         FROM dag_nodes n
         JOIN dag_node_attempts a ON a.node_id = n.node_id
        WHERE a.attempt_id = $1`,
      [claims.attempt_id],
    );
    const attempt = rows[0];
    if (
      !attempt ||
      Number(attempt.current_fencing_token) !== Number(claims.fencing_token)
    ) {
      return res.status(409).json({
        error: "Stale fencing token — this attempt is no longer current",
      });
    }
    req.actorId = claims.sub;
    req.runId = claims.run_id;
    req.attemptId = claims.attempt_id;
    req.nodeId = claims.node_id;
    req.fencingToken = claims.fencing_token;
    next();
  } catch (err) {
    next(err);
  }
}
