import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireActor } from "../middleware/agentAuth.js";
import { agentJwtAuth } from "../middleware/agentJwtAuth.js";
import {
  issueDatabaseCredential,
  issueSupervisedDatabaseCredential,
  issueV3OAuthCredential,
  authorizeControlGroupRequest,
  unwrapCredential,
} from "../vault.js";
import { getPool } from "../db.js";
import { publishEvent } from "../events.js";
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
 * v2 (prompts/v2/02_03): resolves the current attempt's dagContext
 * (for mintAgentTaggedChildToken) whenever `req` carries a genuinely
 * active attempt — an authenticated attempt JWT (agentJwtAuth's own
 * fencing check already ran) bound to an active dag_node_attempts row on
 * a run whose workflow_mode is actually "recoverable_dag". Returns null
 * for v1 traffic (no req.attemptId at all) or anything that doesn't
 * check out. Deliberately covers attempt 1 as well as retries — v2 has
 * no task_id concept, so attempt 1 needs this exactly as much as a
 * retry does (see the Sentinel policy note below on why factory_task
 * cannot be the universal requirement across both modes).
 */
async function getAttemptDagContext(req, runId) {
  if (!req.attemptId) return null;
  const { rows } = await getPool().query(
    `SELECT a.attempt_number, a.execution_status, a.authority_status,
            n.node_key, dr.workflow_mode
       FROM dag_node_attempts a
       JOIN dag_nodes n ON n.node_id = a.node_id
       JOIN demo_runs dr ON dr.run_id = n.run_id
      WHERE a.attempt_id = $1 AND n.node_id = $2 AND n.run_id = $3`,
    [req.attemptId, req.nodeId, runId],
  );
  const row = rows[0];
  if (
    !row ||
    row.workflow_mode !== "recoverable_dag" ||
    row.execution_status !== "running" ||
    row.authority_status !== "active"
  ) {
    return null;
  }
  return {
    workflowMode: "recoverable_dag",
    runId,
    nodeId: req.nodeId,
    nodeKey: row.node_key,
    attemptId: req.attemptId,
    attemptNumber: row.attempt_number,
    profile: state.getProfile(),
  };
}

/**
 * Issues a credential for the current attempt (any attempt_number) and
 * persists it onto the attempt's own dag_node_attempts row — not just
 * the single in-memory "active credential" slot — so revokeAttempt
 * (dag-engine.js's completeAttempt/failAttempt, the watchdog) can find
 * and revoke exactly this attempt's own lease/token.
 */
async function issueAndRecordAttemptCredential({
  role,
  actorId,
  runId,
  traceId,
  dagContext,
}) {
  const credential = await issueDatabaseCredential(
    role,
    actorId,
    null,
    dagContext,
  );
  const { rows: attemptRows } = await getPool().query(
    `UPDATE dag_node_attempts SET vault_lease_id = $2, vault_token_accessor = $3 WHERE attempt_id = $1 RETURNING *`,
    [dagContext.attemptId, credential.leaseId, credential.tokenAccessor],
  );
  // Found live building 02_05: with no publish here, Discovery
  // (agent-d) had no way to ever observe which lease_id was issued to
  // which attempt/node — credential_events (below) carries a lease_id
  // but no node_id/attempt_id at all, so it alone can't support the
  // lease-reuse-across-attempts check 02_05 asks classify() to make.
  if (attemptRows[0]) publishEvent("dag_node_attempts", attemptRows[0]);
  state.setActiveAgentCCredential({
    ...credential,
    role,
    actorId,
    taskId: null,
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
    taskId: null,
  });
  startCredentialRenewal({
    leaseId: credential.leaseId,
    ttlSeconds: credential.leaseDuration,
    tokenAccessor: credential.tokenAccessor,
  });
  return credential;
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

    // prompts/v3/03_01: a completely separate branch, on purpose — v3's
    // own boundary is Vault's native RAR/ACL intersection
    // (v3-agent-baseline, database-v3/creds/v3-root-role), not
    // require-agent-c-for-db-creds, so none of the DAG-context,
    // Sentinel-metadata, or supervised-approval machinery below applies
    // to it. Returns before `role` is even computed — v3 only ever
    // issues its own fixed, read-only role, not BAD/GOOD.
    if (state.getAuthorityMechanism() === "vault_native_oauth") {
      // prompts/v3/03_02: the run's own initiator_subject_id (set at
      // PUT /demo/mode or POST /demo/reset time from a real human
      // OIDC session — null for CLI-triggered runs), not the current
      // caller (agent-c itself, authenticated via its own task-bound
      // JWT, never a human session).
      const activeRun = await audit.getActiveRun();
      const credential = await issueV3OAuthCredential(
        activeRun?.initiator_subject_id ?? null,
      );
      await audit.recordCredentialEvent({
        runId,
        actorId,
        vaultRole: "v3-root-role",
        leaseId: credential.leaseId,
        ttlSeconds: credential.leaseDuration,
        traceId,
        taskId,
      });
      state.setActiveAgentCCredential({
        ...credential,
        role: "v3-root-role",
        actorId,
        taskId,
        tokenAccessor: null,
        issuedAt: Date.now(),
      });
      return res.status(201).json({
        role: "v3-root-role",
        leaseId: credential.leaseId,
        ttlSeconds: credential.leaseDuration,
        issued: true,
        authorityMechanism: "vault_native_oauth",
      });
    }

    const role = profile === "bad" ? "factory-bad-role" : "factory-good-role";

    const dagContext = await getAttemptDagContext(req, runId);
    if (dagContext && Number(dagContext.attemptNumber) > 1) {
      // Authorized v2 retry — bypass hasPriorCredentialInRun's run-level
      // anomaly heuristic entirely and issue directly, same as any other
      // legitimate credential request. "Retry the work, not the
      // authority": this is a fresh credential for a fresh attempt, not
      // a reuse of Attempt 1's.
      const credential = await issueAndRecordAttemptCredential({
        role,
        actorId,
        runId,
        traceId,
        dagContext,
      });
      return res.status(201).json({
        role,
        leaseId: credential.leaseId,
        ttlSeconds: credential.leaseDuration,
        issued: true,
        attemptNumber: dagContext.attemptNumber,
      });
    }

    if (dagContext) {
      // v2 attempt 1 — not a retry, so no anomaly to bypass (this run
      // has no prior credential yet either way), but still needs its
      // dagContext attached so Sentinel sees factory_workflow_mode=
      // "recoverable_dag" + the attempt fields, and needs the same
      // per-attempt lease bookkeeping every v2 credential does.
      const credential = await issueAndRecordAttemptCredential({
        role,
        actorId,
        runId,
        traceId,
        dagContext,
      });
      return res.status(201).json({
        role,
        leaseId: credential.leaseId,
        ttlSeconds: credential.leaseDuration,
        issued: true,
        attemptNumber: dagContext.attemptNumber,
      });
    }

    if (await hasPriorCredentialInRun(runId)) {
      // Route through the Control-Group-gated supervised path instead
      // of issuing directly — Vault returns a wrap_info, not a
      // credential, until a human authorizes it (POST
      // /credentials/pending/:id/authorize below).
      const wrap = await issueSupervisedDatabaseCredential(
        role,
        actorId,
        taskId,
      );
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
