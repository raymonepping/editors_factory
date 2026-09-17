// src/backendClient.js — every authenticated call an agent makes to
// factory-api. One function per endpoint from
// prompts/api/API_CONTRACTS.md, using this agent's own bearer token
// (config.agentToken) on every request. Agents never call each other's
// network endpoints directly and never touch PostgreSQL or Vault
// directly — this file is the only network client an identity module
// (agents/identities/*.js) should ever need.

import { config } from "./config.js";

async function request(method, path, body) {
  const res = await fetch(`${config.backend.url}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.agentToken}`,
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

function query(params) {
  const entries = Object.entries(params || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (!entries.length) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}

export const backendClient = {
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
  createFinding: ({ severity, title, detail, correlatesWithEventId }) =>
    request("POST", "/api/actions/findings", {
      severity,
      title,
      detail,
      correlatesWithEventId,
    }),

  // ── Task lookup ─────────────────────────────────────────────────────
  getTask: (taskId) => request("GET", `/api/tasks/${taskId}`),

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
          onEvent({ type, payload });
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
