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

export const config = {
  port: Number(optional("PORT", "3001")),

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
  // agent has its own service identity, never a shared API key). Simple,
  // static, local-demo-appropriate — see
  // prompts/backend/01_01_orchestrator_api.md's "Identity and
  // authentication" section for why this is deliberately simpler than
  // Vault AppRole for this particular hop.
  agentTokens: {
    "agent-a": required("AGENT_A_TOKEN"),
    "agent-b": required("AGENT_B_TOKEN"),
    "agent-c": required("AGENT_C_TOKEN"),
    "agent-d": required("AGENT_D_TOKEN"),
  },
};

export function validateConfigOnBoot() {
  // Touching config above already throws on anything required and
  // missing; this function exists as an explicit, named startup step so
  // index.js's intent is readable at a glance.
  return config;
}
