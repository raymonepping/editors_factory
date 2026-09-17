// src/ollamaClient.js — structured tool-calling requests against the
// shared Ollama runtime (compose/ollama/README.md's API contract: base
// URL http://factory-ollama:11434, POST /api/chat, model from
// $OLLAMA_MODEL — never hard-coded here, per that README's own rule).

import { config } from "./config.js";

/**
 * One turn of the conversation: sends the running message list plus the
 * caller's available tool schemas, returns the model's reply message
 * (which may include `tool_calls`). Non-streaming — the backend's own
 * audit trail, not token-by-token output, is what a live demo actually
 * shows on screen (prompts/frontend/01_01_factory_dashboard_ui.md reads
 * audit_events via SSE, not raw model output).
 */
export async function chat({ messages, tools }) {
  const res = await fetch(`${config.ollama.addr}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollama.model,
      messages,
      tools,
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama /api/chat failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const message = data.message || { role: "assistant", content: "" };

  // Ollama already parses tool-call arguments into an object per its own
  // /api/chat contract; normalize defensively in case a given model
  // returns them as a JSON string instead (observed variance across
  // Ollama tool-calling-capable models in general use).
  const toolCalls = (message.tool_calls || []).map((call) => {
    const rawArgs = call.function?.arguments;
    const args =
      typeof rawArgs === "string" ? safeParse(rawArgs) : rawArgs || {};
    return { name: call.function?.name, arguments: args };
  });

  return { role: "assistant", content: message.content || "", toolCalls };
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
