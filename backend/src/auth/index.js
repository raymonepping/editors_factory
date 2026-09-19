// auth/index.js — Prompt 01.01 (Human AuthN router & session middleware)
import { Router } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { query } from "../db.js";
import {
  buildAuthorizationRedirect,
  setPendingCookie,
  clearPendingCookie,
  exchangeCode,
  buildLogoutUrl,
  readCookie,
} from "./oidc.js";
import { groupsToRole } from "./authorize.js";
import { verifyAgentToken } from "./agentJwt.js";

export const authRouter = Router();

const COOKIE = "factory_session";
const TTL_S = 3600; // 1 hour
const IDLE_TIMEOUT_S = 1800; // 30 minutes
const CLI_TOKEN_HEADER = "x-factory-cli-token";

// Constant-time comparison that never throws on a length mismatch (a
// naive `timingSafeEqual` call throws instead of returning false when
// the two buffers differ in length, which a raw `===` check leaks via
// timing and a try/catch around it leaks via a distinguishable code
// path either way unless length is normalized first).
function safeTokenEquals(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function setCookie(res, id) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(id)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TTL_S}`,
  );
}

function clearCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  );
}

// GET /api/v1/auth/login
authRouter.get("/login", async (req, res, next) => {
  try {
    if (!config.auth.enabled) {
      return res
        .status(400)
        .json({ error: "authentication is disabled on this deployment" });
    }
    const returnTo =
      typeof req.query.next === "string" && req.query.next.startsWith("/")
        ? req.query.next
        : "/";
    const { url, pending } = await buildAuthorizationRedirect(returnTo);
    setPendingCookie(res, pending);
    res.redirect(302, url);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/callback
authRouter.get("/callback", async (req, res, next) => {
  clearPendingCookie(res);
  if (!config.auth.enabled) {
    return res
      .status(400)
      .json({ error: "authentication is disabled on this deployment" });
  }
  try {
    const { claims, returnTo } = await exchangeCode(req);
    const groups = Array.isArray(claims.groups) ? claims.groups : [];
    const role = groupsToRole(groups);

    if (!role) {
      return res.status(403).json({
        error: "authenticated but not authorized: no Factory role group",
      });
    }

    // Prompt 01.02 Phase 1 (input/Codex_Feedback.md): username is a
    // display value only — it can change if the person's profile does.
    // subject_id is Keycloak's own immutable `sub` claim, captured
    // separately so evidence rows can attribute an action to a stable
    // identity rather than whatever the display name happened to be.
    const username = claims.preferred_username || claims.sub;
    const id = randomBytes(32).toString("hex");
    await query(
      `INSERT INTO sessions (id, username, subject_id, role, groups, expires_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '1 hour', now())`,
      [id, username, claims.sub, role, groups],
    );
    setCookie(res, id);
    res.redirect(302, returnTo || "/");
  } catch (err) {
    const reason =
      err?.code === "NO_PENDING"
        ? "no pending sign-in (cookie missing or expired) — start again"
        : err?.message || "OIDC callback validation failed";
    res.status(401).json({ error: "sign-in rejected", reason });
  }
});

// GET /api/v1/auth/me
authRouter.get("/me", async (req, res, next) => {
  try {
    if (!config.auth.enabled) {
      return res.json({
        enabled: false,
        user: "demo",
        role: "factory-operator",
        groups: ["factory-operator"],
      });
    }
    const id = readCookie(req, COOKIE);
    if (!id) {
      return res
        .status(401)
        .json({ enabled: true, error: "not authenticated" });
    }
    const { rows } = await query(
      `SELECT username, subject_id, role, groups FROM sessions
       WHERE id = $1 AND expires_at > now() AND last_seen_at > now() - interval '${IDLE_TIMEOUT_S} seconds'`,
      [id],
    );
    if (!rows.length) {
      return res.status(401).json({ enabled: true, error: "session expired" });
    }
    res.json({
      enabled: true,
      user: rows[0].username,
      subjectId: rows[0].subject_id,
      role: rows[0].role,
      groups: rows[0].groups ?? [],
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout
authRouter.post("/logout", async (req, res, next) => {
  try {
    const id = readCookie(req, COOKIE);
    if (id) {
      await query("DELETE FROM sessions WHERE id = $1", [id]).catch(() => {});
    }
    clearCookie(res);
    const logoutUrl = config.oidc.enabled ? buildLogoutUrl() : null;
    res.json({ ok: true, logoutUrl });
  } catch (err) {
    next(err);
  }
});

// Middleware for human endpoints
export function requireHumanSession(req, res, next) {
  if (!config.auth.enabled) {
    // Not a real Keycloak human — human_subject_id stays null downstream
    // rather than a fabricated stable id for something that isn't one
    // (Prompt 01.02 Phase 1's own explicit decision on this case).
    req.identity = {
      user: "demo",
      subjectId: null,
      role: "factory-operator",
      groups: ["factory-operator"],
    };
    return next();
  }

  // Allow open paths
  const openPaths = [/^\/api\/health/, /^\/api\/v1\/auth\//, /^\/api\/events/];
  if (openPaths.some((r) => r.test(req.path))) return next();

  // The documented CLI workflow (make demo-bad/demo-good/reset — see
  // README.md and docs/demo-guide.md) calls these same human-boundary
  // routes directly with curl, not a browser session. A real, narrow
  // shared secret (distinct from every per-agent token and from human
  // OIDC sessions — Wave 7's own "human and agent identity are separate
  // security domains" rule extended to a third domain) replaces what was
  // previously an unauthenticated "any Bearer header, or curl/node on
  // localhost" bypass — neither check verified anything, so any local
  // process could reach reset/profile-switch/task-creation with zero
  // credentials (found live during Wave 4-8 follow-up work).
  const cliToken = req.headers[CLI_TOKEN_HEADER];
  if (
    config.auth.cliOperatorToken &&
    safeTokenEquals(cliToken, config.auth.cliOperatorToken)
  ) {
    // Also not a real Keycloak human — same null-subject decision as
    // the disabled-auth default above.
    req.identity = {
      user: "local-operator",
      subjectId: null,
      role: "factory-operator",
      groups: ["factory-operator"],
    };
    return next();
  }

  // GET /tasks/:taskId is the one route on this middleware that a real
  // agent runtime also calls on its own behalf (agents/src/runtime.js's
  // handleTask -> backendClient.getTask). Wave 6: agents authenticate
  // everywhere (including here) with their short-lived, task-bound JWT
  // (auth/agentJwt.js), never the static per-agent token — that token's
  // only remaining purpose is bootstrapping one at routes/agentToken.js.
  // Tagged with a role outside VALID_ROLES so it can never satisfy
  // requireRole on the human-only demo-control routes even if presented
  // there (Wave 7's own agent/human separation rule).
  const authHeader = req.headers.authorization || "";
  const bearerMatch = authHeader.match(/^Bearer (.+)$/);
  if (bearerMatch) {
    try {
      const claims = verifyAgentToken(bearerMatch[1]);
      req.identity = { user: claims.sub, role: "agent", groups: [] };
      return next();
    } catch {
      // Not a valid agent JWT — fall through to the human session check
      // below, which will 401 if no session cookie is present either.
    }
  }

  const id = readCookie(req, COOKIE);
  if (!id) {
    return res.status(401).json({ error: "authentication required" });
  }

  query(
    `SELECT username, subject_id, role, groups FROM sessions
     WHERE id = $1 AND expires_at > now() AND last_seen_at > now() - interval '${IDLE_TIMEOUT_S} seconds'`,
    [id],
  )
    .then(({ rows }) => {
      if (!rows.length) {
        return res.status(401).json({ error: "session expired" });
      }
      req.identity = {
        user: rows[0].username,
        subjectId: rows[0].subject_id,
        role: rows[0].role,
        groups: rows[0].groups ?? [],
      };
      query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [
        id,
      ]).catch(() => {});
      next();
    })
    .catch(next);
}
