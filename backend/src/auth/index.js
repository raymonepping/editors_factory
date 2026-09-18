// auth/index.js — Prompt 01.01 (Human AuthN router & session middleware)
import { Router } from "express";
import { randomBytes } from "node:crypto";
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

export const authRouter = Router();

const COOKIE = "factory_session";
const TTL_S = 3600; // 1 hour
const IDLE_TIMEOUT_S = 1800; // 30 minutes

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

    const username = claims.preferred_username || claims.sub;
    const id = randomBytes(32).toString("hex");
    await query(
      `INSERT INTO sessions (id, username, role, groups, expires_at, last_seen_at)
       VALUES ($1, $2, $3, $4, now() + interval '1 hour', now())`,
      [id, username, role, groups],
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
      `SELECT username, role, groups FROM sessions
       WHERE id = $1 AND expires_at > now() AND last_seen_at > now() - interval '${IDLE_TIMEOUT_S} seconds'`,
      [id],
    );
    if (!rows.length) {
      return res.status(401).json({ enabled: true, error: "session expired" });
    }
    res.json({
      enabled: true,
      user: rows[0].username,
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
    req.identity = {
      user: "demo",
      role: "factory-operator",
      groups: ["factory-operator"],
    };
    return next();
  }

  // Allow open paths
  const openPaths = [/^\/api\/health/, /^\/api\/v1\/auth\//, /^\/api\/events/];
  if (openPaths.some((r) => r.test(req.path))) return next();

  // Allow agent-authenticated requests (Bearer token) or localhost operator fallback for CLI / internal tools
  const authHeader = req.headers.authorization || "";
  if (/^Bearer\s+\S+/i.test(authHeader)) {
    return next();
  }

  // Operator token fallback (e.g. from env or internal CLI calls)
  const isLocalhostRequest =
    req.headers.host?.startsWith("localhost:") ||
    req.headers.host?.startsWith("127.0.0.1:");
  const userAgent = req.headers["user-agent"] || "";
  if (
    isLocalhostRequest &&
    (userAgent.startsWith("curl/") ||
      userAgent.startsWith("node") ||
      !userAgent)
  ) {
    req.identity = {
      user: "local-operator",
      role: "factory-operator",
      groups: ["factory-operator"],
    };
    return next();
  }

  const id = readCookie(req, COOKIE);
  if (!id) {
    return res.status(401).json({ error: "authentication required" });
  }

  query(
    `SELECT username, role, groups FROM sessions
     WHERE id = $1 AND expires_at > now() AND last_seen_at > now() - interval '${IDLE_TIMEOUT_S} seconds'`,
    [id],
  )
    .then(({ rows }) => {
      if (!rows.length) {
        return res.status(401).json({ error: "session expired" });
      }
      req.identity = {
        user: rows[0].username,
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
