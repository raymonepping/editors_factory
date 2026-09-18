// src/services/revocation.js — Wave 2: Centralized, Idempotent Revocation Service
import { revokeLease, revokeTokenAccessor } from "../vault.js";
import * as audit from "../audit.js";
import * as state from "../state.js";

/**
 * Revokes an explicit lease by leaseId, updates evidence records,
 * and records structured audit telemetry.
 */
export async function revokeCredentialLease(leaseId, reason = "task_cleanup") {
  if (!leaseId) return { ok: true, status: "skipped" };
  try {
    const res = await revokeLease(leaseId);
    await audit.markCredentialRevoked(leaseId);
    console.log(`[revocation] lease ${leaseId} revoked successfully (reason: ${reason})`);
    return res;
  } catch (err) {
    console.error(`[revocation] failed to revoke lease ${leaseId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Revokes all resources associated with a task (its active lease and token accessor).
 */
export async function cleanupTaskCredentials(taskId, reason = "task_cleanup") {
  const activeCred = state.getActiveAgentCCredential();
  if (activeCred && (!activeCred.taskId || activeCred.taskId === taskId)) {
    if (activeCred.leaseId) {
      await revokeCredentialLease(activeCred.leaseId, reason);
    }
    if (activeCred.tokenAccessor) {
      await revokeTokenAccessor(activeCred.tokenAccessor).catch(() => {});
    }
    state.clearActiveAgentCCredential();
  }
}

/**
 * Cleans up all unrevoked leases and active credentials for a given run or active profile.
 */
export async function cleanupRunCredentials(runId, reason = "run_cleanup") {
  let count = 0;
  if (runId) {
    const unrevoked = await audit.getUnrevokedLeases(runId);
    for (const leaseId of unrevoked) {
      const res = await revokeCredentialLease(leaseId, reason);
      if (res.ok) count++;
    }
  }
  const activeCred = state.getActiveAgentCCredential();
  if (activeCred) {
    if (activeCred.leaseId) {
      await revokeCredentialLease(activeCred.leaseId, reason);
    }
    if (activeCred.tokenAccessor) {
      await revokeTokenAccessor(activeCred.tokenAccessor).catch(() => {});
    }
    state.clearActiveAgentCCredential();
  }
  return { cleaned: count };
}
