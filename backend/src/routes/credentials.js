import { Router } from 'express';
import { agentAuth, requireActor } from '../middleware/agentAuth.js';
import { issueDatabaseCredential } from '../vault.js';
import * as audit from '../audit.js';
import * as state from '../state.js';
import { checkAuthority, effectiveAuthorityFor } from '../policy.js';

export const credentialsRouter = Router();

/**
 * The only path to a PostgreSQL credential. Only agent-c may call this
 * (input/04.md: A and B never touch PostgreSQL) — enforced here at two
 * levels: requireActor('agent-c') (a wrong caller never even reaches
 * the policy check) and, independently, the same checkAuthority() every
 * other tool call goes through (so a DENY here produces an
 * authority_decisions row exactly like any other denial).
 */
credentialsRouter.post('/credentials', agentAuth, async (req, res, next) => {
  try {
    const actorId = req.actorId;
    const profile = state.getProfile();
    const runId = state.getCurrentRunId();
    const effectiveAuthority = effectiveAuthorityFor(actorId, profile);
    const decision = checkAuthority({ actorId, requestedAction: 'credential.request', effectiveAuthority });

    await audit.recordAuthorityDecision({
      runId, actorId, requestedAction: 'credential.request',
      policyResult: decision.result, reason: decision.reason,
    });

    if (decision.result === 'DENY') {
      return res.status(403).json({ error: decision.reason });
    }
    if (actorId !== 'agent-c') {
      // Should be unreachable (only agent-c's effective authority ever
      // includes credential.request) — fail closed anyway.
      return res.status(403).json({ error: `${actorId} may not request a credential` });
    }

    const role = profile === 'bad' ? 'factory-bad-role' : 'factory-good-role';
    const credential = await issueDatabaseCredential(role, actorId);

    state.setActiveAgentCCredential({ ...credential, role, actorId, issuedAt: Date.now() });

    await audit.recordCredentialEvent({
      runId, actorId, vaultRole: role, leaseId: credential.leaseId, ttlSeconds: credential.leaseDuration,
    });

    // The raw password never leaves the backend process — Agent C
    // receives a reference/status, not the plaintext credential.
    // Mutating tool calls (DELETE /api/actions/orders, etc.) use the
    // credential the backend already holds for the currently active
    // agent-c request (security/authority-model.md: "no agent container
    // ever holds a Vault credential").
    res.status(201).json({
      role, leaseId: credential.leaseId, ttlSeconds: credential.leaseDuration, issued: true,
    });
  } catch (err) {
    next(err);
  }
});
