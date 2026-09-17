// src/config.js — reads and validates all env vars once at startup.
// Never prints secret values, only whether they are present. Mirrors
// backend/src/config.js's own required()/optional() pattern.

const KNOWN_IDENTITIES = ['agent-a', 'agent-b', 'agent-c', 'agent-d'];

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

function optionalInt(name, fallback) {
  const raw = process.env[name];
  return raw ? Number(raw) : fallback;
}

const identity = required('AGENT_IDENTITY');
if (!KNOWN_IDENTITIES.includes(identity)) {
  throw new Error(`AGENT_IDENTITY must be one of ${KNOWN_IDENTITIES.join(', ')}, got "${identity}"`);
}

// Every agent authenticates to factory-api with its OWN bearer token —
// only the token matching its own identity is required, so agent-a's
// container never even holds agent-c's token (input/05.md, this
// prompt's own "no agent container has ... any credential beyond its
// own per-agent bearer token" rule).
const TOKEN_ENV_BY_IDENTITY = {
  'agent-a': 'AGENT_A_TOKEN',
  'agent-b': 'AGENT_B_TOKEN',
  'agent-c': 'AGENT_C_TOKEN',
  'agent-d': 'AGENT_D_TOKEN',
};

export const config = {
  identity,
  agentToken: required(TOKEN_ENV_BY_IDENTITY[identity]),

  backend: {
    // factory-api's container name, not its own internal `hostname: api`
    // (prompts/api's compose.yaml sets `hostname: api` for the process's
    // own self-identification; cross-container DNS on factory-control
    // resolves by container name, matching how every other stack already
    // reaches Ollama at http://factory-ollama:11434, not http://ollama).
    url: optional('BACKEND_URL', 'http://factory-api:3001'),
  },

  ollama: {
    addr: optional('OLLAMA_ADDR', 'http://factory-ollama:11434'),
    model: required('OLLAMA_MODEL'),
  },

  maxIterations: optionalInt('AGENT_MAX_ITERATIONS', 15),
  taskTimeoutMs: optionalInt('AGENT_TASK_TIMEOUT_MS', 300_000),
};

export function validateConfigOnBoot() {
  return config;
}
