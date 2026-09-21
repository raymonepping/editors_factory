// src/state.js — in-process runtime state: the active demo profile,
// live task/delegation tracking, and Agent C's currently-active Vault
// credential. Deliberately in-memory (no Redis/queue — input/08.md);
// this is a single-process control plane and `make reset` clears it
// alongside the database.

import { config } from "./config.js";

let currentProfile = config.demo.defaultProfile;
let currentRunId = null;

export function getProfile() {
  return currentProfile;
}

export function setProfile(profile) {
  if (profile !== "bad" && profile !== "good") {
    throw new Error(`Invalid profile: ${profile}`);
  }
  currentProfile = profile;
}

export function getCurrentRunId() {
  return currentRunId;
}

export function setCurrentRunId(runId) {
  currentRunId = runId;
}

// taskId -> { actorId, delegatedBy, delegationDepth, effectiveAuthority, traceId, parentTaskId, goal }
const tasks = new Map();

// actorId -> its most recently assigned taskId. Wave 4 (causal tracing):
// a tool-call route only ever has req.actorId (from agentAuth) — the
// agent-to-API wire protocol has no taskId parameter on any tool call
// (agents/src/tools.js), and adding one would touch every agent identity
// and tool schema. This demo only ever runs one task per actor at a time
// (the fixed A -> B -> C chain, one hop each), so "most recently assigned"
// is an accurate, not approximate, way to recover the causal context a
// tool call belongs to without changing that protocol.
const actorToTaskId = new Map();

export function createTask({
  taskId,
  actorId,
  delegatedBy,
  delegationDepth,
  effectiveAuthority,
  traceId,
  parentTaskId,
  goal,
}) {
  const task = {
    taskId,
    actorId,
    delegatedBy,
    delegationDepth,
    effectiveAuthority,
    traceId,
    parentTaskId,
    goal,
  };
  tasks.set(taskId, task);
  actorToTaskId.set(actorId, taskId);
  return task;
}

export function getTask(taskId) {
  return tasks.get(taskId) || null;
}

/**
 * Prompt 01.02 Phase 2: removes one task from active state (its own
 * terminal boundary — task completion — distinct from clearTasks()'s
 * whole-board clear on reset/profile-switch). Any JWT bound to this
 * task_id stops being honored immediately afterward — agentJwtAuth's own
 * check reads state.getTask(claims.task_id), and this makes that return
 * null, the same structural-revocation mechanism Wave 6 already relies
 * on, not a new one. Only clears the actor's "current task" pointer if
 * it still points at THIS task — a newer task for the same actor must
 * not be clobbered by a late completion report for an older one.
 */
export function completeTask(taskId) {
  const task = tasks.get(taskId);
  if (!task) return null;
  tasks.delete(taskId);
  if (actorToTaskId.get(task.actorId) === taskId) {
    actorToTaskId.delete(task.actorId);
  }
  return task;
}

/** The causal context (trace_id/task_id/delegated_by) for actorId's
 * currently active task, or all-null fields if it has none — callers
 * spread this directly into an audit.record*() call rather than
 * branching on presence. delegatedBy is createTask()'s own field —
 * the human user identifier for agent-a's own first task, or the
 * upstream agent's actorId for every later delegation — added to this
 * return value in prompts/improvements/01_08_agentic_iam_inspired_hardening.md
 * Phase 3 so it can be threaded into the task-bound JWT. */
export function getCausalContext(actorId) {
  const taskId = actorToTaskId.get(actorId) || null;
  const task = taskId ? tasks.get(taskId) : null;
  return {
    taskId,
    traceId: task?.traceId ?? null,
    delegatedBy: task?.delegatedBy ?? null,
  };
}

export function clearTasks() {
  tasks.clear();
  actorToTaskId.clear();
}

// agent-c's currently active Vault-issued credential, set by
// POST /api/credentials, consumed by mutating /api/actions/* calls, and
// cleared by make reset (via the backend's own reset handler).
let activeAgentCCredential = null;

// Wave 2.5 (prompts/improvements/01_01_improvement.md section 11.5): the
// renewal interval for the currently active credential, if one has been
// started (services/revocation.js's startCredentialRenewal). Stored here,
// not in revocation.js, so the ONE existing choke point every terminal
// boundary already calls — clearActiveAgentCCredential(), reached by
// task completion, policy-denial cleanup, profile switch, and reset alike
// — also always stops it, rather than requiring each of those four call
// sites to separately remember to.
let renewalTimer = null;

export function setActiveAgentCCredential(cred) {
  activeAgentCCredential = cred;
}

export function getActiveAgentCCredential() {
  return activeAgentCCredential;
}

export function setRenewalTimer(timer) {
  if (renewalTimer) clearInterval(renewalTimer);
  renewalTimer = timer;
}

export function clearActiveAgentCCredential() {
  activeAgentCCredential = null;
  if (renewalTimer) {
    clearInterval(renewalTimer);
    renewalTimer = null;
  }
}
