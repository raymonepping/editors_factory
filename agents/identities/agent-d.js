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

/**
 * Tier 1: maps one raw SSE event to at most one classification. Returns
 * null for events that don't correspond to a matrix row (most read-tool
 * traffic, renewals, etc.) — classify() is deliberately narrow, not a
 * catch-all logger.
 */
function classify({ type, payload }) {
  if (type === "audit_events" && payload.action === "task.created" && payload.actor_id === "agent-a") {
    return { code: "D-001", severity: "NORMAL", title: "Task initiated by human operator. Identity verified: agent-a." };
  }

  if (type === "audit_events" && payload.action === "task.delegated") {
    if (payload.actor_id === "agent-b") {
      return { code: "D-002", severity: "NORMAL", title: "Delegation observed: agent-a -> agent-b. Authority within expected bounds." };
    }
    if (payload.actor_id === "agent-c") {
      return { code: "D-003", severity: "ELEVATED", title: "Transitive delegation detected: agent-a -> agent-b -> agent-c. Autonomous sub-agent introduced." };
    }
  }

  if (type === "authority_decisions" && payload.requested_action === "credential.request" && payload.policy_result === "ALLOW") {
    return { code: "D-004", severity: "ELEVATED", title: "Credential requested for the data tier. Evaluating against envelope." };
  }

  if (type === "credential_events") {
    if (payload.vault_role === "factory-bad-role") {
      return { code: "D-005", severity: "CRITICAL", title: "Authority amplification: agent-c granted a broad, long-lived database role exceeding anything agent-b ever holds." };
    }
    if (payload.vault_role === "factory-good-role") {
      return { code: "D-004b", severity: "ELEVATED", title: "Narrow, short-lived database credential issued — within the expected data-tier envelope." };
    }
  }

  if (type === "database_changes") {
    if (payload.action === "DELETE") {
      return { code: "D-006", severity: "CRITICAL", title: `Destructive mutation occurred: ${payload.rows_affected} row(s) deleted from ${payload.table_name}.` };
    }
    if (payload.action === "UPDATE" && payload.table_name === "products") {
      return { code: "D-006", severity: "CRITICAL", title: "Destructive mutation occurred: product pricing modified." };
    }
    // An orders-status UPDATE (e.g. quarantine) is the expected, benign
    // recovery path in both profiles on its own — not a finding-worthy
    // signal by itself; D-007 below is what actually marks containment.
    return null;
  }

  if (type === "authority_decisions" && payload.policy_result === "DENY" && DESTRUCTIVE_ACTIONS.has(payload.requested_action)) {
    return { code: "D-007", severity: "CONTAINED", title: "Boundary enforcement: destructive action denied by policy. Zero data compromised." };
  }

  if (type === "credential_events" && payload.revoked_at) {
    return { code: "D-008", severity: "NORMAL", title: "Ephemeral credential revoked. Database identity purged." };
  }

  return null;
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
  if (SEVERITY_RANK[signal.severity] >= SEVERITY_RANK[current]) return signal.severity;
  return current;
}

async function narrate(signal, payload) {
  try {
    return await correlate({
      systemPrompt: "You are Agent D, a security observer narrating one detected signal in one short, factual sentence for a live audience. Do not invent details beyond what is given.",
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
    const signal = classify(event);
    if (!signal) return;

    const previousState = riskState;
    riskState = nextState(riskState, signal);
    const transitioned = riskState !== previousState;

    console.log(`[agent-d] ${signal.code} ${signal.severity} (state ${previousState} -> ${riskState}): ${signal.title}`);

    const detail = transitioned ? await narrate(signal, event.payload) : null;
    await recordFinding({
      severity: signal.severity === "CRITICAL" ? "critical" : signal.severity === "CONTAINED" ? "low" : "medium",
      title: `${signal.code}: ${signal.title}`,
      detail,
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
