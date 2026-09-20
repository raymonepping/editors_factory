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
    // prompts/improvements/01_07_vault_kv_secrets_migration.md: these
    // four values (cliOperatorToken, agentJwtSecret, oidc.clientSecret
    // below, and agentTokens at the bottom of this file) no longer come
    // from process.env — they start as null/empty placeholders here and
    // are populated by vault.js's loadSecretsFromVault(config), called
    // once during backend startup (index.js's main(), before
    // app.listen()) and mutated into this same exported object. Every
    // consumer already reads these fields inside a function body at call
    // time, never at its own module's top level, so the mutation is
    // visible everywhere by the time the server accepts its first
    // request.
    //
    // Shared secret for the Makefile's own curl-based demo commands
    // (make demo-bad/demo-good/reset) — a third identity domain distinct
    // from per-agent tokens and human OIDC sessions (auth/index.js's
    // requireHumanSession). null when unset: the CLI-token bypass simply
    // never matches, so a request without a real session still gets a
    // real 401 instead of silently falling back to an implicit identity.
    cliOperatorToken: null,
    // Wave 6 (ADR docs/validation/ADR_001_agent_api_identity.md): signs
    // and verifies the short-lived, task-bound JWT that replaces a
    // static bearer token as an agent's per-call credential. Populated by
    // loadSecretsFromVault before the server accepts requests — see the
    // note above.
    agentJwtSecret: null,
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
    // Populated by loadSecretsFromVault before the server accepts
    // requests — see the note on config.auth above.
    clientSecret: null,
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
  // Populated by loadSecretsFromVault before the server accepts requests
  // — see the note on config.auth above.
  agentTokens: {
    "agent-a": null,
    "agent-b": null,
    "agent-c": null,
    "agent-d": null,
  },
};

export function validateConfigOnBoot() {
  return config;
}
