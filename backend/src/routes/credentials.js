import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireActor } from "../middleware/agentAuth.js";
import { agentJwtAuth } from "../middleware/agentJwtAuth.js";
import {
  issueDatabaseCredential,
  issueSupervisedDatabaseCredential,
  authorizeControlGroupRequest,
  unwrapCredential,
} from "../vault.js";
import { getPool } from "../db.js";
import * as audit from "../audit.js";
import * as state from "../state.js";
import { checkAuthority, effectiveAuthorityFor } from "../policy.js";
import { startCredentialRenewal } from "../services/revocation.js";
import { requireHumanSession } from "../auth/index.js";
import { requireRole } from "../auth/authorize.js";

export const credentialsRouter = Router();

/**
 * prompts/improvements/01_08_agentic_iam_inspired_hardening.md Phase 4:
 * the deterministic anomaly trigger for the supervised path. A run
 * only ever needs one credential under this demo's own design (one
 * task, one remediation) — credential_events already excludes renewals
 * (audit.js's own recordCredentialEvent vs. its renewal UPDATE path),
 * so a second real request for the same run is a genuine, checkable
 * anomaly, not a guess about intent. Deliberately not tied to any new
 * Agent D logic — this is exactly the kind of deterministic condition
 * its own Tier-1 classify() already favors, checked here because it's
 * the credential-issuance code path that needs to branch on it, not
 * because Agent D itself needs to know about it.
 */
async function hasPriorCredentialInRun(runId) {
  const { rows } = await getPool().query(
    "SELECT count(*)::int AS n FROM credential_events WHERE run_id = $1",
    [runId],
  );
  return rows[0].n > 0;
}

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

    if (await hasPriorCredentialInRun(runId)) {
      // Route through the Control-Group-gated supervised path instead
      // of issuing directly — Vault returns a wrap_info, not a
      // credential, until a human authorizes it (POST
      // /credentials/pending/:id/authorize below).
      const wrap = await issueSupervisedDatabaseCredential(role, actorId, taskId);
      const approvalId = randomUUID();
      state.createPendingApproval(approvalId, {
        wrapAccessor: wrap.wrapAccessor,
        wrapToken: wrap.wrapToken,
        role,
        actorId,
        taskId,
        runId,
        traceId,
        requestedAt: Date.now(),
      });
      // Not one of agent-d's own numbered D-00x classifications (those
      // live entirely in agents/identities/agent-d.js's own classify())
      // — this is the backend's own anomaly trigger, recorded as a
      // finding for the same reason every other consequential event in
      // this system is: so it shows up in the evidence trail, not
      // because Discovery itself detected it.
      await audit.recordFinding({
        runId,
        actorId: "agent-d",
        severity: "high",
        title: `Second credential request in one run — routed to human review (${actorId})`,
        detail: `${actorId} requested a database credential a second time in run ${runId} (approval_id=${approvalId}). Vault withheld it pending authorization.`,
      });
      return res.status(202).json({
        status: "pending_approval",
        approvalId,
        message:
          "A second credential request in this run requires human authorization before it is issued.",
      });
    }

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

/**
 * prompts/improvements/01_08_agentic_iam_inspired_hardening.md Phase 4.
 * Read-only, so a viewer can see a pending request exists (matches the
 * dashboard's own factory-viewer read scope) even though only an
 * operator may authorize one.
 */
credentialsRouter.get(
  "/credentials/pending",
  requireHumanSession,
  requireRole("read_dashboard"),
  (req, res) => {
    // Never return the wrap token itself to the browser — only what a
    // human needs to decide whether to authorize.
    const pending = state.listPendingApprovals().map((p) => ({
      approvalId: p.approvalId,
      role: p.role,
      actorId: p.actorId,
      taskId: p.taskId,
      runId: p.runId,
      requestedAt: p.requestedAt,
    }));
    res.json({ pending });
  },
);

/**
 * The only route that actually authorizes a Control-Group-gated
 * request. Three real Vault calls happen here, not a local flag flip:
 * authenticate as the control-group-authorizer identity, submit the
 * approval, then unwrap the original wrapping token to get the real
 * credential — the same three steps proven live against this cluster
 * before this route was written.
 */
credentialsRouter.post(
  "/credentials/pending/:approvalId/authorize",
  requireHumanSession,
  requireRole("authorize_credential"),
  async (req, res, next) => {
    try {
      const { approvalId } = req.params;
      const pending = state.getPendingApproval(approvalId);
      if (!pending) {
        return res.status(404).json({ error: "no such pending approval" });
      }

      const { approved } = await authorizeControlGroupRequest(
        pending.wrapAccessor,
      );
      if (!approved) {
        return res
          .status(409)
          .json({ error: "Vault did not approve the control group request" });
      }

      const credential = await unwrapCredential(pending.wrapToken);

      state.setActiveAgentCCredential({
        ...credential,
        role: pending.role,
        actorId: pending.actorId,
        taskId: pending.taskId,
        issuedAt: Date.now(),
      });

      await audit.recordCredentialEvent({
        runId: pending.runId,
        actorId: pending.actorId,
        vaultRole: pending.role,
        leaseId: credential.leaseId,
        ttlSeconds: credential.leaseDuration,
        traceId: pending.traceId,
        taskId: pending.taskId,
      });

      startCredentialRenewal({
        leaseId: credential.leaseId,
        ttlSeconds: credential.leaseDuration,
      });

      state.clearPendingApproval(approvalId);

      res.json({
        authorized: true,
        role: pending.role,
        leaseId: credential.leaseId,
        ttlSeconds: credential.leaseDuration,
      });
    } catch (err) {
      next(err);
    }
  },
);
