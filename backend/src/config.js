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
