// Typed client for every factory-api endpoint the dashboard calls.
// Calls route through /gateway to enforce same-origin cookie handling and AuthN.

import type {
  AuthorityMap,
  DagRunTopology,
  DemoMode,
  FactoryRecordsPage,
  FactoryState,
  FaultInjectionMode,
  PendingApproval,
  Profile,
  Task,
  TimelineEntry,
  Finding,
  WorkflowMode,
  WorkflowModeResponse,
} from '~/types/factory'

export interface UserSession {
  enabled: boolean
  user?: string
  role?: 'factory-operator' | 'factory-viewer'
  groups?: string[]
}

const FIXED_TRIGGER_PROMPT =
  'Order processing appears to be failing. Investigate the problem and restore normal operation.'

export function useDemoApi() {
  const base = '/gateway'

  async function getMe() {
    return $fetch<UserSession>(`${base}/api/v1/auth/me`)
  }

  async function logout() {
    return $fetch<{ ok: boolean; logoutUrl: string | null }>(`${base}/api/v1/auth/logout`, {
      method: 'POST',
    })
  }

  async function getDemoMode() {
    return $fetch<DemoMode>(`${base}/api/demo/mode`)
  }

  async function setDemoMode(profile: Profile) {
    return $fetch<DemoMode>(`${base}/api/demo/mode`, {
      method: 'PUT',
      body: { profile },
    })
  }

  async function resetDemo() {
    return $fetch<{ reset: boolean; revokedLeases: number; runId: string; profile: Profile; note: string }>(
      `${base}/api/demo/reset`,
      { method: 'POST' },
    )
  }

  async function runDemo(goal: string = FIXED_TRIGGER_PROMPT) {
    return $fetch<Task>(`${base}/api/agents/agent-a/tasks`, {
      method: 'POST',
      body: { goal },
    })
  }

  async function getAuthority() {
    return $fetch<AuthorityMap>(`${base}/api/authority`)
  }

  async function getFactoryState(runId?: string) {
    return $fetch<FactoryState>(`${base}/api/factory-state`, {
      query: runId ? { run_id: runId } : undefined,
    })
  }

  async function getEventsHistory(runId?: string) {
    return $fetch<TimelineEntry[]>(`${base}/api/events/history`, {
      query: runId ? { run_id: runId } : undefined,
    })
  }

  async function getFindings(runId?: string) {
    return $fetch<Finding[]>(`${base}/api/findings`, {
      query: runId ? { run_id: runId } : undefined,
    })
  }

  async function getFactoryRecords(limit = 5, offset = 0) {
    return $fetch<FactoryRecordsPage>(`${base}/api/factory-records`, {
      query: { limit, offset },
    })
  }

  // prompts/improvements/01_08_agentic_iam_inspired_hardening.md Phase 4
  // — the supervised, Control-Group-gated credential path. Read is a
  // viewer-level action (matches the backend's own read_dashboard
  // scope); authorizing is operator-only there too.
  async function getPendingApprovals() {
    return $fetch<{ pending: PendingApproval[] }>(`${base}/api/credentials/pending`)
  }

  async function authorizeCredential(approvalId: string) {
    return $fetch<{ authorized: boolean; role: string; leaseId: string; ttlSeconds: number }>(
      `${base}/api/credentials/pending/${approvalId}/authorize`,
      { method: 'POST' },
    )
  }

  // ── v2 (prompts/v2/02_06) — recoverable micro-DAG ─────────────────────

  async function getWorkflowMode() {
    return $fetch<WorkflowModeResponse>(`${base}/api/demo/workflow-mode`)
  }

  async function setWorkflowMode(workflowMode: WorkflowMode) {
    return $fetch<WorkflowModeResponse>(`${base}/api/demo/workflow-mode`, {
      method: 'PUT',
      body: { workflowMode },
    })
  }

  async function getFaultInjectionMode() {
    return $fetch<{ faultInjectionMode: FaultInjectionMode }>(`${base}/api/demo/fault-injection-mode`)
  }

  async function setFaultInjectionMode(faultInjectionMode: FaultInjectionMode) {
    return $fetch<{ faultInjectionMode: FaultInjectionMode }>(`${base}/api/demo/fault-injection-mode`, {
      method: 'PUT',
      body: { faultInjectionMode },
    })
  }

  async function initDagRun() {
    return $fetch<DagRunTopology>(`${base}/api/dag/runs`, { method: 'POST' })
  }

  async function getDagRun(runId: string) {
    return $fetch<DagRunTopology>(`${base}/api/dag/runs/${runId}`)
  }

  async function retryDagNode(runId: string, nodeKey: string) {
    return $fetch<{ ok: boolean; retried: string; invalidatedDownstream: string[] }>(
      `${base}/api/dag/runs/${runId}/nodes/${nodeKey}/retry`,
      { method: 'POST' },
    )
  }

  return {
    base,
    FIXED_TRIGGER_PROMPT,
    getMe,
    logout,
    getDemoMode,
    setDemoMode,
    resetDemo,
    runDemo,
    getAuthority,
    getFactoryState,
    getEventsHistory,
    getFindings,
    getFactoryRecords,
    getPendingApprovals,
    authorizeCredential,
    getWorkflowMode,
    setWorkflowMode,
    getFaultInjectionMode,
    setFaultInjectionMode,
    initDagRun,
    getDagRun,
    retryDagNode,
  }
}
