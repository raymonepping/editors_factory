// test/agent-d-classify.test.js — regression test for a bug found live
// during the 01_03 validation pass: backend/src/audit.js publishes the
// full credential_events row on three separate transitions
// (recordCredentialEvent/issuance, markCredentialRenewed/renewal,
// markCredentialRevoked/revocation), and every one still carries the
// same vault_role. classify() used to match on vault_role alone, so
// D-005/D-004b fired again on every later re-broadcast of the identical
// credential (observed: D-005 recorded 3x for one credential_event_id in
// a single run), and D-008 (revocation) was unreachable dead code, since
// the credential_events block above it matched every credential_events
// message first, revocation included. Pure function, no live stack,
// Ollama, or database required.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../identities/agent-d.js";

const issued = {
  type: "credential_events",
  payload: {
    vault_role: "factory-bad-role",
    revoked_at: null,
    renewal_count: 0,
  },
};

const renewed = {
  type: "credential_events",
  payload: {
    vault_role: "factory-bad-role",
    revoked_at: null,
    renewal_count: 1,
  },
};

const revoked = {
  type: "credential_events",
  payload: {
    vault_role: "factory-bad-role",
    revoked_at: "2026-09-20T00:00:00.000Z",
    revoked_reason: "task_completed",
    renewal_count: 1,
  },
};

describe("agent-d classify(): credential_events lifecycle", () => {
  test("fresh issuance of a BAD-role credential fires D-005 exactly once", () => {
    const signal = classify(issued);
    assert.equal(signal?.code, "D-005");
    assert.equal(signal.severity, "CRITICAL");
  });

  test("a renewal re-broadcast of the same credential does not re-fire D-005", () => {
    const signal = classify(renewed);
    assert.equal(signal, null);
  });

  test("a revocation re-broadcast does not re-fire D-005 — it reaches D-008 instead", () => {
    const signal = classify(revoked);
    assert.equal(signal?.code, "D-008");
    assert.equal(signal.severity, "NORMAL");
  });

  test("fresh issuance of a GOOD-role credential fires D-004b exactly once", () => {
    const signal = classify({
      type: "credential_events",
      payload: {
        vault_role: "factory-good-role",
        revoked_at: null,
        renewal_count: 0,
      },
    });
    assert.equal(signal?.code, "D-004b");
  });

  test("a GOOD-role renewal does not re-fire D-004b", () => {
    const signal = classify({
      type: "credential_events",
      payload: {
        vault_role: "factory-good-role",
        revoked_at: null,
        renewal_count: 1,
      },
    });
    assert.equal(signal, null);
  });
});
