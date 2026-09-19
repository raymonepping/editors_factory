import { Router } from "express";
import { addClient, removeClient } from "../events.js";
import { getPool } from "../db.js";
import * as state from "../state.js";

export const eventsRouter = Router();

function streamHandler(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");
  addClient(res);
  req.on("close", () => removeClient(res));
}

// Both paths supported per prompts/backend/01_01_orchestrator_api.md.
eventsRouter.get("/events", streamHandler);
eventsRouter.get("/events/stream", streamHandler);

// Historical (non-SSE) reads — added live executing
// prompts/agents/05_01_agent_d_detection.md: SSE only ever delivers
// events from the moment a client connects, so there was no way to ask
// "show me what already happened for this run" (needed by 05_01's own
// validation, and by the future frontend dashboard reloading mid-demo).
// Both are public/unauthenticated, matching the existing SSE
// endpoints above — this is demo evidence/telemetry for human and
// dashboard consumption, not an agent tool call gated by agentAuth
// (backend/src/routes/actions.js's own pattern is for the latter).
// Unions every evidence table into one timeline, each row tagged with a
// `type` matching the live SSE channel name it would have arrived on
// (src/events.js's own publishEvent(type, ...) calls) — so the frontend's
// timeline can render page-load backfill and live SSE rows through the
// exact same code path, not two different shapes.
eventsRouter.get("/events/history", async (req, res, next) => {
  try {
    const runId = req.query.run_id || state.getCurrentRunId();
    if (!runId) return res.json([]);
    // credential_events is a real mutable row (issued, maybe renewed,
    // maybe revoked), not an append-only log the way every other
    // evidence table is — a plain SELECT here returns each credential
    // exactly once, at its issued_at position, showing whatever its
    // CURRENT state happens to be. Found live (Prompt 01.02 Phase 3,
    // narrative view): for an already-revoked credential, that put the
    // single row at its issuance timestamp but with revoked content —
    // the frontend rendered a "revoked" step floating before mutations
    // that actually preceded the real revocation, with no "issued" step
    // at all. Projected here as up to two rows instead, matching what
    // live SSE already sends as two separate messages (src/audit.js's
    // recordCredentialEvent then markCredentialRevoked, each its own
    // publishEvent call): an "issued" snapshot at issued_at with the
    // revoked fields nulled, and — only if actually revoked — a second,
    // full snapshot at revoked_at.
    const { rows } = await getPool().query(
      `SELECT 'audit_events' AS type, "timestamp" AS ts, to_jsonb(audit_events) AS payload
         FROM audit_events WHERE run_id = $1
       UNION ALL
       SELECT 'authority_decisions', "timestamp", to_jsonb(authority_decisions)
         FROM authority_decisions WHERE run_id = $1
       UNION ALL
       SELECT 'credential_events', issued_at,
         to_jsonb(credential_events) || jsonb_build_object('revoked_at', null, 'revoked_reason', null)
         FROM credential_events WHERE run_id = $1
       UNION ALL
       SELECT 'credential_events', revoked_at, to_jsonb(credential_events)
         FROM credential_events WHERE run_id = $1 AND revoked_at IS NOT NULL
       UNION ALL
       SELECT 'database_changes', "timestamp", to_jsonb(database_changes)
         FROM database_changes WHERE run_id = $1
       UNION ALL
       SELECT 'delegations', created_at, to_jsonb(delegations)
         FROM delegations WHERE run_id = $1
       ORDER BY ts`,
      [runId],
    );
    res.json(
      rows.map((r) => ({ type: r.type, timestamp: r.ts, ...r.payload })),
    );
  } catch (err) {
    next(err);
  }
});

eventsRouter.get("/findings", async (req, res, next) => {
  try {
    const runId = req.query.run_id || state.getCurrentRunId();
    if (!runId) return res.json([]);
    const { rows } = await getPool().query(
      `SELECT * FROM findings WHERE run_id = $1 ORDER BY created_at`,
      [runId],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
