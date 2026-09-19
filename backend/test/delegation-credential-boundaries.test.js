// test/delegation-credential-boundaries.test.js — Wave 8: the
// delegation-route and credential-broker boundaries from section 17 of
// prompts/improvements/01_01_improvement.md that don't require an LLM to
// exercise deterministically.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, CLI_TOKEN, AGENT_A_TOKEN, AGENT_C_TOKEN } from "./helpers/env.js";

async function bootstrapFor(actorToken, { goal = "boundary test" } = {}) {
  const created = await apiFetch("/api/agents/agent-a/tasks", {
    method: "POST",
    cliToken: CLI_TOKEN,
    body: { goal },
  });
  assert.equal(created.status, 201);
  const bootstrap = await apiFetch("/api/v1/agents/token", {
    method: "POST",
    token: actorToken,
  });
  assert.equal(bootstrap.status, 200);
  return bootstrap.data.token;
}

describe("delegation and credential boundaries", () => {
  before(async () => {
    const reset = await apiFetch("/api/demo/reset", { method: "POST", cliToken: CLI_TOKEN });
    assert.equal(reset.status, 200);
  });

  after(async () => {
    await apiFetch("/api/demo/reset", { method: "POST", cliToken: CLI_TOKEN });
  });

  test("POST /api/delegations with no auth -> 401", async () => {
    const { status } = await apiFetch("/api/delegations", {
      method: "POST",
      body: { goal: "x", authorityEnvelope: [] },
    });
    assert.equal(status, 401);
  });

  test("agent-a's own JWT can reach /api/delegations as its own identity (route is authenticated, not yet policy-checked here)", async () => {
    const token = await bootstrapFor(AGENT_A_TOKEN);
    const { status } = await apiFetch("/api/delegations", {
      method: "POST",
      token,
      body: { goal: "delegate onward", authorityEnvelope: ["orders.read"] },
    });
    // agent-a -> agent-b is an allowed hop (ALLOWED_DELEGATIONS in
    // routes/delegations.js) — this should succeed, proving identity
    // flows correctly from a Wave 6 JWT into a route that never accepted
    // the static token at all even before this wave existed.
    assert.equal(status, 201);
  });

  test("agent-c has no path to /api/delegations at all without an active task of its own", async () => {
    // agent-c only ever receives a task via a real agent-b delegation —
    // nothing in this fresh-reset state has given it one, so it cannot
    // even obtain a JWT to attempt an illegal delegation with (its
    // eventual attempt would additionally be blocked by
    // ALLOWED_DELEGATIONS not listing it, but this boundary — no
    // bootstrap, no call at all — is the first one reached, and is
    // exactly the "child task lacks a valid parent" case section 17
    // asks for, from the opposite direction: no parent, no token).
    const bootstrap = await apiFetch("/api/v1/agents/token", {
      method: "POST",
      token: AGENT_C_TOKEN,
    });
    assert.equal(bootstrap.status, 400);
  });

  test("agent-a may not request a database credential -> 403", async () => {
    const token = await bootstrapFor(AGENT_A_TOKEN);
    const { status } = await apiFetch("/api/credentials", {
      method: "POST",
      token,
    });
    assert.equal(status, 403);
  });

  test("POST /api/credentials with no auth -> 401", async () => {
    const { status } = await apiFetch("/api/credentials", { method: "POST" });
    assert.equal(status, 401);
  });
});
