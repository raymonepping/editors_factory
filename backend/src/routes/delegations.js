import { Router } from "express";
import { randomUUID } from "node:crypto";
import { agentAuth } from "../middleware/agentAuth.js";
import * as audit from "../audit.js";
import * as state from "../state.js";
import { effectiveAuthorityFor, intersectEnvelope } from "../policy.js";
import { DELEGATION_DEPTH } from "./tasks.js";

export const delegationsRouter = Router();

const ALLOWED_DELEGATIONS = { "agent-a": "agent-b", "agent-b": "agent-c" };

/**
 * Agent-to-agent delegation. Server-enforced, not merely documented: an
 * agent cannot delegate authority it does not itself hold — the
 * envelope is intersected with the delegating agent's OWN effective
 * authority, never allowed to grow across the hop
 * (prompts/backend/01_01_orchestrator_api.md).
 */
delegationsRouter.post("/delegations", agentAuth, async (req, res, next) => {
  try {
    const fromActor = req.actorId;
    const toActor = ALLOWED_DELEGATIONS[fromActor];
    if (!toActor) {
      return res.status(403).json({ error: `${fromActor} may not delegate` });
    }

    const { goal, authorityEnvelope = [] } = req.body || {};
    if (!goal) return res.status(400).json({ error: "goal is required" });

    const runId = state.getCurrentRunId();
    const profile = state.getProfile();

    // Each agent's own fixed role ceiling (BASE_AUTHORITY /
    // AGENT_C_AUTHORITY in policy.js) IS the enforced security boundary
    // — "an agent cannot delegate authority it does not itself hold" is
    // real here, but it is enforced by construction (the recipient's
    // ceiling is hand-authored to never exceed what its role should
    // ever have), not by mechanically intersecting against the
    // DELEGATING agent's own narrower, unrelated operational toolset.
    //
    // Found live building this route: an earlier version also
    // intersected against fromActor's own effective authority. That
    // broke two things it should not have — agent-b's ceiling includes
    // restart-order-service, which agent-a itself does not have, so
    // agent-b lost it after an agent-a→agent-b hop; and in GOOD profile,
    // agent-c lost orders.update_status and credential.request (neither
    // of which agent-b itself directly holds) even though both are
    // legitimately part of agent-c's own good-role ceiling and are
    // required for GOOD mode's actual fallback behavior (Agent C
    // quarantining orders after its DELETE attempt is denied —
    // prompts/agents/04_01_agent_c_remediation.md). A delegator does not
    // need to personally hold a capability to legitimately delegate it;
    // what matters is that the RECIPIENT's own ceiling never exceeds its
    // intended role, which is exactly what toActorCeiling already
    // guarantees below.
    //
    // BAD profile, agent-c only: the fixed, over-broad factory-bad-role
    // binding — NOT derived from the requested envelope at all. This
    // fixed binding being wrong regardless of what was delegated IS the
    // demonstrated flaw (security/authority-model.md).
    const toActorCeiling = effectiveAuthorityFor(toActor, profile);
    const effectiveAuthority =
      toActor === "agent-c" && profile === "bad"
        ? toActorCeiling
        : intersectEnvelope(authorityEnvelope, toActorCeiling);

    const traceId = randomUUID();
    const taskId = randomUUID();
    const depth = DELEGATION_DEPTH[toActor];

    state.createTask({
      taskId,
      actorId: toActor,
      delegatedBy: fromActor,
      delegationDepth: depth,
      effectiveAuthority,
      traceId,
      parentTaskId: null,
      goal,
    });

    const delegation = await audit.recordDelegation({
      runId,
      fromActor,
      toActor,
      taskId,
      authorityEnvelope,
    });

    await audit.recordAuditEvent({
      runId,
      traceId,
      taskId,
      actorId: toActor,
      delegatedBy: fromActor,
      delegationDepth: depth,
      requestedAuthority: authorityEnvelope.join(","),
      effectiveAuthority: effectiveAuthority.join(","),
      action: "task.delegated",
      result: "ALLOW",
      target: toActor,
    });

    res.status(201).json({
      taskId,
      traceId,
      actorId: toActor,
      delegatedBy: fromActor,
      delegationDepth: depth,
      effectiveAuthority,
      goal,
      delegationId: delegation.delegation_id,
    });
  } catch (err) {
    next(err);
  }
});
