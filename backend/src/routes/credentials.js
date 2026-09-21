import { Router } from "express";
import { requireActor } from "../middleware/agentAuth.js";
import { agentJwtAuth } from "../middleware/agentJwtAuth.js";
import { issueDatabaseCredential } from "../vault.js";
import * as audit from "../audit.js";
import * as state from "../state.js";
import { checkAuthority, effectiveAuthorityFor } from "../policy.js";
import { startCredentialRenewal } from "../services/revocation.js";

export const credentialsRouter = Router();

/**
 * The only path to a PostgreSQL credential. Only agent-c may call this
 * (input/04.md: A and B never touch PostgreSQL) — enforced here at two
 * levels: requireActor('agent-c') (a wrong caller never even reaches
 * the policy check) and, independently, the same checkAuthority() every
 * other tool call goes through (so a DENY here produces an
 * authority_decisions row exactly like any other denial).
 */
credentialsRouter.post("/credentials", agentJwtAuth, async (req, res, next) => {
  try {
    const actorId = req.actorId;
    const profile = state.getProfile();
    const runId = state.getCurrentRunId();
    const effectiveAuthority = effectiveAuthorityFor(actorId, profile);
    const decision = checkAuthority({
      actorId,
      requestedAction: "credential.request",
      effectiveAuthority,
    });
    const { taskId, traceId } = state.getCausalContext(actorId);

    await audit.recordAuthorityDecision({
      runId,
      actorId,
      requestedAction: "credential.request",
      policyResult: decision.result,
      reason: decision.reason,
      traceId,
      taskId,
    });

    if (decision.result === "DENY") {
      return res.status(403).json({ error: decision.reason });
    }
    if (actorId !== "agent-c") {
      // Should be unreachable (only agent-c's effective authority ever
      // includes credential.request) — fail closed anyway.
      return res
        .status(403)
        .json({ error: `${actorId} may not request a credential` });
    }

    const role = profile === "bad" ? "factory-bad-role" : "factory-good-role";
    const credential = await issueDatabaseCredential(role, actorId, taskId);

    // taskId makes cleanupTaskCredentials' own ownership check real
    // (services/revocation.js) — previously never set, so that check's
    // "no taskId on record" branch always fired regardless of which
    // task asked, which happened to be harmless under this demo's
    // single-flow-at-a-time design but meant task-scoped revocation
    // (Prompt 01.02 Phase 2) could not actually distinguish "this task's
    // own credential" from "whatever credential happens to be active."
    state.setActiveAgentCCredential({
      ...credential,
      role,
      actorId,
      taskId,
      tokenAccessor: credential.tokenAccessor,
      issuedAt: Date.now(),
    });

    await audit.recordCredentialEvent({
      runId,
      actorId,
      vaultRole: role,
      leaseId: credential.leaseId,
      ttlSeconds: credential.leaseDuration,
      traceId,
      taskId,
    });

    // Wave 2.5: keep the lease alive if the task outlives its original
    // TTL — never assumes the task will finish in time (see
    // services/revocation.js's own comment on why this specific role's
    // TTL is a real, not hypothetical, risk).
    startCredentialRenewal({
      leaseId: credential.leaseId,
      ttlSeconds: credential.leaseDuration,
      tokenAccessor: credential.tokenAccessor,
    });

    // The raw password never leaves the backend process — Agent C
    // receives a reference/status, not the plaintext credential.
    // Mutating tool calls (DELETE /api/actions/orders, etc.) use the
    // credential the backend already holds for the currently active
    // agent-c request (security/authority-model.md: "no agent container
    // ever holds a Vault credential").
    res.status(201).json({
      role,
      leaseId: credential.leaseId,
      ttlSeconds: credential.leaseDuration,
      issued: true,
    });
  } catch (err) {
    next(err);
  }
});
