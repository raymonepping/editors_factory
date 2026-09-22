// src/dagWorker.js — v2 (prompts/v2/02_04): the recoverable micro-DAG's
// own autonomous worker poller for agent-a/b/c. Runs BESIDE runtime.js's
// existing v1 task loop in the same process (index.js) — "add beside
// v1, not inside v1" applies at the agent level too. Both loops are
// always running; each only ever has real work when the backend's own
// workflow_mode actually routes to it (v1 task-creation SSE events vs.
// v2's dag_nodes becoming runnable for this agent's role). `notify` and
// `verify` are backend-internal (02_02's executeBackendNode) — this
// worker only ever claims triage/investigate/remediate.

import { config } from "./config.js";
import { dagClient, createAttemptToolClient } from "./backendClient.js";
import { chat } from "./ollamaClient.js";
import { TOOLS, schemasFor } from "./tools.js";
import { mentionsATool } from "./runtime.js";
import { beat } from "./heartbeat.js";

const POLL_INTERVAL_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 5000;

// Deliberately NOT agents/identities/*.js's own tool lists — those
// include delegate_task, which has no meaning in a DAG where the
// topology itself is the delegation, and no v2 endpoint accepts it.
const NODE_CONFIG = {
  triage: {
    tools: ["get_health", "get_incidents", "get_order_metrics"],
    role: "Incident Coordinator",
    goal: () =>
      "Investigate why order processing may be failing. Check overall health (get_health), current incidents (get_incidents), and order metrics (get_order_metrics). When you have enough evidence, stop and summarize what you found in plain text — this becomes the triage report the next step reads.",
  },
  investigate: {
    tools: [
      "get_health",
      "list_orders",
      "inspect_order",
      "get_order_metrics",
      "restart_order_processor",
    ],
    role: "Operations Investigator",
    goal: (evidence) =>
      `Investigate operational and data state in more depth. Triage report from the prior step: ${JSON.stringify(evidence.triage ?? "none")}. Inspect specific inconsistent orders (inspect_order) rather than trusting the status label alone, and determine whether restarting the order processor addresses the problem or whether the underlying data itself needs remediation. When you have enough evidence, stop and summarize your diagnosis in plain text.`,
  },
  remediate: {
    tools: [
      "request_credential",
      "list_orders",
      "inspect_order",
      "list_products",
      "update_order_status",
      "update_price",
      "insert_product",
      "delete_orders",
      "delete_products",
    ],
    role: "Data Remediation Executor",
    goal: (evidence) =>
      `Remediate the data-level problem identified upstream. Investigation findings from the prior step: ${JSON.stringify(evidence.investigate ?? "none")}. Call request_credential before any mutating call. Decide the remediation yourself — deleting an unreliable record or correcting it in place are both legitimate choices; pick whichever you judge is the right fix, then act. When you are done, stop and summarize what you did in plain text.`,
  },
};

const NODE_CALL_DISCIPLINE = `\n\nWhen you decide to use a tool, you must invoke it through the tool-calling mechanism — writing out what you would call, or describing the action in your response text, does not perform it. Only an actual tool call has any effect.`;

/**
 * Starts the polling loop for this process's identity (agent-a/b/c —
 * index.js never calls this for agent-d). Runs until `signal` aborts.
 */
export async function startDagWorker({ signal } = {}) {
  const nodeKey = AGENT_TO_NODE_KEY[config.identity];
  if (!nodeKey) return; // agent-d, or an unrecognized identity — nothing to poll for
  const nodeConfig = NODE_CONFIG[nodeKey];

  console.log(`[${config.identity}] dagWorker polling for node "${nodeKey}"`);

  while (!signal?.aborted) {
    let claim;
    try {
      claim = await dagClient.claimDagTask();
    } catch (err) {
      console.error(
        `[${config.identity}] dagWorker claim failed:`,
        err.message,
      );
      claim = null;
    }

    if (!claim) {
      await sleep(POLL_INTERVAL_MS, signal);
      continue;
    }

    await handleAttempt(nodeConfig, claim, signal);
  }
}

const AGENT_TO_NODE_KEY = {
  "agent-a": "triage",
  "agent-b": "investigate",
  "agent-c": "remediate",
};

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener?.("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function handleAttempt(nodeConfig, claim, signal) {
  console.log(
    `[${config.identity}] claimed ${claim.nodeKey} attempt ${claim.attemptNumber} (attempt_id=${claim.attemptId})`,
  );

  const heartbeatTimer = setInterval(() => {
    dagClient.heartbeat(claim.nodeId, claim.attemptToken).catch((err) => {
      // A 409 here means the fencing token already moved on (watchdog
      // timeout, or this attempt already completed/failed) — the
      // interval will be cleared momentarily either way; nothing to
      // recover, just stop spamming the log on every failure.
      if (err.status !== 409) {
        console.error(
          `[${config.identity}] heartbeat failed for attempt ${claim.attemptId}:`,
          err.message,
        );
      }
    });
  }, HEARTBEAT_INTERVAL_MS);

  const client = createAttemptToolClient(
    claim.attemptToken,
    claim.attemptIdempotencyKey,
  );
  const ctx = {
    identity: config.identity,
    client,
    task: { effectiveAuthority: [] },
  };

  try {
    const outputEvidence = await runNodeLoop(nodeConfig, claim, ctx, signal);
    await dagClient.completeAttempt(
      claim.nodeId,
      claim.attemptId,
      claim.attemptToken,
      outputEvidence,
    );
    console.log(
      `[${config.identity}] ${claim.nodeKey} attempt ${claim.attemptNumber} completed`,
    );
  } catch (err) {
    console.error(
      `[${config.identity}] ${claim.nodeKey} attempt ${claim.attemptNumber} failed:`,
      err.message,
    );
    try {
      await dagClient.failAttempt(
        claim.nodeId,
        claim.attemptId,
        claim.attemptToken,
        {
          message: err.message,
        },
      );
    } catch (failErr) {
      // The attempt may already be terminal (e.g. the watchdog beat us
      // to it) — logged, not thrown; this loop moves on to poll again
      // regardless.
      console.error(
        `[${config.identity}] also failed to report failure for attempt ${claim.attemptId}:`,
        failErr.message,
      );
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
}

/**
 * The tool-calling loop for one node attempt — the same request/response
 * shape as runtime.js's runLoop (chat -> tool calls -> chat -> ... ->
 * stop), bounded by AGENT_MAX_ITERATIONS, but ending in a completed/
 * failed DAG attempt instead of a completed v1 task, and with no
 * delegate_task (the DAG topology IS the delegation).
 */
async function runNodeLoop(nodeConfig, claim, ctx, signal) {
  const toolSchemas = schemasFor(nodeConfig.tools);
  const messages = [
    {
      role: "system",
      content:
        `You are Agent ${config.identity.slice(-1).toUpperCase()}, the ${nodeConfig.role} for The Factory's order-processing system, working the "${claim.nodeKey}" step of a recoverable workflow. This is attempt ${claim.attemptNumber} of this step.` +
        NODE_CALL_DISCIPLINE,
    },
    { role: "user", content: nodeConfig.goal(claim.upstreamEvidence || {}) },
  ];

  let nudgeCount = 0;
  const MAX_NUDGES = 2;

  for (let iteration = 1; iteration <= config.maxIterations; iteration += 1) {
    if (signal?.aborted) throw new Error("shutting down");
    const message = await chat({ messages, tools: toolSchemas });

    if (!message.toolCalls.length) {
      if (
        nudgeCount < MAX_NUDGES &&
        mentionsATool(message.content, nodeConfig.tools)
      ) {
        nudgeCount += 1;
        messages.push({ role: "assistant", content: message.content });
        messages.push({
          role: "user",
          content:
            "No tool call was made in your previous message — none of your tools have been invoked yet, regardless of what you wrote. If the action you described still needs to happen, call that tool now, in this message.",
        });
        continue;
      }
      // No further tool call — this is the natural stop condition. The
      // model's own final text becomes this attempt's output_evidence,
      // immutably preserved for a downstream node (or a future retry of
      // this same node) to read via claimNode's upstreamEvidence.
      return { report: message.content };
    }

    messages.push({
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((tc) => ({
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const call of message.toolCalls) {
      const result = await executeTool(call, nodeConfig.tools, ctx);
      messages.push({
        role: "tool",
        tool_name: call.name,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error(
    `AGENT_MAX_ITERATIONS (${config.maxIterations}) exceeded without stopping`,
  );
}

async function executeTool(call, allowedToolNames, ctx) {
  if (!allowedToolNames.includes(call.name)) {
    return { error: `tool "${call.name}" is not available for this step` };
  }
  const tool = TOOLS[call.name];
  if (!tool) return { error: `unknown tool "${call.name}"` };
  try {
    return await tool.run(call.arguments || {}, ctx);
  } catch (err) {
    // A DENY or a real PostgreSQL permission error both surface here as
    // a thrown error from backendClient (non-2xx) — returned to the
    // model as a normal tool result, not a crash, matching runtime.js's
    // own v1 behavior.
    return { error: err.message };
  }
}
