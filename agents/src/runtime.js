// src/runtime.js — the request/response execution loop shared by
// Agent A, B, and C (prompts/agents/01_01's own 8-step loop). Agent D
// uses observerRuntime.js instead — it is event-driven/continuous, not
// request/response.
//
// How an agent learns it has a new task: POST /api/agents/agent-a/tasks
// (human origin) and POST /api/delegations (agent-to-agent) both write a
// `task.created` / `task.delegated` audit_events row targeting the
// receiving agent (backend/src/routes/tasks.js, routes/delegations.js),
// which the backend broadcasts over SSE like every other evidence-table
// insert (src/events.js). There is no separate task queue or webhook —
// this project deliberately has no message broker (input/08.md) — so
// each agent subscribes to the SAME event stream Agent D and the
// frontend consume, and reacts only to the rows addressed to its own
// identity. The full task (goal, effective authority, trace id) is not
// itself in the audit_events row — only its id — so the agent then
// fetches it via GET /api/tasks/:taskId.

import { config } from "./config.js";
import { backendClient, subscribeEvents } from "./backendClient.js";
import { chat } from "./ollamaClient.js";
import { TOOLS, schemasFor } from "./tools.js";
import { beat } from "./heartbeat.js";

const TASK_EVENT_ACTIONS = new Set(["task.created", "task.delegated"]);
const processedTaskIds = new Set(); // guards against any duplicate SSE delivery

export async function startTaskRuntime(identity, { signal } = {}) {
  console.log(`[${config.identity}] runtime starting — role: ${identity.role}`);
  const heartbeatTimer = setInterval(beat, 5000);
  beat();

  await subscribeEvents(
    ({ type, payload }) => {
      if (type !== "audit_events") return;
      if (payload.actor_id !== config.identity) return;
      if (!TASK_EVENT_ACTIONS.has(payload.action)) return;
      if (payload.result !== "ALLOW") return;
      if (processedTaskIds.has(payload.task_id)) return;
      processedTaskIds.add(payload.task_id);

      handleTask(identity, payload.task_id).catch((err) => {
        console.error(
          `[${config.identity}] task ${payload.task_id} failed:`,
          err.message,
        );
      });
    },
    { signal },
  );

  clearInterval(heartbeatTimer); // subscribeEvents only resolves once `signal` aborts
}

async function handleTask(identity, taskId) {
  const task = await backendClient.getTask(taskId);
  if (!task) {
    console.error(
      `[${config.identity}] task ${taskId} not found (already reset?)`,
    );
    return;
  }
  console.log(
    `[${config.identity}] task ${taskId} received — goal: "${task.goal}"`,
  );

  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("AGENT_TASK_TIMEOUT_MS exceeded")),
      config.taskTimeoutMs,
    ),
  );

  try {
    await Promise.race([runLoop(identity, task), timeout]);
  } catch (err) {
    console.error(
      `[${config.identity}] task ${taskId} ended with error:`,
      err.message,
    );
  }
}

// Appended to every identity's own system prompt — a small model
// reliably reasoning its way to the right decision in plain prose, then
// never actually issuing the tool call for it, is a real, observed
// failure mode (not hypothetical: caught live — Agent B correctly wrote
// out "Action: delegate_task(...)" as TEXT describing what it would do,
// never called it, and the task simply died there). This is a shared
// tool-calling-discipline concern, not something each identity's own
// prompt should have to restate.
const TOOL_CALL_DISCIPLINE = `\n\nWhen you decide to use a tool (including delegate_task), you must invoke it through the tool-calling mechanism — writing out what you would call, or describing the action in your response text, does not perform it. Only an actual tool call has any effect.`;

// One-shot nudge if the model's own text strongly suggests it decided to
// act but stopped without a tool call — e.g. it names one of its own
// tools in prose. Catches exactly the failure TOOL_CALL_DISCIPLINE is
// meant to prevent when the instruction alone doesn't reliably hold
// (small-model sampling variance), without looping indefinitely: at
// most one nudge per task.
//
// Found live: matching only the literal snake_case tool name missed a
// real case — the model wrote "I delegate the task of remediation to
// Agent C" (a natural paraphrase of delegate_task), which contains
// neither "delegate_task" nor "delegate task" as a substring. Checking
// the space-separated form catches most multi-word names; a small
// allowlist of distinctive single-word stems (checked bare) catches
// paraphrases like this one. Deliberately NOT every tool's first word —
// "list"/"update"/"get" are too generic to trust alone.
const DISTINCTIVE_STEMS = new Set(["delegate", "restart", "quarantine"]);

function mentionsATool(text, toolNames) {
  const lower = text.toLowerCase();
  return toolNames.some((name) => {
    if (lower.includes(name)) return true;
    if (lower.includes(name.replace(/_/g, " "))) return true;
    const stem = name.split("_")[0];
    return DISTINCTIVE_STEMS.has(stem) && lower.includes(stem);
  });
}

async function runLoop(identity, task) {
  const toolNames = identity.tools;
  const toolSchemas = schemasFor(toolNames);
  const ctx = { task, identity: config.identity };

  const messages = [
    {
      role: "system",
      content: identity.systemPrompt(task) + TOOL_CALL_DISCIPLINE,
    },
    { role: "user", content: task.goal },
  ];
  let nudgeCount = 0;
  const MAX_NUDGES = 2;

  for (let iteration = 1; iteration <= config.maxIterations; iteration += 1) {
    const message = await chat({ messages, tools: toolSchemas });

    if (!message.toolCalls.length) {
      if (
        nudgeCount < MAX_NUDGES &&
        mentionsATool(message.content, toolNames)
      ) {
        nudgeCount += 1;
        messages.push({ role: "assistant", content: message.content });
        messages.push({
          role: "user",
          content:
            // Deliberately unambiguous, no escape hatch: found live that
            // "if you intend to..." let the model reaffirm its own false
            // claim ("I have already called delegate_task...") instead
            // of actually calling it — a second, softer nudge round
            // produced the exact same non-answer. Stating plainly that
            // no tool call exists, rather than asking the model to judge
            // whether one is still needed, is what actually gets a
            // stubborn model unstuck.
            "No tool call was made in your previous message — none of your tools have been invoked yet, regardless of what you wrote. If the action you described still needs to happen, call that tool now, in this message.",
        });
        console.log(
          `[${config.identity}] task ${task.taskId} nudged (${nudgeCount}/${MAX_NUDGES}) at iteration ${iteration} (described a tool but did not call it)`,
        );
        continue;
      }
      // No tool call selected — the 8-step loop's "stop" condition.
      messages.push({ role: "assistant", content: message.content });
      console.log(
        `[${config.identity}] task ${task.taskId} stopped (no further tool call) after ${iteration} iteration(s): ${message.content}`,
      );
      return;
    }

    // Re-shape back into Ollama's own tool_call structure for the
    // conversation history it will read back on the next turn —
    // ollamaClient.js normalizes the inbound shape for OUR execution
    // code, but the model's chat template expects its own shape echoed
    // back, not our normalized one.
    messages.push({
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((tc) => ({
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    let delegated = false;
    for (const call of message.toolCalls) {
      const result = await executeTool(call, toolNames, ctx);
      messages.push({
        role: "tool",
        tool_name: call.name,
        content: JSON.stringify(result),
      });
      if (call.name === "delegate_task" && !result.error) delegated = true;
    }

    if (delegated) {
      // Handed off — this agent's own involvement in the task ends here;
      // the receiving agent picks it up via its own SSE subscription.
      console.log(
        `[${config.identity}] task ${task.taskId} delegated onward after ${iteration} iteration(s)`,
      );
      return;
    }
  }

  console.log(
    `[${config.identity}] task ${task.taskId} hit AGENT_MAX_ITERATIONS (${config.maxIterations}) without stopping or delegating`,
  );
}

async function executeTool(call, allowedToolNames, ctx) {
  if (!allowedToolNames.includes(call.name)) {
    // The model hallucinated a tool outside its own schema — genuinely
    // unavailable to select, but defend anyway rather than trust that
    // Ollama never emits a name it wasn't offered.
    return { error: `tool "${call.name}" is not available to ${ctx.identity}` };
  }
  const tool = TOOLS[call.name];
  if (!tool) return { error: `unknown tool "${call.name}"` };
  try {
    return await tool.run(call.arguments || {}, ctx);
  } catch (err) {
    // A DENY or a real PostgreSQL permission error both surface here as
    // a thrown error from backendClient (non-2xx) — returned to the
    // model as a normal tool result, not a crash, so it can reason about
    // the denial (prompts/agents/04_01's own "retry with a narrower
    // action" expectation).
    return { error: err.message };
  }
}
