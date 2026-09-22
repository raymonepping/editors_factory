// test/v2-dag-acceptance.test.js — prompts/v2/02_07's own acceptance
// criteria, driven deterministically via direct claim/complete API calls
// rather than waiting on real Ollama inference (agents/src/dagWorker.js
// does the same claim/heartbeat/complete round trip live — this exercises
// the identical backend contract, just without a model in the loop,
// matching this suite's own established "real integration, not mocked,
// but not dependent on model choice either" philosophy — see
// delegation-credential-boundaries.test.js's own bootstrapFor()).
//
// Scope note: 02_07's Scenario 1 correction ("BAD role retains DELETE
// capability, checkable statically from the Vault DB role's granted
// statements") is a genuinely live-checkable claim, but only from inside
// Vault's own API with the vault-admin token and this project's TLS
// trust chain — a different connectivity shape than every other test
// here, which only ever talks to factory-api's HTTP surface. Not worth
// adding a second test-environment client for one assertion; it stays a
// documented manual check (docs/operations.md's own `vault read
// database/roles/factory-bad-role`), not encoded here.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  apiFetch,
  CLI_TOKEN,
  AGENT_A_TOKEN,
  AGENT_B_TOKEN,
  AGENT_C_TOKEN,
} from "./helpers/env.js";

async function setWorkflowMode(mode) {
  return apiFetch("/api/demo/workflow-mode", {
    method: "PUT",
    cliToken: CLI_TOKEN,
    body: { workflowMode: mode },
  });
}

async function resetRun() {
  const res = await apiFetch("/api/demo/reset", {
    method: "POST",
    cliToken: CLI_TOKEN,
  });
  assert.equal(res.status, 200);
  return res.data.runId;
}

async function initDagRun() {
  const res = await apiFetch("/api/dag/runs", {
    method: "POST",
    cliToken: CLI_TOKEN,
  });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data;
}

async function getDagRun(runId) {
  const res = await apiFetch(`/api/dag/runs/${runId}`, { cliToken: CLI_TOKEN });
  assert.equal(res.status, 200);
  return res.data;
}

/** Claims whatever this token's role has runnable and completes it immediately. */
async function claimAndComplete(token, outputEvidence = {}) {
  const claim = await apiFetch("/api/dag/tasks/claim", {
    method: "POST",
    token,
  });
  assert.equal(claim.status, 200, "expected something runnable to claim");
  const { nodeId, attemptId, attemptToken } = claim.data;
  const complete = await apiFetch(
    `/api/dag/tasks/${nodeId}/attempts/${attemptId}/complete`,
    { method: "POST", token: attemptToken, body: { outputEvidence } },
  );
  assert.equal(complete.status, 200);
  return claim.data;
}

describe("v2: workflow-mode switch contract (mirrors PUT /demo/mode's own coverage)", () => {
  before(async () => {
    await resetRun();
  });
  after(async () => {
    await setWorkflowMode("fixed_chain");
    await resetRun();
  });

  test("PUT /api/demo/workflow-mode with no auth -> 401", async () => {
    const res = await apiFetch("/api/demo/workflow-mode", {
      method: "PUT",
      body: { workflowMode: "recoverable_dag" },
    });
    assert.equal(res.status, 401);
  });

  test("PUT /api/demo/workflow-mode with a forged Bearer token -> 401", async () => {
    const res = await apiFetch("/api/demo/workflow-mode", {
      method: "PUT",
      token: "this-is-not-a-real-credential",
      body: { workflowMode: "recoverable_dag" },
    });
    assert.equal(res.status, 401);
  });

  test("PUT /api/demo/workflow-mode with the wrong CLI token -> 401", async () => {
    const res = await apiFetch("/api/demo/workflow-mode", {
      method: "PUT",
      cliToken: "wrong-value-entirely",
      body: { workflowMode: "recoverable_dag" },
    });
    assert.equal(res.status, 401);
  });

  test("PUT /api/demo/workflow-mode rejects 409 while a v2 DAG run is in progress", async () => {
    const set = await setWorkflowMode("recoverable_dag");
    assert.equal(set.status, 200);
    const runId = await resetRun();
    await initDagRun();

    const blocked = await setWorkflowMode("fixed_chain");
    assert.equal(blocked.status, 409);

    // Drain the run so the after() hook's own reset isn't fighting an
    // in-progress run — triage/investigate/remediate all complete,
    // notify/verify execute automatically (backend-internal).
    await claimAndComplete(AGENT_A_TOKEN);
    await claimAndComplete(AGENT_B_TOKEN);
    await claimAndComplete(AGENT_C_TOKEN);
    const finalState = await getDagRun(runId);
    assert.equal(finalState.run.status, "completed");
  });
});

describe("v2: run-status transitions follow node state, not asserted in isolation", () => {
  before(async () => {
    await setWorkflowMode("recoverable_dag");
  });
  after(async () => {
    await setWorkflowMode("fixed_chain");
    await resetRun();
  });

  test("dag_runs.status reaches 'completed' only once verify (the sink node) is 'completed'", async () => {
    const runId = await resetRun();
    const topology = await initDagRun();
    assert.equal(topology.run.status, "running");
    const verifyBefore = topology.nodes.find((n) => n.node_key === "verify");
    assert.notEqual(verifyBefore.status, "completed");

    await claimAndComplete(AGENT_A_TOKEN, { report: "triage done" });
    let state = await getDagRun(runId);
    assert.equal(
      state.run.status,
      "running",
      "must not complete before verify does",
    );

    await claimAndComplete(AGENT_B_TOKEN, { report: "investigate done" });
    state = await getDagRun(runId);
    assert.equal(state.run.status, "running");
    // investigate completing fans out to remediate (agent-claimable) AND
    // notify (backend-internal, auto-executed) — notify alone must not
    // complete the run; verify still depends on remediate too.
    const notify = state.nodes.find((n) => n.node_key === "notify");
    assert.equal(notify.status, "completed");
    assert.equal(state.run.status, "running");

    await claimAndComplete(AGENT_C_TOKEN, { report: "remediate done" });
    state = await getDagRun(runId);
    const verify = state.nodes.find((n) => n.node_key === "verify");
    assert.equal(verify.status, "completed");
    assert.equal(state.run.status, "completed");
  });

  test("dag_runs.status reaches 'failed' only when a node exhausts retries with no path to verify", async () => {
    const runId = await resetRun();
    await initDagRun();

    const claim = await apiFetch("/api/dag/tasks/claim", {
      method: "POST",
      token: AGENT_A_TOKEN,
    });
    assert.equal(claim.status, 200);
    const fail = await apiFetch(
      `/api/dag/tasks/${claim.data.nodeId}/attempts/${claim.data.attemptId}/fail`,
      {
        method: "POST",
        token: claim.data.attemptToken,
        body: { errorDetails: { message: "deliberate test failure" } },
      },
    );
    assert.equal(fail.status, 200);

    const state = await getDagRun(runId);
    assert.equal(state.run.status, "failed");
    const triage = state.nodes.find((n) => n.node_key === "triage");
    assert.equal(triage.status, "failed");
  });
});

describe("v2: retry issues a fresh credential and business-effect idempotency prevents a duplicate mutation", () => {
  before(async () => {
    await setWorkflowMode("recoverable_dag");
  });
  after(async () => {
    await setWorkflowMode("fixed_chain");
    await resetRun();
  });

  test("attempt_number > 1 bypasses Control Groups and business_effect_key prevents re-mutation", async () => {
    const runId = await resetRun();
    await initDagRun();
    await claimAndComplete(AGENT_A_TOKEN);
    await claimAndComplete(AGENT_B_TOKEN);

    // Claim remediate (attempt 1), fail it deliberately (no mutation
    // attempted), retry, then claim attempt 2 and mutate for real.
    const claim1 = await apiFetch("/api/dag/tasks/claim", {
      method: "POST",
      token: AGENT_C_TOKEN,
    });
    assert.equal(claim1.status, 200);
    assert.equal(claim1.data.attemptNumber, 1);
    await apiFetch(
      `/api/dag/tasks/${claim1.data.nodeId}/attempts/${claim1.data.attemptId}/fail`,
      {
        method: "POST",
        token: claim1.data.attemptToken,
        body: { errorDetails: { message: "deliberate test failure" } },
      },
    );

    const retry = await apiFetch(
      `/api/dag/runs/${runId}/nodes/remediate/retry`,
      { method: "POST", cliToken: CLI_TOKEN },
    );
    assert.equal(retry.status, 200);

    const claim2 = await apiFetch("/api/dag/tasks/claim", {
      method: "POST",
      token: AGENT_C_TOKEN,
    });
    assert.equal(claim2.status, 200);
    assert.equal(claim2.data.attemptNumber, 2);

    const cred1 = await apiFetch("/api/credentials", {
      method: "POST",
      token: claim2.data.attemptToken,
    });
    assert.equal(cred1.status, 201);
    assert.equal(
      cred1.data.attemptNumber,
      2,
      "attempt 2 issued directly, not routed to Control Groups",
    );

    const mutate1 = await apiFetch("/api/actions/orders/1/status", {
      method: "PATCH",
      token: claim2.data.attemptToken,
      body: { status: "quarantined" },
    });
    assert.equal(mutate1.status, 200);
    const firstUpdatedAt = mutate1.data.updated_at;

    // Repeat the identical mutation as if a second, slower attempt-2
    // retry arrived — the business-effect ledger (same run/node/
    // operation/target/payload) must intercept it, not the database.
    const mutate2 = await apiFetch("/api/actions/orders/1/status", {
      method: "PATCH",
      token: claim2.data.attemptToken,
      body: { status: "quarantined" },
    });
    assert.equal(mutate2.status, 200);
    assert.equal(
      mutate2.data.updated_at,
      firstUpdatedAt,
      "the mutation must not have re-executed — updated_at must be identical",
    );

    await apiFetch(
      `/api/dag/tasks/${claim2.data.nodeId}/attempts/${claim2.data.attemptId}/complete`,
      {
        method: "POST",
        token: claim2.data.attemptToken,
        body: { outputEvidence: {} },
      },
    );
  });
});
