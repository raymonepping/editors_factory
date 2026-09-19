// test/human-boundary.test.js — Wave 8 (prompts/improvements/01_01_improvement.md):
// locks in the authorization-bypass fix found live in this same
// improvement cycle. requireHumanSession (auth/index.js) used to accept
// ANY non-empty `Authorization: Bearer` header, and separately granted
// full operator rights to any curl/node client on localhost, with zero
// real credential check either way — reset, profile switching, and task
// creation were reachable with no authentication at all. These tests
// exist so that regression is never silent again.
//
// Prerequisite: the real stack running (`make up`), reachable at
// http://localhost:3001 — see test/helpers/env.js's own comment on why
// these are real integration tests, not mocks.
//
// Every file under test/ shares ONE live backend's singleton state
// (one active run, one in-memory task map — backend/src/state.js has no
// per-test isolation by design, matching the single-flow-at-a-time demo
// itself). `npm test` therefore runs with `--test-concurrency=1` — found
// live running this suite twice in a row: Node's test runner executes
// separate files in parallel by default, and two files' concurrent
// /api/demo/reset calls raced real in-flight inserts, producing genuine
// foreign-key-violation 500s, not a flaky assertion. Do not run these
// files concurrently against the same running stack.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, CLI_TOKEN } from "./helpers/env.js";

describe("human-boundary: demo-control routes reject unauthenticated and forged requests", () => {
  const protectedRequests = [
    { method: "POST", path: "/api/demo/reset" },
    { method: "PUT", path: "/api/demo/mode", body: { profile: "good" } },
    {
      method: "POST",
      path: "/api/agents/agent-a/tasks",
      body: { goal: "test" },
    },
  ];

  for (const req of protectedRequests) {
    test(`${req.method} ${req.path} with no auth -> 401`, async () => {
      const { status } = await apiFetch(req.path, req);
      assert.equal(status, 401);
    });

    test(`${req.method} ${req.path} with a forged Bearer token -> 401`, async () => {
      const { status } = await apiFetch(req.path, {
        ...req,
        token: "this-is-not-a-real-credential",
      });
      assert.equal(status, 401);
    });

    test(`${req.method} ${req.path} with the wrong CLI token -> 401`, async () => {
      const { status } = await apiFetch(req.path, {
        ...req,
        cliToken: "wrong-value-entirely",
      });
      assert.equal(status, 401);
    });
  }

  test("POST /api/demo/reset with the real CLI token succeeds", async () => {
    assert.ok(
      CLI_TOKEN,
      "FACTORY_CLI_OPERATOR_TOKEN must be set in .env for this test",
    );
    const { status } = await apiFetch("/api/demo/reset", {
      method: "POST",
      cliToken: CLI_TOKEN,
    });
    assert.equal(status, 200);
  });
});
