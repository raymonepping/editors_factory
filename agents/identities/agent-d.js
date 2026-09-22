// agents/identities/agent-d.js — Continuous Detection / Live Witness.
// prompts/agents/05_01_agent_d_detection.md
//
// Not part of the A -> B -> C delegation chain — a separate, continuous,
// event-driven observer built on agents/src/observerRuntime.js, not
// runtime.js's request/response task loop. Two-tier hybrid design:
//
//   Tier 1 (this file's classify()) — deterministic, zero LLM latency.
//   Decides WHAT happened and its severity from the raw SSE event alone.
//   This is the reliable signal: title and severity are never left to
//   model sampling variance.
//
//   Tier 2 (narrate(), via observerRuntime's correlate()) — one Ollama
//   call per genuine state transition, producing only the human-
//   readable `detail` narrative text for the finding. Never influences
//   WHICH finding fires or its severity — only how it's explained.
//
// Risk state (NORMAL/ELEVATED/CRITICAL/CONTAINED) is tracked in this
// module's own memory, not a new backend table: "discovery creates
// evidence, not authority" (input/12.md) — the evidence is the
// `findings` rows this file already writes via the shared create_finding
// tool; the live 🟢/🟠/🔴 state is this process's own read of that
// evidence stream, not a second source of truth the backend must persist
// (a future dashboard derives the same state the same way, by reading
// GET /api/findings — prompts/api/API_CONTRACTS.md's own "Historical
// evidence reads" section, added alongside this prompt).

import { recordFinding, correlate } from "../src/observerRuntime.js";

const SEVERITY_RANK = { NORMAL: 0, ELEVATED: 1, CONTAINED: 1, CRITICAL: 2 };

// v2 (prompts/v2/02_05): multi-attempt risk classification, inferred
// entirely from the backend's own SSE event stream — DAG_NODE_CLAIMED,
// DAG_NODE_INVALIDATED, DAG_ATTEMPT_TIMED_OUT, EVIDENCE_LEASE_REVOKED,
// and dag_node_attempts row updates. This agent never queries Vault
// directly (security/authority-model.md, CLAUDE.md's own hard boundary)
// — ground truth for anything claimed here is confirmed independently,
// out-of-band, by scripts/vault-audit-crosscheck.py, which DOES read
// Vault's own audit log and is not part of the agent fleet. Everything
// below is a live, best-effort signal for the dashboard, not the
// authoritative record.
const LEASE_REVOCATION_GRACE_MS = 10_000;
// node_id -> lease_id -> attempt_id, for the reuse check below. Given
// this project's own architecture always mints a genuinely fresh Vault
// lease per attempt (backend/src/vault.js's mintAgentTaggedChildToken,
// called fresh on every issueDatabaseCredential), a match here would
// indicate a real bug, not an intended BAD-mode showcase — see
// .claude/DESIGN.md's own entry on why revocation is unconditional
// across both profiles in this implementation.
const nodeLeaseHistory = new Map();
// attempt_id -> Node.js Timeout, cleared the moment EVIDENCE_LEASE_REVOKED
// or a revoked dag_node_attempts row is observed for that attempt.
const pendingRevocationTimers = new Map();

// Destructive actions whose denial is worth a CONTAINED finding — a
// DENY of a merely-informational action (like credential.request itself
// failing) isn't part of this story.
const DESTRUCTIVE_ACTIONS = new Set([
  "orders.delete",
  "products.delete",
  "products.update_price",
  "products.insert",
]);

let riskState = "NORMAL";

// Wave 4 (prompts/improvements/01_01_improvement.md): each evidence
// table's own row uses a different primary-key column name (audit_events
// keeps event_id, but authority_decisions/credential_events/
// database_changes — where most of classify()'s own signals actually
// fire — use decision_id/credential_event_id/change_id respectively), so
// there is no single field name to read the correlated id from. Found
// live: every real recordFinding() call below used to omit
// correlatesWithEventId/Type entirely, leaving findings.
// correlates_with_event_id NULL for every finding this file has ever
// written, even though the raw event it classified was right there.
const SOURCE_ID_FIELD = {
  audit_events: "event_id",
  authority_decisions: "decision_id",
  credential_events: "credential_event_id",
  database_changes: "change_id",
};

function sourceEvent({ type, payload }) {
  const field = SOURCE_ID_FIELD[type];
  const id = field ? payload?.[field] : null;
  return id ? { id, type } : { id: null, type: null };
}

/**
 * Tier 1: maps one raw SSE event to at most one classification. Returns
 * null for events that don't correspond to a matrix row (most read-tool
 * traffic, renewals, etc.) — classify() is deliberately narrow, not a
 * catch-all logger.
 */
export function classify({ type, payload }) {
  if (
    type === "audit_events" &&
    payload.action === "task.created" &&
    payload.actor_id === "agent-a"
  ) {
    return {
      code: "D-001",
      severity: "NORMAL",
      title: "Task initiated by human operator. Identity verified: Assistant.",
    };
  }

  if (type === "audit_events" && payload.action === "task.delegated") {
    if (payload.actor_id === "agent-b") {
      return {
        code: "D-002",
        severity: "NORMAL",
        title:
          "Delegation observed: Assistant -> Investigator. Authority within expected bounds.",
      };
    }
    if (payload.actor_id === "agent-c") {
      return {
        code: "D-003",
        severity: "ELEVATED",
        title:
          "Transitive delegation detected: Assistant -> Investigator -> Corrector. Autonomous sub-agent introduced.",
      };
    }
  }

  if (
    type === "authority_decisions" &&
    payload.requested_action === "credential.request" &&
    payload.policy_result === "ALLOW"
  ) {
    return {
      code: "D-004",
      severity: "ELEVATED",
      title:
        "Credential requested for the data tier. Evaluating against envelope.",
    };
  }

  // Found live (01_03 validation): backend/src/audit.js publishes the
  // full credential_events row on three separate transitions —
  // recordCredentialEvent (issuance), markCredentialRenewed (renewal),
  // and markCredentialRevoked (revocation) — and every one of them still
  // carries the same vault_role. Matching on vault_role alone fired
  // D-005/D-004b again on each later re-broadcast of the identical
  // credential (observed: D-005 recorded 3x for one credential_event_id
  // in a single run), and made D-008 below unreachable, since this block
  // matched every credential_events message first, revocation included.
  // Only the true first issuance (revoked_at still null, no renewal yet)
  // is "a credential was granted" — a later renewal of the same lease
  // isn't a second grant, and a revocation is D-008's own signal, not
  // this one's.
  if (
    type === "credential_events" &&
    !payload.revoked_at &&
    !payload.renewal_count
  ) {
    if (payload.vault_role === "factory-bad-role") {
      return {
        code: "D-005",
        severity: "CRITICAL",
        title:
          "Authority amplification: Corrector granted a broad, long-lived database role exceeding anything Investigator ever holds.",
      };
    }
    if (payload.vault_role === "factory-good-role") {
      return {
        code: "D-004b",
        severity: "ELEVATED",
        title:
          "Narrow, short-lived database credential issued — within the expected data-tier envelope.",
      };
    }
  }

  if (type === "database_changes") {
    if (payload.action === "DELETE") {
      return {
        code: "D-006",
        severity: "CRITICAL",
        title: `Destructive mutation occurred: ${payload.rows_affected} row(s) deleted from ${payload.table_name}.`,
      };
    }
    if (payload.action === "UPDATE" && payload.table_name === "products") {
      return {
        code: "D-006",
        severity: "CRITICAL",
        title: "Destructive mutation occurred: product pricing modified.",
      };
    }
    // An orders-status UPDATE (e.g. quarantine) is the expected, benign
    // recovery path in both profiles on its own — not a finding-worthy
    // signal by itself; D-007 below is what actually marks containment.
    return null;
  }

  if (
    type === "authority_decisions" &&
    payload.policy_result === "DENY" &&
    DESTRUCTIVE_ACTIONS.has(payload.requested_action)
  ) {
    return {
      code: "D-007",
      severity: "CONTAINED",
      title:
        "Boundary enforcement: destructive action denied by policy. Zero data compromised.",
    };
  }

  if (type === "credential_events" && payload.revoked_at) {
    return {
      code: "D-008",
      severity: "NORMAL",
      title: "Ephemeral credential revoked. Database identity purged.",
    };
  }

  // ── v2 (prompts/v2/02_05) — recoverable micro-DAG signals ────────────

  if (type === "DAG_NODE_CLAIMED" && Number(payload.attempt_number) >= 2) {
    return {
      code: "D-101",
      severity: "ELEVATED",
      title: `Node retry in progress: "${payload.node_key}" attempt ${payload.attempt_number}. Fresh mandate evaluation required — no authority carries over from the prior attempt.`,
    };
  }

  if (type === "DAG_NODE_INVALIDATED") {
    return {
      code: "D-102",
      severity: "ELEVATED",
      title: `Downstream node invalidated following an upstream retry: "${payload.node_key}". Its prior evidence and authority are no longer trusted.`,
    };
  }

  if (
    type === "dag_node_attempts" &&
    payload.vault_lease_id &&
    payload.authority_status === "active"
  ) {
    // Credential-issuance signal for one DAG attempt — records the
    // lease -> attempt mapping for the reuse check below. Not itself a
    // finding-worthy event on its own (v1's existing D-004/D-005/D-004b
    // block above already classifies the underlying credential_events
    // row for both v1 and v2 traffic alike).
    const seen = nodeLeaseHistory.get(payload.node_id) || new Map();
    const priorAttempt = seen.get(payload.vault_lease_id);
    if (priorAttempt && priorAttempt !== payload.attempt_id) {
      return {
        code: "D-103",
        severity: "CRITICAL",
        title: `Credential lease reuse detected: attempt ${payload.attempt_id} of "${payload.node_key}" was issued the same lease as a prior attempt. Authority did not reset between attempts.`,
      };
    }
    seen.set(payload.vault_lease_id, payload.attempt_id);
    nodeLeaseHistory.set(payload.node_id, seen);
    return null;
  }

  return null;
}

/**
 * v2 (prompts/v2/02_05): the timing half of the CRITICAL "lingering
 * lease" check — an attempt that held a lease reached a terminal
 * transition, but no EVIDENCE_LEASE_REVOKED followed within
 * LEASE_REVOCATION_GRACE_MS. Not expressible as a single classify()
 * mapping (it depends on the ABSENCE of a later event, not the presence
 * of one), so this runs alongside it, driven from the same onEvent
 * stream, and calls recordFinding() directly rather than returning a
 * signal for onEvent to record.
 */
export function trackLeaseLifecycle(event) {
  const { type, payload } = event;

  if (
    type === "dag_node_attempts" &&
    payload.vault_lease_id &&
    payload.authority_status === "active"
  ) {
    // Only attempts that actually hold a lease need a revocation watch —
    // triage/investigate never request a credential and would otherwise
    // always false-positive here.
    scheduleRevocationCheck(
      payload.attempt_id,
      payload.node_id,
      payload.node_key,
    );
    return;
  }

  if (
    (type === "EVIDENCE_LEASE_REVOKED" || type === "DAG_ATTEMPT_TIMED_OUT") &&
    payload.attempt_id
  ) {
    clearPendingRevocationCheck(payload.attempt_id);
    return;
  }

  if (
    type === "dag_node_attempts" &&
    payload.authority_status === "revoked" &&
    payload.attempt_id
  ) {
    clearPendingRevocationCheck(payload.attempt_id);
  }
}

function clearPendingRevocationCheck(attemptId) {
  const timer = pendingRevocationTimers.get(attemptId);
  if (timer) {
    clearTimeout(timer);
    pendingRevocationTimers.delete(attemptId);
  }
}

function scheduleRevocationCheck(attemptId, nodeId, nodeKey) {
  clearPendingRevocationCheck(attemptId); // defensive — should not double-fire
  const timer = setTimeout(() => {
    pendingRevocationTimers.delete(attemptId);
    recordFinding({
      severity: "critical",
      title: `D-104: Lingering lease suspected: attempt ${attemptId} of "${nodeKey}" held a database credential with no observed revocation ${LEASE_REVOCATION_GRACE_MS / 1000}s after its own credential issuance. Confirm against scripts/vault-audit-crosscheck.py.`,
      detail: null,
      correlatesWithEventId: nodeId,
      correlatesWithEventType: "dag_node_attempts",
    }).catch(() => {
      // Best-effort — a failed finding write here must not crash the
      // observer loop's own event processing.
    });
  }, LEASE_REVOCATION_GRACE_MS);
  timer.unref?.();
  pendingRevocationTimers.set(attemptId, timer);
}

/** Applies the matrix's own escalation rule: state only ever moves up in
 * severity, EXCEPT a CONTAINED classification is allowed to pull state
 * back down from CRITICAL/ELEVATED — a policy denial is a real
 * de-escalation event, not just noise at the current level.
 *
 * D-001 (TASK_DISPATCHED) is the one signal that unconditionally resets
 * to NORMAL rather than following the escalate-only rule. Found live:
 * without this, riskState is a module-level variable that lives for the
 * whole container's lifetime, not per demo run — a fresh GOOD-mode run
 * started right after a BAD-mode run that went CRITICAL kept reporting
 * CRITICAL from its very first heartbeat, before anything in the new
 * run had actually happened. A new human-originated task is an
 * unambiguous "this is a new run" signal (every demo run starts with
 * exactly one, per tasks.js), so it's the correct place to reset. */
function nextState(current, signal) {
  if (signal.code === "D-001") return "NORMAL";
  if (signal.severity === "CONTAINED") return "CONTAINED";
  if (SEVERITY_RANK[signal.severity] >= SEVERITY_RANK[current])
    return signal.severity;
  return current;
}

async function narrate(signal, payload) {
  try {
    return await correlate({
      systemPrompt:
        "You are Agent D, a security observer narrating one detected signal in one short, factual sentence for a live audience. Do not invent details beyond what is given.",
      signalSummary: `Signal ${signal.code} (${signal.severity}): ${signal.title}\nRaw event data: ${JSON.stringify(payload)}`,
    });
  } catch (err) {
    // Tier 2 is a narrative enhancement, never load-bearing — a failed
    // or slow Ollama call must not stop the finding (the deterministic
    // part) from being recorded.
    return null;
  }
}

export default {
  role: "Continuous Detection / Live Witness",

  // No Ollama-callable tools — see this file's own header comment.
  // observerRuntime.js's startObserverRuntime doesn't offer a tool
  // schema to the model at all for the observer path.
  //
  // Deliberately awaited end-to-end (classify -> narrate -> record),
  // not fire-and-forget. Found live: letting each event's Tier-2
  // narration race independently scrambled finding order — Ollama
  // serves one inference at a time (OLLAMA_NUM_PARALLEL=1), so whichever
  // narration call happened to clear that queue first got its finding
  // recorded first, regardless of which event actually happened first.
  // That directly breaks the "detection precedes damage" chronological
  // claim this whole agent exists to make. backendClient.js's
  // subscribeEvents awaits this return value, so returning it here is
  // what makes Agent D process one signal fully before the next.
  async onEvent(event) {
    trackLeaseLifecycle(event);

    const signal = classify(event);
    if (!signal) return;

    const previousState = riskState;
    riskState = nextState(riskState, signal);
    const transitioned = riskState !== previousState;

    console.log(
      `[agent-d] ${signal.code} ${signal.severity} (state ${previousState} -> ${riskState}): ${signal.title}`,
    );

    const detail = transitioned ? await narrate(signal, event.payload) : null;
    const source = sourceEvent(event);
    await recordFinding({
      severity:
        signal.severity === "CRITICAL"
          ? "critical"
          : signal.severity === "CONTAINED"
            ? "low"
            : "medium",
      title: `${signal.code}: ${signal.title}`,
      detail,
      correlatesWithEventId: source.id,
      correlatesWithEventType: source.type,
    });
  },

  // Background health-check cadence (prompts/agents/05_01's own "15-20s"
  // requirement) — a lightweight liveness pulse, not a new tool call:
  // Agent D's job is reacting to the real event stream, not polling: an
  // idle radar during a quiet period is itself the correct state, not
  // something to paper over with synthetic activity.
  onTick() {
    console.log(`[agent-d] heartbeat — current risk state: ${riskState}`);
  },
  tickIntervalMs: 20_000,
};
