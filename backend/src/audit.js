// src/audit.js — writes every evidence-table row. All writes go through
// the backend's own operational pool (factory-backend-role), never the
// agent-issued factory-bad-role/factory-good-role credential — audit
// writes are not the demo's mutation story.

import { getPool } from "./db.js";
import { publishEvent } from "./events.js";

export async function startRun(profile, workflowMode = "fixed_chain") {
  const { rows } = await getPool().query(
    `INSERT INTO demo_runs (profile, status, workflow_mode) VALUES ($1, 'running', $2) RETURNING run_id`,
    [profile, workflowMode],
  );
  return rows[0].run_id;
}

export async function endRun(runId, status) {
  await getPool().query(
    `UPDATE demo_runs SET status = $2, ended_at = now()${status === "reset" ? ", reset_at = now()" : ""} WHERE run_id = $1`,
    [runId, status],
  );
}

export async function getActiveRun() {
  const { rows } = await getPool().query(
    `SELECT run_id, profile, workflow_mode FROM demo_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`,
  );
  return rows[0] || null;
}

export async function recordAuditEvent(event) {
  const {
    runId,
    traceId,
    taskId,
    parentTaskId = null,
    actorId,
    delegatedBy = null,
    humanSubjectId = null,
    delegationId = null,
    delegationDepth = 0,
    requestedAuthority = null,
    effectiveAuthority = null,
    credentialId = null,
    toolName = null,
    target = null,
    action = null,
    result = null,
    rowsAffected = null,
  } = event;
  const { rows } = await getPool().query(
    `INSERT INTO audit_events
       (run_id, trace_id, task_id, parent_task_id, actor_id, delegated_by,
        human_subject_id, delegation_id, delegation_depth,
        requested_authority, effective_authority,
        credential_id, tool_name, target, action, result, rows_affected)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      runId,
      traceId,
      taskId,
      parentTaskId,
      actorId,
      delegatedBy,
      humanSubjectId,
      delegationId,
      delegationDepth,
      requestedAuthority,
      effectiveAuthority,
      credentialId,
      toolName,
      target,
      action,
      result,
      rowsAffected,
    ],
  );
  publishEvent("audit_events", rows[0]);
  return rows[0];
}

export async function recordDelegation({
  runId,
  fromActor,
  toActor,
  taskId,
  authorityEnvelope,
}) {
  const { rows } = await getPool().query(
    `INSERT INTO delegations (run_id, from_actor, to_actor, task_id, authority_envelope)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [runId, fromActor, toActor, taskId, JSON.stringify(authorityEnvelope)],
  );
  publishEvent("delegations", rows[0]);
  return rows[0];
}

export async function recordAuthorityDecision({
  runId,
  actorId,
  requestedAction,
  policyResult,
  reason = null,
  traceId = null,
  taskId = null,
}) {
  const { rows } = await getPool().query(
    `INSERT INTO authority_decisions (run_id, actor_id, requested_action, policy_result, reason, trace_id, task_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [runId, actorId, requestedAction, policyResult, reason, traceId, taskId],
  );
  publishEvent("authority_decisions", rows[0]);
  return rows[0];
}

export async function recordCredentialEvent({
  runId,
  actorId,
  vaultRole,
  leaseId,
  ttlSeconds,
  traceId = null,
  taskId = null,
}) {
  const { rows } = await getPool().query(
    `INSERT INTO credential_events (run_id, actor_id, vault_role, lease_id, ttl_seconds, trace_id, task_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [runId, actorId, vaultRole, leaseId, ttlSeconds, traceId, taskId],
  );
  publishEvent("credential_events", rows[0]);
  return rows[0];
}

export async function markCredentialRevoked(leaseId, reason = null) {
  // Found live executing prompts/agents/05_01_agent_d_detection.md:
  // this update had no publishEvent call, so a revoked credential was
  // invisible to the live SSE stream entirely — Agent D's D-008 signal
  // (CREDENTIAL_REVOKED) had no event to react to. RETURNING * + the
  // same publishEvent('credential_events', row) every other write to
  // this table already does.
  const { rows } = await getPool().query(
    `UPDATE credential_events SET revoked_at = now(), revoked_reason = $2 WHERE lease_id = $1 RETURNING *`,
    [leaseId, reason],
  );
  if (rows[0]) publishEvent("credential_events", rows[0]);
}

export async function markCredentialRenewed(leaseId) {
  const { rows } = await getPool().query(
    `UPDATE credential_events
        SET renewal_count = renewal_count + 1, last_renewed_at = now()
      WHERE lease_id = $1 AND revoked_at IS NULL
      RETURNING *`,
    [leaseId],
  );
  if (rows[0]) publishEvent("credential_events", rows[0]);
  return rows[0] || null;
}

export async function getUnrevokedLeases(runId) {
  const { rows } = await getPool().query(
    `SELECT lease_id FROM credential_events WHERE run_id = $1 AND revoked_at IS NULL AND lease_id IS NOT NULL`,
    [runId],
  );
  return rows.map((r) => r.lease_id);
}

export async function recordDatabaseChange({
  runId,
  actorId,
  tableName,
  action,
  before = null,
  after = null,
  rowsAffected,
  traceId = null,
  taskId = null,
}) {
  const { rows } = await getPool().query(
    `INSERT INTO database_changes (run_id, actor_id, table_name, action, before, after, rows_affected, trace_id, task_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      runId,
      actorId,
      tableName,
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      rowsAffected,
      traceId,
      taskId,
    ],
  );
  publishEvent("database_changes", rows[0]);
  return rows[0];
}

export async function recordFinding({
  runId,
  actorId = "agent-d",
  severity,
  title,
  detail = null,
  correlatesWithEventId = null,
  correlatesWithEventType = null,
}) {
  const { rows } = await getPool().query(
    `INSERT INTO findings (run_id, actor_id, severity, title, detail, correlates_with_event_id, correlates_with_event_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      runId,
      actorId,
      severity,
      title,
      detail,
      correlatesWithEventId,
      correlatesWithEventType,
    ],
  );
  publishEvent("findings", rows[0]);
  return rows[0];
}
