import { Router } from 'express';
import { getPool } from '../db.js';
import { revokeLease } from '../vault.js';
import * as audit from '../audit.js';
import * as state from '../state.js';

export const demoRouter = Router();

demoRouter.get('/demo/mode', (req, res) => {
  res.json({ profile: state.getProfile(), runId: state.getCurrentRunId() });
});

demoRouter.put('/demo/mode', async (req, res, next) => {
  try {
    const { profile } = req.body || {};
    if (profile !== 'bad' && profile !== 'good') {
      return res.status(400).json({ error: 'profile must be "bad" or "good"' });
    }
    // Ending the previous run (if any) before starting a new one keeps
    // audit_events/etc. cleanly scoped to one run_id per profile switch.
    const previous = await audit.getActiveRun();
    if (previous) await audit.endRun(previous.run_id, 'completed');

    state.setProfile(profile);
    const runId = await audit.startRun(profile);
    state.setCurrentRunId(runId);
    state.clearTasks();
    state.clearActiveAgentCCredential();

    res.json({ profile, runId });
  } catch (err) {
    next(err);
  }
});

/**
 * Resets everything the backend itself is privileged to touch: Vault
 * leases and the evidence tables (audit_events, delegations,
 * authority_decisions, credential_events, database_changes, findings,
 * demo_runs — all of it, a full reset, not just the current run's
 * slice) plus in-memory task/credential state.
 *
 * Deliberately does NOT re-seed products/orders/inventory/suppliers/
 * order_items here. factory-backend-role is intentionally scoped away
 * from mutating those tables at all (terraform/vault-database/database.tf
 * — "real product/order mutation only ever happens via the credential
 * Agent C was issued", the demo's central mechanic). Found live: an
 * earlier version of this handler ran scripts/seed.sql's full TRUNCATE
 * list directly through the backend's own pool and failed with
 * "permission denied for table findings" (TRUNCATE requires a separate
 * privilege PostgreSQL does not fold into INSERT/UPDATE/DELETE grants)
 * — and even if TRUNCATE had been granted, using the backend's own
 * credential to wipe products/orders would have quietly reintroduced
 * exactly the privilege boundary this project's whole architecture
 * argues against. The Makefile's `make reset` target
 * (prompts/base_project/01_01_factory_stack.md) is the actual full
 * reset: it calls this endpoint AND runs `make infra-seed` (the
 * superuser-based re-seed) as two separate, correctly-scoped steps.
 */
demoRouter.post('/demo/reset', async (req, res, next) => {
  try {
    const runId = state.getCurrentRunId();

    // 1. Revoke every outstanding factory-* lease issued during this run
    //    (prompts/backend/01_01_orchestrator_api.md, security/authority-model.md's
    //    Revocation section) — explicit revoke, not just waiting for TTL.
    let revoked = 0;
    if (runId) {
      const leaseIds = await audit.getUnrevokedLeases(runId);
      for (const leaseId of leaseIds) {
        try {
          await revokeLease(leaseId);
          await audit.markCredentialRevoked(leaseId);
          revoked += 1;
        } catch (err) {
          console.error(`[reset] failed to revoke lease ${leaseId}:`, err.message);
        }
      }
      await audit.endRun(runId, 'reset');
    }

    // 2. Clear the evidence tables entirely (DELETE, a privilege
    //    factory-backend-role already has — not TRUNCATE).
    await getPool().query(
      `DELETE FROM findings; DELETE FROM database_changes; DELETE FROM credential_events;
       DELETE FROM authority_decisions; DELETE FROM delegations; DELETE FROM audit_events;
       DELETE FROM demo_runs;`
    );

    // 3. Clear in-memory task/delegation/credential state.
    state.clearTasks();
    state.clearActiveAgentCCredential();

    // 4. Start a fresh run at the current profile.
    const newRunId = await audit.startRun(state.getProfile());
    state.setCurrentRunId(newRunId);

    res.json({
      reset: true, revokedLeases: revoked, runId: newRunId, profile: state.getProfile(),
      note: 'Evidence tables and Vault leases reset. Product/order data reset separately via `make infra-seed` (see Makefile\'s `reset` target) — factory-backend-role is intentionally not privileged to touch it.',
    });
  } catch (err) {
    next(err);
  }
});
