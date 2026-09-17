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

export function publishEvent(type, payload) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    res.write(message);
  }
}

export function clientCount() {
  return clients.size;
}
