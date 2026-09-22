// src/index.js — reads AGENT_IDENTITY, loads that identity's module, and
// starts the matching runtime loop. One shared image for agent-a/b/c/d,
// differentiated entirely by env var (prompts/agents/01_01's own design).

import { config, validateConfigOnBoot } from "./config.js";
import { startTaskRuntime } from "./runtime.js";
import { startObserverRuntime } from "./observerRuntime.js";
import { startDagWorker } from "./dagWorker.js";
import { beat } from "./heartbeat.js";

validateConfigOnBoot();

const controller = new AbortController();
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`[${config.identity}] received ${sig}, shutting down`);
    controller.abort();
    process.exit(0);
  });
}

async function loadIdentity() {
  try {
    const mod = await import(`../identities/${config.identity}.js`);
    return mod.default;
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND") {
      // A genuinely honest, expected state while prompts/agents/02_01-05_01
      // haven't landed yet for this identity — not a crash-worthy error.
      // Park the process (rather than exit, which `restart: unless-stopped`
      // would just relaunch into the same message on a loop) so
      // `podman ps` shows a clean "Up", and the log states exactly what's
      // missing and where it comes from.
      console.log(
        `[${config.identity}] identities/${config.identity}.js does not exist yet — ` +
          `see prompts/agents/0${identityPromptNumber(config.identity)}_01_*.md. Waiting.`,
      );
      return null;
    }
    throw err;
  }
}

function identityPromptNumber(identity) {
  return { "agent-a": 2, "agent-b": 3, "agent-c": 4, "agent-d": 5 }[identity];
}

async function main() {
  const identity = await loadIdentity();
  if (!identity) {
    // A bare unresolved Promise does NOT keep Node's event loop alive —
    // found live: with no active timer/handle, the process exits
    // cleanly once the microtask queue drains, and `restart:
    // unless-stopped` just relaunched it into the same log line on a
    // tight loop instead of actually parking. An interval is a real
    // event-loop handle, so this genuinely waits — and doubles as the
    // heartbeat, so the container still reports healthy while waiting.
    beat();
    setInterval(beat, 5000);
    return;
  }

  if (config.identity === "agent-d") {
    await startObserverRuntime(identity, { signal: controller.signal });
  } else {
    // v2 (prompts/v2/02_04): runs beside runtime.js's existing v1 loop,
    // not instead of it — "add beside v1, not inside v1" applies at the
    // agent level too. Each only ever has real work when the backend's
    // own workflow_mode actually routes to it; both are always running.
    await Promise.all([
      startTaskRuntime(identity, { signal: controller.signal }),
      startDagWorker({ signal: controller.signal }),
    ]);
  }
}

main().catch((err) => {
  console.error(`[${config.identity}] fatal error:`, err);
  process.exit(1);
});
