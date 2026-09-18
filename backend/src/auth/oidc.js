// auth/oidc.js — Prompt 01.01 (Human AuthN). OIDC Authorization Code + PKCE against Keycloak.
import * as client from "openid-client";
import { config } from "../config.js";

const REALM_PATH = "/realms/factory";
const PENDING_COOKIE = "factory_oidc_pending";
const PENDING_TTL_S = 600;

let oidcConfig = null;

function serverMetadata() {
  const { issuer, internalUrl, publicUrl } = config.oidc;
  return {
    issuer,
    authorization_endpoint: `${publicUrl}${REALM_PATH}/protocol/openid-connect/auth`,
    token_endpoint: `${internalUrl}${REALM_PATH}/protocol/openid-connect/token`,
    jwks_uri: `${internalUrl}${REALM_PATH}/protocol/openid-connect/certs`,
    userinfo_endpoint: `${internalUrl}${REALM_PATH}/protocol/openid-connect/userinfo`,
    end_session_endpoint: `${publicUrl}${REALM_PATH}/protocol/openid-connect/logout`,
    code_challenge_methods_supported: ["S256"],
  };
}

export function getOidcConfig() {
  if (!config.auth.enabled || !config.oidc.enabled) {
    throw new Error(
      "[oidc] FACTORY_AUTH_ENABLED is true but OIDC is not fully configured " +
        "(FACTORY_OIDC_ISSUER / _INTERNAL_URL / _PUBLIC_URL / _CLIENT_SECRET / FACTORY_API_CALLBACK_URL)",
    );
  }
  if (!oidcConfig) {
    oidcConfig = new client.Configuration(
      serverMetadata(),
      config.oidc.clientId,
      config.oidc.clientSecret,
    );
    if (
      config.oidc.internalUrl.startsWith("http://") ||
      config.oidc.publicUrl.startsWith("http://")
    ) {
      client.allowInsecureRequests(oidcConfig);
    }
  }
  return oidcConfig;
}

export function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function buildAuthorizationRedirect(returnTo = "/") {
  const cfg = getOidcConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();

  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const url = client.buildAuthorizationUrl(cfg, {
    redirect_uri: config.oidc.callbackUrl,
    scope: "openid profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  const pending = Buffer.from(
    JSON.stringify({ state, nonce, codeVerifier, returnTo }),
  ).toString("base64url");
  return { url: url.toString(), pending };
}

export function setPendingCookie(res, pending) {
  res.setHeader(
    "Set-Cookie",
    `${PENDING_COOKIE}=${pending}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${PENDING_TTL_S}`,
  );
}

export function clearPendingCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${PENDING_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  );
}

function readPending(req) {
  const raw = readCookie(req, PENDING_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function exchangeCode(req) {
  const pending = readPending(req);
  if (!pending) {
    const err = new Error("no pending OIDC flow (missing or expired cookie)");
    err.code = "NO_PENDING";
    throw err;
  }

  const cfg = getOidcConfig();
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const currentUrl = new URL(config.oidc.callbackUrl + qs);

  const tokens = await client.authorizationCodeGrant(cfg, currentUrl, {
    pkceCodeVerifier: pending.codeVerifier,
    expectedState: pending.state,
    expectedNonce: pending.nonce,
  });

  const claims = tokens.claims();
  return { claims, tokens, returnTo: pending.returnTo || "/" };
}

export function buildLogoutUrl() {
  const cfg = getOidcConfig();
  const params = {
    client_id: config.oidc.clientId,
    post_logout_redirect_uri: config.oidc.baseUrl,
  };
  const url = client.buildEndSessionUrl(cfg, params);
  return url.toString();
}
