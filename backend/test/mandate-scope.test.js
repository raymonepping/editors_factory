// test/mandate-scope.test.js — harmful mutations that stay WITHIN a
// legitimately granted permission (backend/src/mandate.js,
// migrations/013_credential_mandates.sql).
//
// Before the mandate existed, the GOOD corrector's permission was "change
// any order's status". Proven live: with a real delegation chain and a real
// 2-minute factory-good-role credential, agent-c set order 2 (fulfilled, in
// no task) to `cancelled` — 200, recorded, unflagged by Agent D.
//
// These tests pin the three layers that now bound it — backend policy,
// PostgreSQL itself, a Vault Control Group for exceptions — plus Agent D's
// detection, and that the BAD profile still shows the flaw.
//
// Order data matters here, so run with the LLM agents paused:
//   make test-mandate      (pauses agent-a/b/c, runs this file, resumes them)

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  apiFetch,
  CLI_TOKEN,
  AGENT_A_TOKEN,
  AGENT_B_TOKEN,
  AGENT_C_TOKEN,
} from "./helpers/env.js";

/** psql inside factory-postgres, as the admin user; SQL on stdin. */
function psql(sql) {
  return execFileSync(
    "podman",
    [
      "exec",
      "-i",
      "factory-postgres",
      "sh",
      "-c",
      'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1',
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const orderStatus = (id) => psql(`SELECT status FROM orders WHERE id = ${id};`);

const cli = (path, body, method = "POST") =>
  apiFetch(path, { method, cliToken: CLI_TOKEN, body });
const jwt = async (staticToken) =>
  (
    await apiFetch("/api/v1/agents/token", {
      method: "POST",
      token: staticToken,
    })
  ).data.token;

/** A real delegation chain (human -> A -> B -> C) under the given profile; returns C's JWT. */
async function correctorFor(profile) {
  assert.equal((await cli("/api/demo/mode", { profile }, "PUT")).status, 200);
  assert.equal((await cli("/api/demo/reset", {})).status, 200);
  psql(
    `UPDATE orders SET status = CASE id WHEN 2 THEN 'fulfilled' WHEN 6 THEN 'inconsistent' WHEN 9 THEN 'inconsistent' ELSE status END WHERE id IN (2, 6, 9);`,
  );
  assert.equal(
    (
      await cli("/api/agents/agent-a/tasks", {
        goal: "Investigate inconsistent orders",
      })
    ).status,
    201,
  );
  const a = await jwt(AGENT_A_TOKEN);
  assert.equal(
    (
      await apiFetch("/api/delegations", {
        method: "POST",
        token: a,
        body: {
          goal: "Investigate inconsistent orders",
          authorityEnvelope: ["orders.read"],
        },
      })
    ).status,
    201,
  );
  const b = await jwt(AGENT_B_TOKEN);
  assert.equal(
    (
      await apiFetch("/api/delegations", {
        method: "POST",
        token: b,
        body: {
          goal: "Remediate the inconsistent orders",
          authorityEnvelope: [
            "orders.read",
            "orders.update_status",
            "credential.request",
          ],
        },
      })
    ).status,
    201,
  );
  return jwt(AGENT_C_TOKEN);
}

const patchStatus = (token, id, status) =>
  apiFetch(`/api/actions/orders/${id}/status`, {
    method: "PATCH",
    token,
    body: { status },
  });

/** Agent D writes findings asynchronously: each is narrated by the local LLM first, which can take minutes on a busy model. Poll for one. */
async function waitForFinding(pattern, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = psql(
      `SELECT title FROM findings WHERE title ~ '${pattern}' LIMIT 1;`,
    );
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

describe("mandate: harmful changes within a granted permission", () => {
  after(async () => {
    await cli("/api/demo/mode", { profile: "good" }, "PUT");
    await cli("/api/demo/reset", {});
    psql(
      `UPDATE orders SET status = CASE id WHEN 2 THEN 'fulfilled' WHEN 6 THEN 'inconsistent' WHEN 9 THEN 'inconsistent' ELSE status END WHERE id IN (2, 6, 9);`,
    );
  });

  describe("GOOD profile", () => {
    let c;
    let credential;
    before(async () => {
      c = await correctorFor("good");
      const r = await apiFetch("/api/credentials", {
        method: "POST",
        token: c,
      });
      assert.equal(r.status, 201);
      credential = r.data;
    });

    test("the credential comes with a mandate: the task's inconsistent orders -> quarantined, nothing else", () => {
      assert.equal(credential.role, "factory-good-role");
      const inconsistent = psql(
        "SELECT string_agg(id::text, ',' ORDER BY id) FROM orders WHERE status = 'inconsistent';",
      )
        .split(",")
        .map(Number);
      assert.deepEqual(
        credential.mandate.map((m) => m.orderId),
        inconsistent,
      );
      for (const m of credential.mandate) {
        assert.equal(m.from, "inconsistent");
        assert.equal(m.to, "quarantined");
      }
      assert.ok(
        !credential.mandate.some((m) => m.orderId === 2),
        "order 2 is not in the task",
      );
    });

    test("in-mandate change works: order 6 inconsistent -> quarantined", async () => {
      const r = await patchStatus(c, 6, "quarantined");
      assert.equal(r.status, 200);
      assert.equal(orderStatus(6), "quarantined");
      const change = psql(
        `SELECT (before->>'status') || '->' || (after->>'status') FROM database_changes WHERE table_name = 'orders' AND after->>'id' = '6' ORDER BY timestamp DESC LIMIT 1;`,
      );
      assert.equal(change, "inconsistent->quarantined");
    });

    test("an order outside the task is refused: order 2 fulfilled -> cancelled", async () => {
      const r = await patchStatus(c, 2, "cancelled");
      assert.equal(r.status, 403);
      assert.equal(r.data.error, "outside_mandate");
      assert.equal(r.data.order.status, "fulfilled");
      assert.ok(
        Array.isArray(r.data.mandate) && r.data.mandate.length > 0,
        "the refusal lists what IS allowed",
      );
      assert.match(r.data.exception, /human must authorize/);
      assert.equal(orderStatus(2), "fulfilled", "nothing changed");
      const decision = psql(
        `SELECT policy_result || ':' || reason FROM authority_decisions WHERE requested_action = 'orders.update_status' AND policy_result = 'DENY' ORDER BY timestamp DESC LIMIT 1;`,
      );
      assert.match(
        decision,
        /^DENY:outside_mandate: order 2 fulfilled -> cancelled/,
      );
    });

    test("an in-scope order with the wrong transition is refused: order 9 inconsistent -> fulfilled", async () => {
      const r = await patchStatus(c, 9, "fulfilled");
      assert.equal(r.status, 403);
      assert.equal(r.data.error, "outside_mandate");
      assert.equal(orderStatus(9), "inconsistent");
    });

    test("Agent D marks the refusal as contained (D-010)", async () => {
      assert.ok(await waitForFinding("^D-010"), "expected a D-010 finding");
    });
  });

  describe("PostgreSQL enforces the mandate on its own (backend bypassed)", () => {
    const login = `mandate_probe_${process.pid}`;
    after(() => {
      psql(`DELETE FROM credential_mandates WHERE db_user = '${login}'; DROP OWNED BY ${login}; DROP ROLE IF EXISTS ${login};
            UPDATE orders SET status = 'fulfilled' WHERE id = 2;`);
    });

    test("a bound login without a mandate row is refused by set_order_status itself", () => {
      psql(`DROP ROLE IF EXISTS ${login};
            CREATE ROLE ${login} LOGIN IN ROLE factory_bound_corrector;
            GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${login};
            GRANT EXECUTE ON FUNCTION set_order_status(integer, text) TO ${login};`);
      assert.throws(
        () =>
          psql(
            `SET SESSION AUTHORIZATION ${login}; SELECT status FROM set_order_status(2, 'cancelled');`,
          ),
        /outside mandate: order 2 may not change from fulfilled to cancelled/,
      );
      assert.equal(orderStatus(2), "fulfilled");
    });

    test("the same login with a matching mandate row may make exactly that change", () => {
      psql(`INSERT INTO credential_mandates (db_user, order_id, from_status, to_status)
            VALUES ('${login}', 2, 'fulfilled', 'cancelled');`);
      const out = psql(
        `SET SESSION AUTHORIZATION ${login}; SELECT status FROM set_order_status(2, 'cancelled');`,
      );
      assert.equal(out.split("\n").pop(), "cancelled");
    });
  });

  describe("exception: a human authorizes the out-of-mandate change in Vault", () => {
    let c;
    let approvalId;
    before(async () => {
      c = await correctorFor("good");
    });

    test("asking for order 2 -> cancelled is withheld by Vault pending approval", async () => {
      const r = await apiFetch("/api/credentials", {
        method: "POST",
        token: c,
        body: {
          exception: {
            orderId: 2,
            toStatus: "cancelled",
            reason: "Customer asked to cancel; order was never shipped",
          },
        },
      });
      assert.equal(r.status, 202);
      assert.equal(r.data.status, "pending_approval");
      assert.deepEqual(
        { ...r.data.exception, reason: undefined },
        { orderId: 2, from: "fulfilled", to: "cancelled", reason: undefined },
      );
      approvalId = r.data.approvalId;
      assert.equal(orderStatus(2), "fulfilled");
    });

    test("the human approves in Vault; the credential's mandate now includes the exception", async () => {
      const r = await cli(
        `/api/credentials/pending/${approvalId}/authorize`,
        {},
      );
      assert.equal(r.status, 200);
      assert.equal(r.data.authorized, true);
      const exception = r.data.mandate.find((m) => m.orderId === 2);
      assert.deepEqual(
        {
          from: exception.from,
          to: exception.to,
          grantedVia: exception.grantedVia,
        },
        { from: "fulfilled", to: "cancelled", grantedVia: "control_group" },
      );
    });

    test("the approved change now succeeds, and Agent D flags it for review (D-009)", async () => {
      const r = await patchStatus(c, 2, "cancelled");
      assert.equal(r.status, 200);
      assert.equal(orderStatus(2), "cancelled");
      assert.ok(
        await waitForFinding("^D-009.*order 2 fulfilled -> cancelled"),
        "expected a D-009 finding",
      );
    });
  });

  describe("BAD profile still shows the flaw", () => {
    test("the overprivileged corrector cancels order 2 unchecked; Agent D flags it (D-009)", async () => {
      const c = await correctorFor("bad");
      assert.equal(
        (await apiFetch("/api/credentials", { method: "POST", token: c }))
          .status,
        201,
      );
      const r = await patchStatus(c, 2, "cancelled");
      assert.equal(r.status, 200);
      assert.equal(orderStatus(2), "cancelled");
      assert.ok(
        await waitForFinding("^D-009.*order 2 fulfilled -> cancelled"),
        "expected a D-009 finding",
      );
    });
  });
});
