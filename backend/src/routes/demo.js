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
      //
      // Found live (01_03 validation, ~1/5 runs): factory-agent-d is a
      // real, continuously-running container reacting to the live SSE
      // stream independently of this request. Under the default READ
      // COMMITTED isolation, each statement in this batch takes its own
      // fresh snapshot — so if agent-d's create_finding call inserts an
      // audit_events row for this exact run between this batch's own
      // `DELETE FROM audit_events` and its later `DELETE FROM
      // demo_runs`, that later statement sees a row that did not exist
      // when the batch started and fails the FK check, aborting the
      // whole reset. REPEATABLE READ fixes this at the root rather than
      // retrying around it: the transaction takes ONE snapshot at its
      // first statement and every later statement in it sees only that
      // snapshot, so a concurrent commit from agent-d's own separate
      // connection becomes invisible to the rest of this transaction,
      // exactly as if it happened after reset finished. (Postgres will
      // raise 40001 "could not serialize access" instead of an FK
      // violation if a genuine write conflict occurs under REPEATABLE
      // READ — none of these statements can conflict with agent-d's own
      // insert-only writes to different rows, so that path is not
      // expected to fire here.)
      const client = await getPool().connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        await client.query(
          `DELETE FROM findings; DELETE FROM database_changes; DELETE FROM credential_events;
           DELETE FROM authority_decisions; DELETE FROM audit_events; DELETE FROM delegations;
           DELETE FROM demo_runs;`,
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

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
