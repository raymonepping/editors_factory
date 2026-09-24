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
  human_subject_id: string | null
  delegation_id: string | null
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
  revoked_reason: string | null
  renewal_count: number
  last_renewed_at: string | null
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

// prompts/improvements/01_08_agentic_iam_inspired_hardening.md Phase 4 —
// routes/credentials.js's own in-memory pending-approval shape (not a DB
// row, hence camelCase rather than this file's usual raw-column mirror).
export interface PendingApproval {
  approvalId: string
  role: string
  actorId: ActorId
  taskId: string
  runId: string
  requestedAt: number
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
  // The CURRENT run's own stored workflow_mode — distinct from
  // WorkflowModeResponse's in-memory "what the next run will get"
  // value. null when there is no current run.
  currentRunWorkflowMode: WorkflowMode | null
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

// v2 (prompts/v2/02_06) — the recoverable micro-DAG's own shapes,
// mirroring backend/src/orchestrator/dag-engine.js's row shapes exactly,
// same "raw column names, no client renaming" rule as everything above.

export type WorkflowMode = 'fixed_chain' | 'recoverable_dag'
export type FaultInjectionMode = 'none' | 'fail_before_mutation' | 'fail_after_mutation' | 'lock_timeout'
export type DagNodeKey = 'triage' | 'investigate' | 'remediate' | 'notify' | 'verify'
export type DagNodeStatus =
  | 'pending'
  | 'runnable'
  | 'claimed'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'invalidated'
  | 'cancelled'
export type DagRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface DagRun {
  run_id: string
  workflow_definition_key: string
  status: DagRunStatus
  started_at: string | null
  completed_at: string | null
}

export interface DagNode {
  node_id: string
  run_id: string
  node_key: DagNodeKey
  agent_role: string
  status: DagNodeStatus
  current_attempt_number: number
  current_fencing_token: number
  claimed_by: string | null
  claimed_at: string | null
  heartbeat_expires_at: string | null
  created_at: string
  updated_at: string
}

export interface DagNodeAttempt {
  attempt_id: string
  node_id: string
  attempt_number: number
  fencing_token: number
  agent_identity: string
  vault_lease_id: string | null
  vault_token_accessor: string | null
  attempt_idempotency_key: string
  business_effect_key: string | null
  execution_status: 'running' | 'completed' | 'failed' | 'timed_out'
  authority_status: 'active' | 'revoked' | 'expired'
  lease_revoked_at: string | null
  revocation_reason: string | null
  input_evidence: unknown
  output_evidence: unknown
  error_details: unknown
  started_at: string
  ended_at: string | null
}

export interface DagRunTopology {
  run: DagRun | null
  nodes: DagNode[]
  edges: { from_node_id: string; to_node_id: string }[]
  attempts: DagNodeAttempt[]
}

export interface WorkflowModeResponse {
  workflowMode: WorkflowMode
}
