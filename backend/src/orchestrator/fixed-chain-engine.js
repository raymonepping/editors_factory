// src/orchestrator/fixed-chain-engine.js — v2's contract completion for
// v1. Registers under workflow_mode="fixed_chain" so orchestrator/index.js's
// dispatcher is total (every mode has a registered engine), per 02_00.
//
// v1's own routes (routes/tasks.js, routes/delegations.js, audit.js,
// state.js) are NOT rewired through this — they are stable, tested, and
// "add beside v1, not inside v1" means leaving them alone, not forcing a
// new abstraction onto working code nothing asked to change. This module
// exists only so the registry is honest and complete; nothing in this
// backend currently calls its claimTask/retryNode/failAttempt — v1 has
// no claim-based queue, no attempts, and no retry concept at all, so
// those three intentionally reject rather than pretend to support
// something v1 was never built to do.

import { registerEngine } from "./index.js";
import * as audit from "../audit.js";
import * as state from "../state.js";

function unsupported(method) {
  const err = new Error(
    `${method} is not supported in fixed_chain mode — v1 has no DAG claim/retry model. Use recoverable_dag for this.`,
  );
  err.status = 400;
  return err;
}

const FixedChainEngine = {
  async startRun(demoRun) {
    // v1's run creation already happens directly in demo.js/tasks.js via
    // audit.startRun() — this exists only for registry completeness, so
    // it mirrors that exact behavior rather than duplicating a second
    // run-creation path.
    state.setCurrentRunId(demoRun.run_id);
    return { runId: demoRun.run_id };
  },
  async claimTask() {
    throw unsupported("claimTask");
  },
  async completeAttempt(taskId) {
    // Loose mapping onto v1's real completion primitive, for symmetry —
    // routes/tasks.js's own POST /tasks/:taskId/complete already does
    // this directly and is what agents actually call; not routed through
    // here.
    return state.completeTask(taskId);
  },
  async failAttempt() {
    throw unsupported("failAttempt");
  },
  async retryNode() {
    throw unsupported("retryNode");
  },
  async cancelRun(runId, reason) {
    await audit.endRun(runId, "reset");
    return { ok: true, reason };
  },
};

registerEngine("fixed_chain", FixedChainEngine);

export { FixedChainEngine };
