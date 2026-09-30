// mandate.js — bind a bounded (GOOD) credential to the records and status
// transitions its task justifies. backend/src/migrations/013_credential_mandates.sql
// has the reasoning and the database half; this is the backend half.
//
// Before this existed, the GOOD corrector's permission was "change any
// order's status": scoped to an action, not to a target or a transition.
// Proven live: agent-c, holding a legitimate 2-minute credential, set a
// fulfilled order that no task mentioned to `cancelled` — 200, recorded,
// and unflagged.
//
// The standard mandate follows the corrector's own instructions
// (agents/identities/agent-c.js): an `inconsistent` order is a record the
// order system could not reconcile. The agent may ISOLATE it (quarantine,
// reversible, no outcome decided). Deciding the outcome — fulfilled,
// cancelled, back to processing — or touching any order outside the task
// is a human decision, reached through the Vault Control Group exception
// path (POST /api/credentials with `exception`).

import { getPool } from "./db.js";

export const STANDARD_TRANSITIONS = [{ from: "inconsistent", to: "quarantined" }];
export const ORDER_STATUSES = ["pending", "processing", "inconsistent", "quarantined", "cancelled", "fulfilled"];

/**
 * The standard mandate for a task: every order currently in a status the
 * standard transitions start from — narrowed to task.scope.orderIds when
 * the delegation named specific orders. A snapshot: orders that become
 * inconsistent after issuance are not covered by this credential.
 */
export async function buildStandardMandate(task) {
  const fromStatuses = [...new Set(STANDARD_TRANSITIONS.map((t) => t.from))];
  const { rows } = await getPool().query(
    "SELECT id, status FROM orders WHERE status = ANY($1) ORDER BY id",
    [fromStatuses],
  );
  const scoped = Array.isArray(task?.scope?.orderIds)
    ? new Set(task.scope.orderIds.map(Number))
    : null;
  return rows
    .filter((o) => !scoped || scoped.has(o.id))
    .flatMap((o) =>
      STANDARD_TRANSITIONS.filter((t) => t.from === o.status).map((t) => ({
        orderId: o.id,
        from: t.from,
        to: t.to,
      })),
    );
}

/** Write the mandate rows for one Vault-issued PostgreSQL login. */
export async function bindMandate(dbUser, entries, { taskId = null, grantedVia = "mandate", reason = null } = {}) {
  if (!dbUser || entries.length === 0) return 0;
  const values = [];
  const params = [];
  entries.forEach((e, i) => {
    const b = i * 7;
    values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
    params.push(dbUser, e.orderId, e.from, e.to, taskId, grantedVia, reason);
  });
  await getPool().query(
    `INSERT INTO credential_mandates (db_user, order_id, from_status, to_status, task_id, granted_via, reason)
     VALUES ${values.join(",")} ON CONFLICT DO NOTHING`,
    params,
  );
  return entries.length;
}

/**
 * Is this change inside the credential's mandate? Mirrors the database's
 * own check, so the backend can refuse with a clear answer and a finding
 * before PostgreSQL has to.
 */
export async function checkMandate(dbUser, orderId, toStatus) {
  const { rows: orders } = await getPool().query("SELECT status FROM orders WHERE id = $1", [orderId]);
  if (!orders.length) return { ok: false, reason: "order_not_found", from: null };
  const from = orders[0].status;
  const { rows } = await getPool().query(
    `SELECT granted_via FROM credential_mandates
      WHERE db_user = $1 AND order_id = $2 AND from_status = $3 AND to_status = $4`,
    [dbUser, orderId, from, toStatus],
  );
  if (rows.length) return { ok: true, from, grantedVia: rows[0].granted_via };
  return { ok: false, reason: "outside_mandate", from };
}

/** What this credential may do — returned with a refusal so the agent can correct itself. */
export async function describeMandate(dbUser) {
  const { rows } = await getPool().query(
    `SELECT order_id, from_status, to_status, granted_via FROM credential_mandates
      WHERE db_user = $1 ORDER BY order_id`,
    [dbUser],
  );
  return rows.map((r) => ({ orderId: r.order_id, from: r.from_status, to: r.to_status, grantedVia: r.granted_via }));
}
