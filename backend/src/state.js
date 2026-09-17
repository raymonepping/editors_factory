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
  return task;
}

export function getTask(taskId) {
  return tasks.get(taskId) || null;
}

export function clearTasks() {
  tasks.clear();
}

// agent-c's currently active Vault-issued credential, set by
// POST /api/credentials, consumed by mutating /api/actions/* calls, and
// cleared by make reset (via the backend's own reset handler).
let activeAgentCCredential = null;

export function setActiveAgentCCredential(cred) {
  activeAgentCCredential = cred;
}

export function getActiveAgentCCredential() {
  return activeAgentCCredential;
}

export function clearActiveAgentCCredential() {
  activeAgentCCredential = null;
}
