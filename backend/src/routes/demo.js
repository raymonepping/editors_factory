import { Router } from "express";
import { getPool } from "../db.js";
import { cleanupRunCredentials } from "../services/revocation.js";
import * as audit from "../audit.js";
import * as state from "../state.js";
import { requireHumanSession } from "../auth/index.js";
import { requireRole } from "../auth/authorize.js";

export const demoRouter = Router();

demoRouter.get("/demo/mode", (req, res) => {
  res.json({ profile: state.getProfile(), runId: state.getCurrentRunId() });
});

demoRouter.put(
  "/demo/mode",
  requireHumanSession,
  requireRole("switch_profile"),
  async (req, res, next) => {
    try {
      const { profile } = req.body || {};
      if (profile !== "bad" && profile !== "good") {
        return res
          .status(400)
          .json({ error: 'profile must be "bad" or "good"' });
      }
      const previous = await audit.getActiveRun();
      if (previous) {
        await cleanupRunCredentials(previous.run_id, "profile_switch");
        await audit.endRun(previous.run_id, "completed");
      }

      state.setProfile(profile);
      const runId = await audit.startRun(profile);
      state.setCurrentRunId(runId);
      state.clearTasks();
      state.clearActiveAgentCCredential();

      res.json({ profile, runId });
    } catch (err) {
      next(err);
    }
  },
);

demoRouter.post(
  "/demo/reset",
  requireHumanSession,
  requireRole("reset_demo"),
  async (req, res, next) => {
    try {
      const runId = state.getCurrentRunId();

      let revoked = 0;
      if (runId) {
        const cleanup = await cleanupRunCredentials(runId, "reset");
        revoked = cleanup.cleaned;
        await audit.endRun(runId, "reset");
      }

      // audit_events must be cleared before delegations — Prompt 01.02
      // Phase 1 added audit_events.delegation_id, a real FK to
      // delegations(delegation_id), so a referencing audit_events row
      // now blocks deleting its delegation first (found live: this
      // order used to be delegations-then-audit_events, which worked
      // only because nothing referenced delegations by id yet).
      await getPool().query(
        `DELETE FROM findings; DELETE FROM database_changes; DELETE FROM credential_events;
         DELETE FROM authority_decisions; DELETE FROM audit_events; DELETE FROM delegations;
         DELETE FROM demo_runs;`,
      );

      state.clearTasks();
      state.clearActiveAgentCCredential();

      const newRunId = await audit.startRun(state.getProfile());
      state.setCurrentRunId(newRunId);

      res.json({
        reset: true,
        revokedLeases: revoked,
        runId: newRunId,
        profile: state.getProfile(),
        note: "Evidence tables and Vault leases reset. Product/order data reset separately via `make infra-seed` (see Makefile's `reset` target) — factory-backend-role is intentionally not privileged to touch it.",
      });
    } catch (err) {
      next(err);
    }
  },
);
