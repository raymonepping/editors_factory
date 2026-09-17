// src/heartbeat.js — touches a file on every runtime loop tick so the
// container's healthcheck (Containerfile / compose/agents/compose.yaml)
// can tell a genuinely stalled loop apart from a quiet-but-alive one,
// without needing an HTTP listener (agents never listen for inbound
// connections — see prompts/agents/01_01's own design rules).

import { writeFile } from "node:fs/promises";

const HEARTBEAT_FILE = "/tmp/agent-heartbeat";

export async function beat() {
  try {
    await writeFile(HEARTBEAT_FILE, String(Date.now()));
  } catch {
    // Never let a heartbeat-file write failure take down the runtime
    // loop itself — liveness reporting is best-effort.
  }
}
