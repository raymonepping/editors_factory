// src/events.js — SSE broadcaster. Every evidence-table insert
// (audit.js) is pushed to every connected client in near-real-time —
// this is what makes the frontend's live timeline and Agent D's traffic
// light work without polling (prompts/backend/01_01_orchestrator_api.md).

const clients = new Set();

export function addClient(res) {
  clients.add(res);
}

export function removeClient(res) {
  clients.delete(res);
}

// Found live: every agent's SSE connection (including Discovery's own)
// dropped simultaneously roughly every 5 minutes — "SSE stream error,
// reconnecting" at the identical timestamp across all four agent
// containers, confirmed not caused by any app-level timeout (grepped
// index.js/events.js/routes/events.js for one; none set) and not tied to
// any factory-api restart. That points at Podman's own rootless
// networking (gvproxy on this applehv-backed machine) reaping an
// idle TCP connection — nothing was flowing on it between real events,
// so the network layer treated it as dead. A brief reconnect drops
// whatever events fired during the gap; nothing replays them, so a run
// that happens to complete during one of these windows can leave
// Discovery with nothing to react to despite real events having
// occurred. The standard SSE fix: write a periodic comment frame so the
// connection is never actually idle. 15s is comfortably under the ~5
// minute window observed, and a comment line (":" prefix) is ignored by
// EventSource clients by spec, so this changes no event semantics.
const KEEPALIVE_INTERVAL_MS = 15000;
setInterval(() => {
  for (const res of clients) {
    res.write(": keepalive\n\n");
  }
}, KEEPALIVE_INTERVAL_MS);

export function publishEvent(type, payload) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    res.write(message);
  }
}

export function clientCount() {
  return clients.size;
}
