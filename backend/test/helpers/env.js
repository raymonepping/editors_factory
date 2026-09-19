// test/helpers/env.js — minimal root-.env reader for the integration
// suite. No dotenv dependency (matches auth/agentJwt.js's own reasoning
// for not adding a JWT library: a small, fixed, auditable need doesn't
// need a new package). These tests run against the REAL, currently
// running stack (`make up`) — this project's own established testing
// philosophy is real effects, not mocks (input/PROJECT.md's "Real: real
// mutations occur ... no simulated"), so the integration boundary is the
// right level for these tests, not a mocked unit layer.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = join(here, "..", "..", "..", ".env");

function parseEnvFile(path) {
  const out = {};
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

const rootEnv = parseEnvFile(rootEnvPath);

export const API_BASE = `http://localhost:${rootEnv.API_PORT || "3001"}`;
export const AGENT_A_TOKEN = rootEnv.AGENT_A_TOKEN;
export const AGENT_C_TOKEN = rootEnv.AGENT_C_TOKEN;
export const CLI_TOKEN = rootEnv.FACTORY_CLI_OPERATOR_TOKEN;

export async function apiFetch(path, { method = "GET", token, cliToken, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cliToken) headers["X-Factory-Cli-Token"] = cliToken;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}
