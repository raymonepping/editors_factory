// Live SSE client + derived dashboard state — the single source of truth
// every component reads from. Real-time via factory-api's SSE stream, not
// polling (prompts/frontend/01_01's own design rule); every visual
// transition here is driven by an actual received event, never a timer
// (prompts/frontend/01_00 section 18's own rule).
//
// Module-level (not per-component) state: every component that calls
// useEventStream() shares the same connection and derived state, so the
// stream is only ever opened once regardless of how many panels use it.

import { DESTRUCTIVE_ACTIONS } from '~/types/factory'
import type {
  AgentNodeStatus,
  AuthorityMap,
  CredentialEvent,
  DemoMode,
  FactoryState,
  Finding,
  TimelineEntry,
} from '~/types/factory'

const CHAIN_ACTORS = ['agent-a', 'agent-b', 'agent-c'] as const
type ChainActor = (typeof CHAIN_ACTORS)[number]

// Mirrors agents/identities/agent-d.js's own classify()/nextState() —
// findings.severity (the DB column) only has 4 values (low/medium/high/
// critical), which cannot distinguish D-001/D-002 (NORMAL) from D-003/
// D-004 (ELEVATED); the finding TITLE's own D-code prefix carries that
// distinction, so it's parsed here rather than widening the DB enum for
// a display-only need.
const RISK_BY_CODE: Record<string, 'NORMAL' | 'ELEVATED' | 'CRITICAL' | 'CONTAINED'> = {
  'D-001': 'NORMAL',
  'D-002': 'NORMAL',
  'D-003': 'ELEVATED',
  'D-004': 'ELEVATED',
  'D-004b': 'ELEVATED',
  'D-005': 'CRITICAL',
  'D-006': 'CRITICAL',
  'D-007': 'CONTAINED',
  'D-008': 'NORMAL',
}
const RISK_RANK = { NORMAL: 0, ELEVATED: 1, CONTAINED: 1, CRITICAL: 2 }

function riskFromFinding(f: Finding): 'NORMAL' | 'ELEVATED' | 'CRITICAL' | 'CONTAINED' {
  const code = f.title.match(/^(D-\d+b?)/)?.[1]
  return (code && RISK_BY_CODE[code]) || 'ELEVATED'
}

const connected = ref(false)
const timeline = ref<TimelineEntry[]>([])
const findings = ref<Finding[]>([])
const factoryState = ref<FactoryState | null>(null)
const demoMode = ref<DemoMode | null>(null)
const authorityMap = ref<AuthorityMap | null>(null)
const riskState = ref<'NORMAL' | 'ELEVATED' | 'CRITICAL' | 'CONTAINED'>('NORMAL')
const nodeStatus = reactive<Record<ChainActor, AgentNodeStatus>>({
  'agent-a': 'idle',
  'agent-b': 'idle',
  'agent-c': 'idle',
})
// The event that caused agent-c's authority to include a destructive
// action for the first time this run — drives 01_00 10.3's "authority
// amplification ... unmistakable at the precise event that causes it".
const amplificationEventId = ref<string | null>(null)

// Every credential_events row seen this run, keyed by id — the same row
// arrives twice (issued, then again once markCredentialRevoked's own
// publishEvent fires — backend/src/audit.js), so this is a map-by-id, not
// an append-only list, to avoid a stale "issued" duplicate sitting next
// to its own later "revoked" update. Powers CredentialLedger.vue.
const credentialEvents = reactive(new Map<string, CredentialEvent>())

let source: EventSource | null = null
let doneTimer: ReturnType<typeof setTimeout> | null = null
let initialized = false

function resetChainState() {
  nodeStatus['agent-a'] = 'idle'
  nodeStatus['agent-b'] = 'idle'
  nodeStatus['agent-c'] = 'idle'
  amplificationEventId.value = null
  riskState.value = 'NORMAL'
  credentialEvents.clear()
}

// Agent-c has no explicit "I'm finished" signal (the agent runtime logs
// this locally but the backend has no route for it yet — a real, known
// gap, not an oversight — see agents/src/runtime.js). Inferring
// completion from a quiet period after its last real event is a
// legitimate technique (reacting to the absence of further activity),
// distinct from faking progress with a fixed-duration timer.
function armDoneTimer() {
  if (doneTimer) clearTimeout(doneTimer)
  doneTimer = setTimeout(() => {
    if (nodeStatus['agent-c'] === 'acting') nodeStatus['agent-c'] = 'done'
  }, 4000)
}

function applyEntry(entry: TimelineEntry, { fromHistory = false } = {}) {
  if (!fromHistory) timeline.value.push(entry)

  if (entry.type === 'audit_events') {
    if (entry.action === 'task.created' && entry.actor_id === 'agent-a') {
      resetChainState()
      nodeStatus['agent-a'] = 'reasoning'
    } else if (entry.action === 'task.delegated') {
      if (entry.delegated_by && CHAIN_ACTORS.includes(entry.delegated_by as ChainActor)) {
        // The delegating agent's runLoop already returned by this point
        // (agents/src/runtime.js) — this event IS its completion signal,
        // not a handoff still in progress.
        nodeStatus[entry.delegated_by as ChainActor] = 'done'
      }
      if (CHAIN_ACTORS.includes(entry.actor_id as ChainActor)) {
        nodeStatus[entry.actor_id as ChainActor] = 'reasoning'
      }
    }
  }

  if (entry.type === 'authority_decisions') {
    const actor = entry.actor_id as ChainActor
    if (CHAIN_ACTORS.includes(actor) && nodeStatus[actor] === 'reasoning') {
      nodeStatus[actor] = 'acting'
    }
    if (actor === 'agent-c') armDoneTimer()
  }

  if (entry.type === 'credential_events') {
    credentialEvents.set(entry.credential_event_id, entry)
    if (entry.vault_role === 'factory-bad-role' && !entry.revoked_at) {
      amplificationEventId.value = entry.credential_event_id
      if (nodeStatus['agent-c'] !== 'done') nodeStatus['agent-c'] = 'acting'
    }
  }

  if (entry.type === 'database_changes') {
    if (!fromHistory) refreshFactoryState()
    if (CHAIN_ACTORS.includes(entry.actor_id as ChainActor)) armDoneTimer()
  }

  if (entry.type === 'findings') {
    findings.value.push(entry)
    const next = riskFromFinding(entry)
    if (next === 'CONTAINED') riskState.value = 'CONTAINED'
    else if (RISK_RANK[next] >= RISK_RANK[riskState.value]) riskState.value = next
  }
}

async function refreshFactoryState() {
  const { getFactoryState } = useDemoApi()
  try {
    factoryState.value = await getFactoryState()
  } catch {
    // A transient fetch failure here just means the counters stay stale
    // for one more event — not worth surfacing as a hard error.
  }
}

async function refreshAuthority() {
  const { getAuthority } = useDemoApi()
  try {
    authorityMap.value = await getAuthority()
  } catch {
    // Same rationale as refreshFactoryState.
  }
}

async function backfill() {
  const { getDemoMode, getEventsHistory, getFindings, getFactoryState, getAuthority } = useDemoApi()
  const [mode, history, findingRows, state, authority] = await Promise.allSettled([
    getDemoMode(),
    getEventsHistory(),
    getFindings(),
    getFactoryState(),
    getAuthority(),
  ])
  if (mode.status === 'fulfilled') demoMode.value = mode.value
  if (state.status === 'fulfilled') factoryState.value = state.value
  if (authority.status === 'fulfilled') authorityMap.value = authority.value
  if (history.status === 'fulfilled') {
    timeline.value = history.value
    for (const entry of history.value) applyEntry(entry, { fromHistory: true })
  }
  if (findingRows.status === 'fulfilled') {
    findings.value = []
    for (const f of findingRows.value) applyEntry({ type: 'findings', ...f }, { fromHistory: true })
  }
}

function connect(apiBase: string) {
  if (source) return
  source = new EventSource(`${apiBase}/api/events/stream`)
  source.onopen = () => { connected.value = true }
  source.onerror = () => { connected.value = false }

  const channels = ['audit_events', 'authority_decisions', 'credential_events', 'database_changes', 'delegations', 'findings'] as const
  for (const channel of channels) {
    source.addEventListener(channel, (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data)
        applyEntry({ type: channel, ...payload } as TimelineEntry)
      } catch {
        // Malformed frame — skip rather than crash the whole stream handler.
      }
    })
  }
}

export function useEventStream() {
  const config = useRuntimeConfig()

  if (!initialized && import.meta.client) {
    initialized = true
    backfill().finally(() => connect(config.public.apiBase))
  }

  onScopeDispose(() => {
    // Deliberately does NOT close `source` — this is a shared, module-
    // level connection (see this file's own header comment); the last
    // component unmounting should not drop the stream for a still-open
    // browser tab (e.g. navigating within a future multi-page build).
  })

  const credentialLedger = computed(() =>
    [...credentialEvents.values()].sort(
      (a, b) => new Date(a.issued_at).getTime() - new Date(b.issued_at).getTime(),
    ),
  )

  return {
    connected,
    timeline,
    findings,
    factoryState,
    demoMode,
    authorityMap,
    riskState,
    nodeStatus,
    amplificationEventId,
    credentialLedger,
    refreshAuthority,
    refreshFactoryState,
    setDemoModeLocal: (mode: DemoMode) => { demoMode.value = mode },
    resetLocalState: () => {
      timeline.value = []
      findings.value = []
      resetChainState()
    },
  }
}
