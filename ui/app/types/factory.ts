// Shared types mirroring backend/src's own row shapes exactly (raw
// Postgres column names) — no client-side renaming layer, so a payload
// logged in the browser matches what prompts/api/01_01's own tables
// actually store.

export type Profile = 'bad' | 'good'
export type ActorId = 'agent-a' | 'agent-b' | 'agent-c' | 'agent-d'
export type PolicyResult = 'ALLOW' | 'DENY'

export interface AuditEvent {
  event_id: string
  run_id: string
  trace_id: string
  task_id: string
  parent_task_id: string | null
  actor_id: string
  delegated_by: string | null
  delegation_depth: number
  requested_authority: string | null
  effective_authority: string | null
  credential_id: string | null
  tool_name: string | null
  target: string | null
  action: string | null
  result: string | null
  rows_affected: number | null
  timestamp: string
}

export interface AuthorityDecision {
  decision_id: string
  run_id: string
  actor_id: string
  requested_action: string
  policy_result: PolicyResult
  reason: string | null
  timestamp: string
}

export interface CredentialEvent {
  credential_event_id: string
  run_id: string
  actor_id: string
  vault_role: string
  lease_id: string | null
  issued_at: string
  ttl_seconds: number | null
  revoked_at: string | null
}

export interface DatabaseChange {
  change_id: string
  run_id: string
  actor_id: string
  table_name: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  before: unknown
  after: unknown
  rows_affected: number
  timestamp: string
}

export interface Delegation {
  delegation_id: string
  run_id: string
  from_actor: string
  to_actor: string
  task_id: string
  authority_envelope: string[]
  created_at: string
}

export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface Finding {
  finding_id: string
  run_id: string
  actor_id: string
  severity: FindingSeverity
  title: string
  detail: string | null
  correlates_with_event_id: string | null
  status: 'open' | 'acted_on' | 'contained'
  created_at: string
}

// Union of every SSE channel / historical-read row, discriminated by `type`
// (backend/src/events.js's own publishEvent(type, ...) naming).
export type TimelineEntry =
  | ({ type: 'audit_events' } & AuditEvent)
  | ({ type: 'authority_decisions' } & AuthorityDecision)
  | ({ type: 'credential_events' } & CredentialEvent)
  | ({ type: 'database_changes' } & DatabaseChange)
  | ({ type: 'delegations' } & Delegation)
  | ({ type: 'findings' } & Finding)

export interface FactoryState {
  status: 'HEALTHY' | 'DEGRADED' | 'FAILED'
  runId: string | null
  orders: { total: number; inconsistent: number }
  products: { total: number; avgPrice: number }
  inventory: { lowStockCount: number; threshold: number }
}

export interface OrderRecord {
  id: number
  customer_ref: string
  status: string
  created_at: string
  updated_at: string
}

export interface FactoryRecordsPage {
  records: OrderRecord[]
  total: number
  limit: number
  offset: number
}

export interface DemoMode {
  profile: Profile
  runId: string | null
}

export interface AuthorityMap {
  profile: Profile
  authority: Record<ActorId, string[]>
}

export interface Task {
  taskId: string
  traceId: string
  actorId: string
  delegatedBy?: string
  delegationDepth: number
  effectiveAuthority: string[]
  goal: string
  runId?: string
}

// Agent chain node status — derived client-side from the real event
// stream (see useEventStream.ts's own comment on the derivation and its
// known limits: the backend has no explicit "task complete" signal, so
// `done` for agent-c is a heuristic over observed authority_decisions/
// database_changes, not a literal backend state). Agent A and B have no
// separate "delegated" state distinct from `done` — agents/src/runtime.js's
// own runLoop() returns immediately after a successful delegate_task call,
// so by the time the task.delegated audit event reaches the dashboard, the
// delegating agent's own involvement has already fully ended.
export type AgentNodeStatus = 'idle' | 'reasoning' | 'acting' | 'done'

export const DESTRUCTIVE_ACTIONS = new Set([
  'orders.delete',
  'products.delete',
  'products.update_price',
  'products.insert',
])
