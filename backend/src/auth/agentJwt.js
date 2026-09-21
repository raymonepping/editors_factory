// auth/agentJwt.js — Wave 6 (prompts/improvements/01_01_improvement.md,
// ADR docs/validation/ADR_001_agent_api_identity.md): mints and verifies
// the short-lived, task-bound JWT that replaces a static per-agent
// bearer token as the credential an agent presents on every tool call,
// delegation, and credential request.
//
// Implemented directly on node:crypto (HMAC-SHA256) rather than adding a
// JWT library — the claim set is small and fixed, HS256 is the only
// algorithm this project will ever need (issuer and verifier are the
// same process), and backend/package.json's own lockfile was already
// found out of sync with a dependency Wave 7 added but never `npm
// install`-ed locally (docs/writing session) — this avoids repeating
// that. Deliberately does NOT implement or accept any algorithm other
// than HS256: there is no `alg` negotiation, so the classic "alg: none"
// JWT bypass has no code path to reach.

import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { config } from "../config.js";

const ISSUER = "factory-api";
const AUDIENCE = "factory-api";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function sign(data) {
  return base64url(
    createHmac("sha256", config.auth.agentJwtSecret).update(data).digest(),
  );
}

/**
 * Mints a JWT for one agent, bound to the run (and, for A/B/C, the task)
 * it was issued for. `taskId` is null for agent-d, which is never part
 * of the delegation chain and so never has one — see verifyAgentToken's
 * own comment on how each case is revoked.
 *
 * `delegatedBy` (prompts/improvements/01_08_agentic_iam_inspired_hardening.md
 * Phase 3) is additive and optional — state.js's own createTask() already
 * records it for every task (the human user identifier for agent-a's own
 * first task, the upstream agent's actorId for every later delegation),
 * this just threads that same value into the token so it becomes a
 * self-contained, verifiable claim about who this specific request
 * descends from, not only something reconstructable after the fact from
 * the delegations table. Never presented to Vault — see the article's
 * own "agent layer / task layer / Vault layer" account of why this stays
 * entirely at the backend.
 */
export function signAgentToken({
  actorId,
  runId,
  taskId,
  delegatedBy = null,
  ttlSeconds,
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: ISSUER,
    sub: actorId,
    aud: AUDIENCE,
    iat: now,
    exp: now + ttlSeconds,
    jti: randomUUID(),
    run_id: runId,
    task_id: taskId,
    delegated_by: delegatedBy,
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifies a JWT's structure, signature, issuer, audience, and expiry.
 * Throws a descriptive error on any failure; never returns a partial or
 * "trust anyway" result. Task/run-lifecycle revocation (does the bound
 * task or run still exist) is deliberately NOT checked here — that
 * requires backend/src/state.js, and this module stays free of that
 * dependency so it can be unit-tested in isolation; callers (agentJwtAuth
 * middleware) check it as a second step.
 */
export function verifyAgentToken(token) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [encodedHeader, encodedPayload, signature] = parts;

  let header;
  try {
    header = JSON.parse(base64urlDecode(encodedHeader).toString("utf8"));
  } catch {
    throw new Error("malformed header");
  }
  // Explicit algorithm allowlist (section 15 of the improvement prompt)
  // — one fixed algorithm, checked before the signature is ever computed
  // for comparison, not inferred from whatever the token claims.
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error("unsupported algorithm");
  }

  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("invalid signature");
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(encodedPayload).toString("utf8"));
  } catch {
    throw new Error("malformed payload");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== ISSUER) throw new Error("wrong issuer");
  if (payload.aud !== AUDIENCE) throw new Error("wrong audience");
  if (typeof payload.exp !== "number" || now >= payload.exp) {
    throw new Error("token expired");
  }
  if (!payload.sub || !payload.jti) throw new Error("missing required claim");

  return payload;
}
