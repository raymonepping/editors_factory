// src/middleware/agentAuth.js — resolves the calling agent's identity
// from its per-agent bearer token. Every agent has its own token
// (config.js); never a single shared API key (input/05.md).

import { config } from "../config.js";

export function agentAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    return res
      .status(401)
      .json({ error: "Missing Authorization: Bearer <agent-token>" });
  }
  const token = match[1];
  const actorId = Object.entries(config.agentTokens).find(
    ([, t]) => t === token,
  )?.[0];
  if (!actorId) {
    return res.status(401).json({ error: "Unknown agent token" });
  }
  req.actorId = actorId;
  next();
}

/** Restricts a route to one or more specific agent identities. Applied
 * AFTER agentAuth. */
export function requireActor(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.actorId)) {
      return res
        .status(403)
        .json({
          error: `${req.actorId} is not permitted to call this endpoint`,
        });
    }
    next();
  };
}
