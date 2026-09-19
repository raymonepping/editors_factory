// src/services/revocation.js — Wave 2: Centralized, Idempotent Revocation Service
import {
  revokeLease,
  revokeTokenAccessor,
  renewLease,
  renewTokenByAccessor,
} from "../vault.js";
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
    await audit.markCredentialRevoked(leaseId, reason);
    console.log(
      `[revocation] lease ${leaseId} revoked successfully (reason: ${reason})`,
    );
    return res;
  } catch (err) {
    console.error(
      `[revocation] failed to revoke lease ${leaseId}:`,
      err.message,
    );
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
 * Wave 2.5: keeps a long-running task's database credential alive past
 * its original TTL, deterministically — never by agent choice (section
 * 11.5's own "owned by deterministic API code, never by an LLM-controlled
 * agent"). Started right after issuance (routes/credentials.js); stops
 * itself the moment the credential it was issued for is no longer the
 * active one (self-terminating guard) and is also always stopped by
 * state.clearActiveAgentCCredential()'s own single choke point, reached
 * by every terminal boundary (completion, denial, profile switch, reset)
 * that already existed before this wave.
 *
 * Renews at roughly half the original TTL — short enough to renew well
 * before expiry, and self-scaling: a short test TTL (this wave's own
 * "deliberately short test TTL" requirement) naturally produces a fast
 * renewal cadence with no separate config knob. A renewal failure clears
 * the active credential outright (fail closed for new mutating work —
 * requireActiveCredential in routes/actions.js then 409s immediately)
 * rather than leaving a lease believed-valid that Vault has actually
 * stopped honoring.
 */
export function startCredentialRenewal({ leaseId, ttlSeconds, tokenAccessor }) {
  const intervalMs = Math.max(5, Math.floor(ttlSeconds / 2)) * 1000;
  const timer = setInterval(async () => {
    const active = state.getActiveAgentCCredential();
    if (!active || active.leaseId !== leaseId) {
      clearInterval(timer);
      return;
    }
    try {
      // Renew the child token FIRST — a lease is revoked the moment the
      // token that created it expires, regardless of the lease's own
      // renewed TTL (vault.js's renewTokenByAccessor comment), so
      // renewing the lease alone would silently stop working the first
      // time this fires past the token's original TTL.
      if (tokenAccessor) {
        await renewTokenByAccessor(tokenAccessor, ttlSeconds);
      }
      await renewLease(leaseId, ttlSeconds);
      await audit.markCredentialRenewed(leaseId);
      console.log(`[renewal] lease ${leaseId} renewed (+${ttlSeconds}s)`);
    } catch (err) {
      console.error(
        `[renewal] failed to renew lease ${leaseId}, clearing active credential:`,
        err.message,
      );
      state.clearActiveAgentCCredential();
    }
  }, intervalMs);
  state.setRenewalTimer(timer);
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
