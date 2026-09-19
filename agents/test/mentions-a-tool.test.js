// test/mentions-a-tool.test.js — Wave 8 (prompts/improvements/01_01_improvement.md):
// unit tests for src/runtime.js's mentionsATool(), the nudge heuristic
// that catches the model describing a tool call in prose instead of
// actually invoking it — the single most frequently observed failure
// mode of qwen3:4b-instruct in this project's own live testing (see
// runtime.js's own TOOL_CALL_DISCIPLINE/DISTINCTIVE_STEMS comments).
// Pure function, no live stack or LLM required.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mentionsATool } from "../src/runtime.js";

const TOOLS = [
  "delegate_task",
  "get_health",
  "list_orders",
  "restart_order_processor",
];

describe("mentionsATool", () => {
  test("detects the literal snake_case tool name", () => {
    assert.equal(mentionsATool("I will call delegate_task now.", TOOLS), true);
  });

  test("detects the space-separated paraphrase", () => {
    assert.equal(
      mentionsATool("The next step is to delegate task to agent-c.", TOOLS),
      true,
    );
  });

  test("detects a natural-language paraphrase via its distinctive stem — the exact case found live", () => {
    // Verbatim from a real observed failure this improvement cycle
    // (agent-b, live log): the model never wrote "delegate_task" or
    // "delegate task" as a substring at all, only this phrasing.
    assert.equal(
      mentionsATool("I delegate the task of remediation to Agent C.", TOOLS),
      true,
    );
  });

  test("does not false-positive on ordinary prose containing no tool reference", () => {
    assert.equal(
      mentionsATool(
        "The remediation is complete. No further action is required.",
        TOOLS,
      ),
      false,
    );
  });

  test("does not false-positive on a generic word that happens to prefix a tool name", () => {
    // get_health / list_orders start with "get"/"list" — deliberately
    // NOT in DISTINCTIVE_STEMS because they're too generic to trust
    // alone (runtime.js's own comment).
    assert.equal(
      mentionsATool("Let me get some coffee and list my priorities.", TOOLS),
      false,
    );
  });
});
