// src/observerRuntime.js — the long-running, event-driven loop for
// Agent D (prompts/agents/05_01_agent_d_detection.md). Unlike
// runtime.js's request/response task loop (Agent A/B/C), Agent D is not
// part of the delegation chain and never receives a task — it only
// observes. This file provides the reusable plumbing (SSE subscription,
// a periodic background tick, Ollama access for narrative synthesis, and
// the create_finding tool) that 05_01's identity module builds its own
// two-tier hybrid design on top of:
//
//   Tier 1 (deterministic, zero LLM latency) -> `onEvent` classifier
//   Tier 2 (Ollama correlation/narrative)     -> `correlate()` helper
//
// The actual classification matrix, risk-state model, and 15-20s
// background-health-check cadence described in 05_01 belong in
// agents/identities/agent-d.js, not here — this file only owns the
// mechanics an observer needs, matching how tools.js/runtime.js own the
// mechanics identities/agent-a.js through agent-c.js build on.

import { config } from "./config.js";
import { backendClient, subscribeEvents } from "./backendClient.js";
import { chat } from "./ollamaClient.js";
import { TOOLS } from "./tools.js";
import { beat } from "./heartbeat.js";

/**
 * Starts Agent D's observer loop.
 *
 * @param {object} identity - agents/identities/agent-d.js's default export.
 * @param {(event: {type: string, payload: object}) => void} identity.onEvent
 *   Tier-1 deterministic classifier, called for every SSE event.
 * @param {() => void} [identity.onTick]
 *   Optional periodic callback (background health check).
 * @param {number} [identity.tickIntervalMs]
 *   Defaults to 15000ms (the 15-20s cadence prompts/agents/05_01 asks for).
 */
export async function startObserverRuntime(identity, { signal } = {}) {
  console.log(
    `[${config.identity}] observer runtime starting — role: ${identity.role}`,
  );
  const heartbeatTimer = setInterval(beat, 5000);
  beat();

  // Wave 6: agent-d has no task to bind a JWT to (never part of the
  // delegation chain), so its token is bound to the current run instead.
  // Refreshed on its own fixed timer, independent of identity.onTick —
  // not every observer identity is guaranteed to define one, and a
  // token silently never refreshing would eventually 401 every call.
  await backendClient.bootstrapToken();
  const tokenRefreshTimer = setInterval(() => {
    backendClient.ensureFreshToken().catch((err) => {
      console.error(`[${config.identity}] token refresh failed:`, err.message);
    });
  }, 15000);

  const tickTimer = identity.onTick
    ? setInterval(identity.onTick, identity.tickIntervalMs || 15000)
    : null;

  // Wave 6, found live: the 15s time-based refresh above is not enough
  // on its own — make reset/profile-switch starts a brand-new run_id
  // immediately, a discrete event, not something a time-based heuristic
  // reacts to promptly. A token minted for the previous run is invalid
  // the instant that happens (agentJwtAuth's own run_id check), so
  // agent-d's every create_finding call 401'd until its next scheduled
  // refresh happened to catch up. Tracking the run_id of the last
  // processed event and forcing an immediate re-bootstrap the moment it
  // changes closes that window precisely, instead of shortening the
  // timer and hoping.
  let lastKnownRunId = null;

  await subscribeEvents(
    // Awaited by subscribeEvents itself (backendClient.js's own
    // comment) — returning identity.onEvent's promise here is what
    // makes Agent D process one event fully (including its Tier-2
    // narration) before the next, keeping findings in real
    // chronological order.
    async (event) => {
      try {
        const eventRunId = event.payload?.run_id;
        if (eventRunId && eventRunId !== lastKnownRunId) {
          await backendClient.bootstrapToken();
          lastKnownRunId = eventRunId;
        }
        await identity.onEvent(event);
      } catch (err) {
        console.error(
          `[${config.identity}] onEvent classifier threw:`,
          err.message,
        );
      }
    },
    { signal },
  );

  clearInterval(heartbeatTimer);
  clearInterval(tokenRefreshTimer);
  if (tickTimer) clearInterval(tickTimer);
}

/**
 * Tier-2 helper: asks Ollama to synthesize a short narrative for a
 * detected transition/anomaly, given the deterministic signal(s) that
 * triggered it. Plain single-turn completion, no tool-calling — Tier 2's
 * job is narrative synthesis, not further tool selection (the finding
 * itself is written via `recordFinding`, not chosen by the model).
 */
export async function correlate({ systemPrompt, signalSummary }) {
  const result = await chat({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: signalSummary },
    ],
    tools: [],
  });
  return result.content;
}

/** Writes a finding via the same backend endpoint every other
 * finding-writer uses (src/tools.js's create_finding). */
export async function recordFinding({
  severity,
  title,
  detail,
  correlatesWithEventId,
  correlatesWithEventType,
}) {
  return TOOLS.create_finding.run(
    {
      severity,
      title,
      detail,
      correlates_with_event_id: correlatesWithEventId,
      correlates_with_event_type: correlatesWithEventType,
    },
    { identity: config.identity },
  );
}

export { backendClient };
