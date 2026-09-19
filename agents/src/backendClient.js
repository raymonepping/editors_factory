// src/backendClient.js — every authenticated call an agent makes to
// factory-api. One function per endpoint from
// prompts/api/API_CONTRACTS.md. Wave 6 (ADR
// docs/validation/ADR_001_agent_api_identity.md): config.agentToken (the
// static per-agent secret) is now used for exactly one call —
// bootstrapToken() below — never attached to any other request. Every
// other call uses the short-lived, task-bound JWT that call returns.
// Agents never call each other's network endpoints directly and never
// touch PostgreSQL or Vault directly — this file is the only network
// client an identity module (agents/identities/*.js) should ever need.

import { config } from "./config.js";

let currentAgentToken = null;
let tokenMintedAt = 0;
let tokenTtlSeconds = 0;

async function request(method, path, body, { useStaticToken = false } = {}) {
  const token = useStaticToken ? config.agentToken : currentAgentToken;
  if (!token) {
    throw new Error(
      `request(${method} ${path}) called before an agent token was bootstrapped`,
    );
  }
  const res = await fetch(`${config.backend.url}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(
      data?.error || `${method} ${path} failed: ${res.status}`,
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * Mints a fresh JWT using the static per-agent token, bound (server-side
 * — never from anything this call sends) to this actor's currently
 * active task, or to the active run for agent-d, which has none. Must be
 * called before ANY other backendClient method — runtime.js's handleTask
 * does this as its very first step, before even fetching the task it was
 * just handed.
 */
async function bootstrapToken() {
  const { token, ttlSeconds } = await request(
    "POST",
    "/api/v1/agents/token",
    undefined,
    { useStaticToken: true },
  );
  currentAgentToken = token;
  tokenMintedAt = Date.now();
  tokenTtlSeconds = ttlSeconds;
  return token;
}

/**
 * Re-bootstraps only if the current token is past half its life — for
 * agent-d's long-lived observer loop, which has no natural "new task"
 * moment to hang a refresh off of (called from its own onTick, same 15-
 * 20s cadence services/revocation.js's DB-credential renewal already
 * uses this halfway heuristic for). A no-op for agent-a/b/c, which
 * bootstrap fresh per task instead.
 */
async function ensureFreshToken() {
  const ageSeconds = (Date.now() - tokenMintedAt) / 1000;
  if (!currentAgentToken || ageSeconds > tokenTtlSeconds / 2) {
    await bootstrapToken();
  }
}

function query(params) {
  const entries = Object.entries(params || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (!entries.length) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}

export const backendClient = {
  // ── Identity (Wave 6) ───────────────────────────────────────────────
  bootstrapToken,
  ensureFreshToken,

  // ── Read tools ──────────────────────────────────────────────────────
  getHealth: () => request("GET", "/api/actions/health"),
  listOrders: (filter = {}) =>
    request("GET", `/api/actions/orders${query(filter)}`),
  getOrder: (id) => request("GET", `/api/actions/orders/${id}`),
  listProducts: (filter = {}) =>
    request("GET", `/api/actions/products${query(filter)}`),

  // ── Mutating tools ──────────────────────────────────────────────────
  updateOrderStatus: (id, status) =>
    request("PATCH", `/api/actions/orders/${id}/status`, { status }),
  deleteOrders: (filter) =>
    request("DELETE", "/api/actions/orders", { filter }),
  updatePrice: (sku, price) =>
    request("PATCH", `/api/actions/products/${sku}/price`, { price }),
  insertProduct: (product) => request("POST", "/api/actions/products", product),
  deleteProducts: (filter) =>
    request("DELETE", "/api/actions/products", { filter }),
  restartOrderProcessor: () =>
    request("POST", "/api/actions/services/order-processor/restart"),

  // ── Credential + delegation ─────────────────────────────────────────
  requestCredential: () => request("POST", "/api/credentials"),
  delegateTask: ({ toActor, goal, authorityEnvelope }) =>
    request("POST", "/api/delegations", { toActor, goal, authorityEnvelope }),

  // ── Detection-only (Agent D) ────────────────────────────────────────
  createFinding: ({
    severity,
    title,
    detail,
    correlatesWithEventId,
    correlatesWithEventType,
  }) =>
    request("POST", "/api/actions/findings", {
      severity,
      title,
      detail,
      correlatesWithEventId,
      correlatesWithEventType,
    }),

  // ── Task lookup ─────────────────────────────────────────────────────
  getTask: (taskId) => request("GET", `/api/tasks/${taskId}`),
  completeTask: (taskId) => request("POST", `/api/tasks/${taskId}/complete`),

  // ── Introspection ───────────────────────────────────────────────────
  getAuthority: () => request("GET", "/api/authority"),
};

/**
 * Subscribes to the backend's SSE stream and calls `onEvent({type, payload})`
 * for every event — `type` is the evidence-table name (audit_events,
 * delegations, authority_decisions, credential_events, database_changes,
 * findings; see src/events.js's own publishEvent), `payload` is the raw
 * inserted row. Reconnects automatically on drop (a long-running demo
 * must survive a transient backend restart) with a fixed backoff — this
 * is a background stream, not a user-facing request, so there is no
 * caller waiting on a promise to reject.
 *
 * Node's fetch() gives a Web ReadableStream body; SSE frames are
 * `event: <type>\ndata: <json>\n\n` (no library needed for this simple,
 * single-backend-controlled format — see src/events.js).
 *
 * `onEvent`'s return value IS awaited before the next frame is
 * processed — found live building observerRuntime.js: Agent D's
 * finding-per-event writes went out of chronological order because its
 * own Tier-2 Ollama narration calls raced each other (Ollama serves one
 * inference at a time — OLLAMA_NUM_PARALLEL=1 — so whichever event's
 * narration finished the Ollama queue first got recorded first,
 * regardless of real event order), which directly breaks the "detection
 * precedes damage" chronological claim the demo depends on. Awaiting
 * here makes that a caller's choice: runtime.js's own onEvent wrapper
 * already fires handleTask(...).catch(...) without returning its
 * promise (a deliberate, unrelated fire-and-forget — one task must not
 * block detecting another agent's events), so awaiting a synchronously-
 * returning callback there is a no-op; observerRuntime.js's onEvent
 * wrapper instead returns the full classify+narrate+record promise, so
 * awaiting it here is what actually serializes Agent D's processing.
 */
export async function subscribeEvents(onEvent, { signal } = {}) {
  const reconnectDelayMs = 2000;
  while (!signal?.aborted) {
    try {
      const res = await fetch(`${config.backend.url}/api/events/stream`, {
        headers: { Accept: "text/event-stream" },
        signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`SSE connect failed: ${res.status}`);
      }
      let buffer = "";
      for await (const chunk of res.body) {
        buffer += Buffer.isBuffer(chunk)
          ? chunk.toString("utf8")
          : Buffer.from(chunk).toString("utf8");
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const typeLine = frame
            .split("\n")
            .find((l) => l.startsWith("event: "));
          const dataLine = frame
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!typeLine || !dataLine) continue; // e.g. the initial ": connected" comment
          const type = typeLine.slice("event: ".length);
          let payload;
          try {
            payload = JSON.parse(dataLine.slice("data: ".length));
          } catch {
            continue;
          }
          await onEvent({ type, payload });
        }
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error(
        `[${config.identity}] SSE stream error, reconnecting in ${reconnectDelayMs}ms:`,
        err.message,
      );
    }
    if (signal?.aborted) return;
    await new Promise((r) => setTimeout(r, reconnectDelayMs));
  }
}
