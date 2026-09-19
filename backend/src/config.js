// src/config.js — reads and validates all env vars once at startup.
// Never prints secret values, only whether they are present.

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name, fallback) {
  return process.env[name] || fallback;
}

const authEnabled = optional("FACTORY_AUTH_ENABLED", "true") === "true";

export const config = {
  port: Number(optional("PORT", "3001")),

  auth: {
    enabled: authEnabled,
    // Shared secret for the Makefile's own curl-based demo commands
    // (make demo-bad/demo-good/reset) — a third identity domain distinct
    // from per-agent tokens and human OIDC sessions (auth/index.js's
    // requireHumanSession). null when unset: the CLI-token bypass simply
    // never matches, so a request without a real session still gets a
    // real 401 instead of silently falling back to an implicit identity.
    cliOperatorToken: optional("FACTORY_CLI_OPERATOR_TOKEN", null),
    // Wave 6 (ADR docs/validation/ADR_001_agent_api_identity.md): signs
    // and verifies the short-lived, task-bound JWT that replaces a
    // static bearer token as an agent's per-call credential. Required,
    // like the agent tokens below — this is now the enforced mechanism,
    // not an optional hardening layer.
    agentJwtSecret: required("FACTORY_AGENT_JWT_SECRET"),
    // Prompt 01.02 Phase 5, found live: this defaulted to 300, exactly
    // equal to AGENT_TASK_TIMEOUT_MS's own 300000ms default — a task
    // bootstraps its JWT at the same moment its timeout clock starts, so
    // an equal TTL meant the two raced with zero margin. A task running
    // anywhere close to its own timeout under this environment's slow
    // CPU-only inference hit real 401s on its OWN in-flight tool calls
    // (not just the final completion report) once the JWT won that race
    // first — the agent's own transcript narrated it as "the credential
    // has expired," accurately describing the symptom. 900s gives
    // comfortable headroom over the 300s task timeout, which now always
    // kills a genuinely stuck task first.
    agentJwtTtlSeconds: Number(
      optional("FACTORY_AGENT_JWT_TTL_SECONDS", "900"),
    ),
  },

  oidc: {
    enabled: authEnabled,
    issuer: optional(
      "FACTORY_OIDC_ISSUER",
      "http://localhost:8088/realms/factory",
    ),
    internalUrl: optional("FACTORY_OIDC_INTERNAL_URL", "http://keycloak:8080"),
    publicUrl: optional("FACTORY_OIDC_PUBLIC_URL", "http://localhost:8088"),
    clientId: optional("FACTORY_OIDC_CLIENT_ID", "factory-api"),
    clientSecret: optional(
      "FACTORY_OIDC_CLIENT_SECRET",
      "factory-client-secret-2026",
    ),
    callbackUrl: optional(
      "FACTORY_API_CALLBACK_URL",
      "http://localhost:3000/gateway/api/v1/auth/callback",
    ),
    baseUrl: optional("FACTORY_BASE_URL", "http://localhost:3000"),
  },

  vault: {
    addr: optional("VAULT_ADDR", "https://vault-1:8200"),
    namespace: optional("VAULT_NAMESPACE", "factory"),
    tokenFile: optional("VAULT_AGENT_TOKEN_FILE", "/vault/secrets/token"),
  },

  postgres: {
    host: optional("POSTGRES_HOST", "postgres"),
    port: Number(optional("POSTGRES_PORT", "5432")),
    database: required("POSTGRES_DB"),
  },

  demo: {
    defaultProfile: optional("DEMO_PROFILE", "good"),
  },

  // Per-agent bearer tokens for agent -> backend calls (input/05.md: every
  // agent has its own service identity, never a shared API key).
  agentTokens: {
    "agent-a": required("AGENT_A_TOKEN"),
    "agent-b": required("AGENT_B_TOKEN"),
    "agent-c": required("AGENT_C_TOKEN"),
    "agent-d": required("AGENT_D_TOKEN"),
  },
};

export function validateConfigOnBoot() {
  return config;
}
