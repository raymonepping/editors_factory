// test/agent-identity.test.js — Wave 8 adversarial tests for Wave 6's
// agent identity migration (docs/validation/ADR_001_agent_api_identity.md).
// Deterministic and fast: no LLM call is needed anywhere here — a task
// exists in backend/src/state.js the instant POST
// /api/agents/agent-a/tasks returns, regardless of whether the agent-a
// container has picked it up and reasoned about it yet, so these tests
// mint and use real JWTs against real backend state without waiting on
// Ollama (section 17's own "do not rely on an LLM producing the same
// text every run").

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, CLI_TOKEN, AGENT_A_TOKEN, AGENT_C_TOKEN } from "./helpers/env.js";

describe("agent-identity: JWT bootstrap and verification boundaries", () => {
  // Every real POST /api/agents/agent-a/tasks below is picked up by the
  // ACTUAL running agent-a container over its normal SSE subscription —
  // there is no isolated test double, this project runs no mocks
  // anywhere (input/PROJECT.md's own "Real" principle). A final reset
  // both restores clean demo state and stops those fake-goal tasks from
  // lingering as agent-a's "active task" once the suite finishes.
  after(async () => {
    await apiFetch("/api/demo/reset", { method: "POST", cliToken: CLI_TOKEN });
  });

  before(async () => {
    assert.ok(CLI_TOKEN, "FACTORY_CLI_OPERATOR_TOKEN must be set in .env");
    assert.ok(AGENT_A_TOKEN, "AGENT_A_TOKEN must be set in .env");
    assert.ok(AGENT_C_TOKEN, "AGENT_C_TOKEN must be set in .env");
    const reset = await apiFetch("/api/demo/reset", { method: "POST", cliToken: CLI_TOKEN });
    assert.equal(reset.status, 200);
  });

  test("bootstrap rejects a wrong static token", async () => {
    const { status } = await apiFetch("/api/v1/agents/token", {
      method: "POST",
      token: "not-a-real-agent-token",
    });
    assert.equal(status, 401);
  });

  test("bootstrap rejects an agent with no active task", async () => {
    // Fresh reset, nothing delegated yet — agent-c has no active task.
    const { status, data } = await apiFetch("/api/v1/agents/token", {
      method: "POST",
      token: AGENT_C_TOKEN,
    });
    assert.equal(status, 400);
    assert.match(data.error, /no active task/);
  });

  test("a real task-bound JWT authenticates a tool call", async () => {
    const created = await apiFetch("/api/agents/agent-a/tasks", {
      method: "POST",
      cliToken: CLI_TOKEN,
      body: { goal: "adversarial test task" },
    });
    assert.equal(created.status, 201);

    const bootstrap = await apiFetch("/api/v1/agents/token", {
      method: "POST",
      token: AGENT_A_TOKEN,
    });
    assert.equal(bootstrap.status, 200);
    assert.ok(bootstrap.data.token);

    const call = await apiFetch("/api/actions/health", {
      token: bootstrap.data.token,
    });
    assert.equal(call.status, 200);
  });

  test("the static token no longer works on an ordinary tool route (Wave 6's central claim)", async () => {
    const { status } = await apiFetch("/api/actions/health", {
      token: AGENT_A_TOKEN,
    });
    assert.equal(status, 401);
  });

  test("a malformed JWT is rejected", async () => {
    const { status } = await apiFetch("/api/actions/health", {
      token: "not.a.jwt",
    });
    assert.equal(status, 401);
  });

  test("a JWT with a tampered signature is rejected", async () => {
    const created = await apiFetch("/api/agents/agent-a/tasks", {
      method: "POST",
      cliToken: CLI_TOKEN,
      body: { goal: "tamper test" },
    });
    assert.equal(created.status, 201);
    const bootstrap = await apiFetch("/api/v1/agents/token", {
      method: "POST",
      token: AGENT_A_TOKEN,
    });
    const parts = bootstrap.data.token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}${parts[2].at(-1) === "A" ? "B" : "A"}`;
    const { status } = await apiFetch("/api/actions/health", { token: tampered });
    assert.equal(status, 401);
  });

  test("a token bound to agent-a cannot call an agent-c-only route (policy still enforces identity)", async () => {
    const created = await apiFetch("/api/agents/agent-a/tasks", {
      method: "POST",
      cliToken: CLI_TOKEN,
      body: { goal: "cross-identity test" },
    });
    assert.equal(created.status, 201);
    const bootstrap = await apiFetch("/api/v1/agents/token", {
      method: "POST",
      token: AGENT_A_TOKEN,
    });
    const { status } = await apiFetch("/api/credentials", {
      method: "POST",
      token: bootstrap.data.token,
    });
    assert.equal(status, 403);
  });

  test("a JWT stops working the instant its task is cleared (reset) — structural revocation", async () => {
    const created = await apiFetch("/api/agents/agent-a/tasks", {
      method: "POST",
      cliToken: CLI_TOKEN,
      body: { goal: "revocation test" },
    });
    assert.equal(created.status, 201);
    const bootstrap = await apiFetch("/api/v1/agents/token", {
      method: "POST",
      token: AGENT_A_TOKEN,
    });
    assert.equal(bootstrap.status, 200);

    const stillValid = await apiFetch("/api/actions/health", {
      token: bootstrap.data.token,
    });
    assert.equal(stillValid.status, 200);

    const reset = await apiFetch("/api/demo/reset", {
      method: "POST",
      cliToken: CLI_TOKEN,
    });
    assert.equal(reset.status, 200);

    const afterReset = await apiFetch("/api/actions/health", {
      token: bootstrap.data.token,
    });
    assert.equal(afterReset.status, 401);
  });
});
