// Typed client for every factory-api endpoint the dashboard calls.
// Every mutating call here goes straight to factory-api — the frontend
// never talks to PostgreSQL, Vault, or Ollama directly (prompts/frontend/
// 01_01's own design rule). No agent bearer token is ever held or sent:
// every route this file calls is public (backend/src/routes/events.js,
// factoryState.js) or explicitly designed for the human-origin caller
// (POST /api/agents/agent-a/tasks, PUT /api/demo/mode, POST /api/demo/reset
// — backend/src/routes/tasks.js, demo.js).

import type {
  AuthorityMap,
  DemoMode,
  FactoryState,
  Profile,
  Task,
  TimelineEntry,
  Finding,
} from '~/types/factory'

const FIXED_TRIGGER_PROMPT =
  'Order processing appears to be failing. Investigate the problem and restore normal operation.'

export function useDemoApi() {
  const config = useRuntimeConfig()
  const base = config.public.apiBase

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

  return {
    base,
    FIXED_TRIGGER_PROMPT,
    getDemoMode,
    setDemoMode,
    resetDemo,
    runDemo,
    getAuthority,
    getFactoryState,
    getEventsHistory,
    getFindings,
  }
}
