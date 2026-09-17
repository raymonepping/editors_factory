// src/policy.js — the ALLOW/DENY engine. Only Agent C's effective
// authority differs between BAD and GOOD profile (security/authority-model.md);
// Agent A, B, D are identical in both. The check itself is the same
// logic regardless of profile: is the requested action present in the
// actor's current effective authority?

const BASE_AUTHORITY = {
  "agent-a": ["health.read", "orders.read", "delegation.create"],
  "agent-b": [
    "health.read",
    "orders.read",
    "products.read",
    "service.restart",
    "delegation.create",
  ],
  "agent-d": ["health.read", "orders.read", "products.read", "finding.create"],
};

const AGENT_C_AUTHORITY = {
  bad: [
    "health.read",
    "orders.read",
    "orders.update_status",
    "orders.delete",
    "products.read",
    "products.update_price",
    "products.insert",
    "products.delete",
    "credential.request",
  ],
  good: [
    "health.read",
    "orders.read",
    "orders.update_status",
    "products.read",
    "credential.request",
  ],
};

/** The actor's current effective authority for the given profile. */
export function effectiveAuthorityFor(actorId, profile) {
  if (actorId === "agent-c")
    return AGENT_C_AUTHORITY[profile] ?? AGENT_C_AUTHORITY.good;
  return BASE_AUTHORITY[actorId] ?? [];
}

/**
 * An agent cannot delegate authority it does not itself hold — intersect
 * the delegating agent's own effective authority with whatever envelope
 * it requests for the delegate. Never lets an envelope grow across a hop.
 */
export function intersectEnvelope(fromActorAuthority, requestedEnvelope) {
  const fromSet = new Set(fromActorAuthority);
  return requestedEnvelope.filter((a) => fromSet.has(a));
}

/**
 * The core ALLOW/DENY check. Returns { result, reason }. `reason` is set
 * whenever the result is DENY, per prompts/backend/01_01_orchestrator_api.md.
 */
export function checkAuthority({
  actorId,
  requestedAction,
  effectiveAuthority,
}) {
  if (effectiveAuthority.includes(requestedAction)) {
    return { result: "ALLOW", reason: null };
  }
  return {
    result: "DENY",
    reason: `${actorId} requested "${requestedAction}", which is outside its effective authority: [${effectiveAuthority.join(", ")}]`,
  };
}

export const TOOL_TO_ACTION = {
  get_health: "health.read",
  list_orders: "orders.read",
  get_order: "orders.read",
  list_products: "products.read",
  update_order_status: "orders.update_status",
  delete_orders: "orders.delete",
  update_price: "products.update_price",
  insert_product: "products.insert",
  delete_products: "products.delete",
  restart_order_processor: "service.restart",
  request_credential: "credential.request",
  delegate_task: "delegation.create",
  create_finding: "finding.create",
};
