// src/tools.js — the shared tool registry every agent identity module
// picks a subset from (prompts/agents/01_01's own design rule: "Define
// the tool schemas once in shared code, and have each agent's identity
// module declare its permitted toolset"). Each entry pairs an
// Ollama-facing JSON schema with the implementation that actually calls
// factory-api. The identity's OWN toolset list (not this file) is what
// makes a tool genuinely unselectable to a given agent — runtime.js only
// ever offers Ollama the schemas for tools the calling identity lists.
//
// A handful of tool names used by the agent prompts (02_01-04_01) do not
// map 1:1 onto a single backend endpoint from
// prompts/api/API_CONTRACTS.md:
//   - inspect_order(id)   -> GET /api/actions/orders/:id (API_CONTRACTS.md
//                            calls this tool `get_order`; the agent-facing
//                            name follows the agent prompts' own naming)
//   - get_incidents()     -> list_orders with a fixed status=inconsistent
//                            filter; a narrower, easier-to-select
//                            convenience wrapper for Agent A specifically
//   - get_order_metrics() -> list_orders() with no filter, aggregated
//                            client-side into counts by status; no
//                            dedicated backend route exists or is needed
//                            for a single count-by-status rollup
//
// Agent D's tools (subscribe_events, update_risk_state,
// get_current_risk_state — prompts/agents/05_01) are deliberately NOT
// here: Agent D's Tier-1 classification is plain deterministic code
// reacting to the SSE stream (agents/src/observerRuntime.js), not an
// Ollama tool-calling decision, so those three have no JSON schema.
// create_finding IS shared here since Agent D's Tier-2 step uses the
// same backend endpoint every other finding-writer would.

import { backendClient } from "./backendClient.js";

function orderSummary(orders) {
  const byStatus = {};
  for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  return { total: orders.length, byStatus };
}

export const TOOLS = {
  get_health: {
    schema: {
      type: "function",
      function: {
        name: "get_health",
        description: "Get overall order-processing health status.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    run: async () => backendClient.getHealth(),
  },

  get_incidents: {
    schema: {
      type: "function",
      function: {
        name: "get_incidents",
        description:
          "List orders currently flagged as inconsistent (candidate incidents).",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    run: async () => backendClient.listOrders({ status: "inconsistent" }),
  },

  get_order_metrics: {
    schema: {
      type: "function",
      function: {
        name: "get_order_metrics",
        description: "Get order counts grouped by status, across all orders.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    run: async () => orderSummary(await backendClient.listOrders({})),
  },

  list_orders: {
    schema: {
      type: "function",
      function: {
        name: "list_orders",
        description: "List orders, optionally filtered by status.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description:
                'e.g. "inconsistent", "fulfilled", "processing", "pending", "cancelled"',
            },
          },
          required: [],
        },
      },
    },
    run: async (args) => backendClient.listOrders({ status: args.status }),
  },

  inspect_order: {
    schema: {
      type: "function",
      function: {
        name: "inspect_order",
        description: "Get one order by id, including its line items.",
        parameters: {
          type: "object",
          properties: { id: { type: "integer", description: "Order id" } },
          required: ["id"],
        },
      },
    },
    run: async (args) => backendClient.getOrder(args.id),
  },

  list_products: {
    schema: {
      type: "function",
      function: {
        name: "list_products",
        description: "List products, optionally filtered by category.",
        parameters: {
          type: "object",
          properties: { category: { type: "string" } },
          required: [],
        },
      },
    },
    run: async (args) =>
      backendClient.listProducts({ category: args.category }),
  },

  update_order_status: {
    schema: {
      type: "function",
      function: {
        name: "update_order_status",
        description:
          'Set an order\'s status (e.g. to "quarantined" while it is investigated).',
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            status: { type: "string" },
          },
          required: ["id", "status"],
        },
      },
    },
    run: async (args) => backendClient.updateOrderStatus(args.id, args.status),
  },

  update_price: {
    schema: {
      type: "function",
      function: {
        name: "update_price",
        description: "Update a product's price by SKU.",
        parameters: {
          type: "object",
          properties: { sku: { type: "string" }, price: { type: "number" } },
          required: ["sku", "price"],
        },
      },
    },
    run: async (args) => backendClient.updatePrice(args.sku, args.price),
  },

  insert_product: {
    schema: {
      type: "function",
      function: {
        name: "insert_product",
        description: "Insert a new product.",
        parameters: {
          type: "object",
          properties: {
            sku: { type: "string" },
            name: { type: "string" },
            category: { type: "string" },
            price: { type: "number" },
          },
          required: ["sku", "name", "category", "price"],
        },
      },
    },
    run: async (args) => backendClient.insertProduct(args),
  },

  delete_orders: {
    schema: {
      type: "function",
      function: {
        name: "delete_orders",
        description:
          'Delete orders matching a structured filter (e.g. {"status":"inconsistent"}). Never a raw SQL string.',
        parameters: {
          type: "object",
          properties: {
            filter: {
              type: "object",
              properties: {
                status: { type: "string" },
                customer_ref: { type: "string" },
              },
            },
          },
          required: ["filter"],
        },
      },
    },
    run: async (args) => backendClient.deleteOrders(args.filter),
  },

  delete_products: {
    schema: {
      type: "function",
      function: {
        name: "delete_products",
        description:
          'Delete products matching a structured filter (e.g. {"discontinued":true}). Never a raw SQL string.',
        parameters: {
          type: "object",
          properties: {
            filter: {
              type: "object",
              properties: {
                discontinued: { type: "boolean" },
                category: { type: "string" },
                active: { type: "boolean" },
              },
            },
          },
          required: ["filter"],
        },
      },
    },
    run: async (args) => backendClient.deleteProducts(args.filter),
  },

  restart_order_processor: {
    schema: {
      type: "function",
      function: {
        name: "restart_order_processor",
        description: "Restart the order-processing service.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    run: async () => backendClient.restartOrderProcessor(),
  },

  request_credential: {
    schema: {
      type: "function",
      function: {
        name: "request_credential",
        description:
          "Request a short-lived, scoped database credential for the current remediation task. Must be called before any mutating tool (update_order_status, update_price, insert_product, delete_orders, delete_products).",
        parameters: {
          type: "object",
          properties: {
            purpose: {
              type: "string",
              description:
                'Short human-readable reason, e.g. "order-remediation".',
            },
          },
          required: [],
        },
      },
    },
    run: async () => backendClient.requestCredential(),
  },

  delegate_task: {
    schema: {
      type: "function",
      function: {
        name: "delegate_task",
        description:
          "Delegate this task to the next agent in the chain, handing over a subset of your own authority.",
        parameters: {
          type: "object",
          properties: {
            agent: {
              type: "string",
              description:
                'The agent to delegate to (e.g. "agent-b", "agent-c")',
            },
            goal: { type: "string" },
            authority_envelope: {
              type: "array",
              items: { type: "string" },
              description:
                "The authority you are handing over — must be a subset of your own. Defaults to your own current authority if omitted.",
            },
          },
          required: ["agent", "goal"],
        },
      },
    },
    // A delegator cannot legitimately hand over more than it currently
    // holds. Found live: a small model asked to fill in
    // authority_envelope does not reliably know the real, closed
    // authority vocabulary (health.read, orders.read, ... — policy.js's
    // own strings) — one real run supplied a syntactically valid array
    // of entirely invented names ("verify_product_catalog",
    // "update_product_catalog"). Falling back to the caller's own
    // effective authority only when the field was OMITTED or malformed
    // (not an array) did not catch this: the backend's own
    // intersectEnvelope correctly intersected the hallucinated strings
    // against the real ceiling and got nothing, leaving the recipient
    // with an EMPTY effective authority — unable to do anything, not
    // even request a credential. Filtering the model's array down to
    // only entries that are ALSO in the caller's own real (backend-
    // issued, not model-suppliable) effectiveAuthority — and falling
    // back to the whole thing if that leaves nothing — closes this
    // without depending on the model getting the vocabulary right. The
    // backend still independently bounds the result to the recipient's
    // own ceiling either way (backend/src/routes/delegations.js) — this
    // is a usability/robustness default, not the security boundary.
    run: async (args, ctx) => {
      const requested = Array.isArray(args.authority_envelope)
        ? args.authority_envelope
        : [];
      const held = new Set(ctx.task.effectiveAuthority);
      const filtered = requested.filter((a) => held.has(a));
      const authorityEnvelope = filtered.length
        ? filtered
        : ctx.task.effectiveAuthority;
      return backendClient.delegateTask({
        toActor: args.agent,
        goal: args.goal,
        authorityEnvelope,
      });
    },
  },

  create_finding: {
    schema: {
      type: "function",
      function: {
        name: "create_finding",
        description:
          "Record a detection finding. Discovery creates evidence, not authority — this never blocks or reverses another agent's action.",
        parameters: {
          type: "object",
          properties: {
            severity: {
              type: "string",
              enum: ["low", "medium", "high", "critical"],
            },
            title: { type: "string" },
            detail: { type: "string" },
            correlates_with_event_id: { type: "string" },
          },
          required: ["severity", "title"],
        },
      },
    },
    run: async (args) =>
      backendClient.createFinding({
        severity: args.severity,
        title: args.title,
        detail: args.detail,
        correlatesWithEventId: args.correlates_with_event_id,
      }),
  },
};

/** Returns the Ollama tool-schema array for a given identity's toolset (an array of tool names). */
export function schemasFor(toolNames) {
  return toolNames.map((name) => {
    const tool = TOOLS[name];
    if (!tool) throw new Error(`Unknown tool in identity toolset: ${name}`);
    return tool.schema;
  });
}
