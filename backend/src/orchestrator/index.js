// src/orchestrator/index.js — v2 dual-engine orchestration contract
// (prompts/v2/02_00_v2_architecture_and_micro_dag_spec.md). Factory v1's
// existing fixed-chain delegation flow and v2's recoverable micro-DAG are
// both "workflow engines" implementing the same contract below, selected
// per run by demo_runs.workflow_mode — "add beside v1, not inside v1".
//
// Deliberate deviation from 02_00's own illustrative code sample: that
// prompt shows the contract as an ES `class BaseWorkflowEngine` with
// throwing stub methods. No other module in this backend uses `class`
// (see src/vault.js, src/services/revocation.js, src/state.js — all
// plain function exports); 02_00 itself offers "class inheritance or
// standard factory dispatch" as an explicit either/or, so this module
// follows the codebase's existing convention instead: a registry that
// structurally enforces the same six-method contract at registration
// time, rather than via inheritance.
//
// FixedChainEngine (wrapping v1's existing linear delegation) and
// RecoverableMicroDagEngine (backed by dag_runs/dag_nodes/dag_edges) are
// added in 02_02 — this module defines only the shared contract and the
// registry they plug into. Nothing here is wired into routes or startup
// yet; it exists beside v1, unused, until 02_02 imports it.

const REQUIRED_METHODS = Object.freeze([
  "startRun",
  "claimTask",
  "completeAttempt",
  "failAttempt",
  "retryNode",
  "cancelRun",
]);

// workflow_mode ("fixed_chain" | "recoverable_dag") -> engine instance
const engines = new Map();

/**
 * Registers a concrete engine implementation for a demo_runs.workflow_mode
 * value. Called once at module load by each engine module (02_02+).
 * Throws synchronously if the engine is missing any required method —
 * this is the structural equivalent of an abstract base class enforcing
 * its contract, without introducing `class` into this codebase.
 */
export function registerEngine(workflowMode, engine) {
  for (const method of REQUIRED_METHODS) {
    if (typeof engine[method] !== "function") {
      throw new Error(
        `Engine for workflow_mode="${workflowMode}" is missing required method "${method}"`,
      );
    }
  }
  engines.set(workflowMode, engine);
}

/**
 * Returns the registered engine for a given demo_runs.workflow_mode.
 * Callers (route handlers) should only reach this after all engine
 * modules have been imported at startup, once 02_02 adds them.
 */
export function getEngine(workflowMode) {
  const engine = engines.get(workflowMode);
  if (!engine) {
    throw new Error(
      `No workflow engine registered for workflow_mode="${workflowMode}"`,
    );
  }
  return engine;
}

/** True once an engine has been registered for the given mode. */
export function hasEngine(workflowMode) {
  return engines.has(workflowMode);
}

export { REQUIRED_METHODS };
