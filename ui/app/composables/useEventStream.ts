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
  DagRunTopology,
  DemoMode,
  FactoryState,
  Finding,
  TimelineEntry,
} from '~/types/factory'

// Prompt 01.02 Phase 3 (input/Codex_Feedback.md): the human-readable
// causal story — "Raymon asked the question -> Agent A accepted it ->
// ... -> Agent D warned about it" — reconstructed entirely from real
// evidence already in `timeline`, never invented. A step is only ever
// pushed once its underlying event has actually arrived (01_00's own
// "no faked progress" rule extended here); BAD and GOOD diverge visibly
// at whichever of the credential-authority / boundary-denial /
// destructive-mutation / contained-mutation steps actually happened,
// not from a hardcoded profile branch.
export interface NarrativeStep {
  id: string
  text: string
  tone: 'neutral' | 'info' | 'warning' | 'critical' | 'contained'
}

function deriveNarrative(entries: TimelineEntry[]): NarrativeStep[] {
  const steps: NarrativeStep[] = []
  const issuedSeen = new Set<string>()
  const revokedSeen = new Set<string>()

  for (const e of entries) {
    if (e.type === 'audit_events' && e.action === 'task.created' && e.actor_id === 'agent-a') {
      const who = e.delegated_by || 'An operator'
      steps.push({ id: `ask-${e.event_id}`, text: `${who} asked the question`, tone: 'neutral' })
      steps.push({ id: `accept-${e.event_id}`, text: 'Assistant accepted the task', tone: 'neutral' })
    }

    if (e.type === 'audit_events' && e.action === 'task.delegated') {
      if (e.delegated_by === 'agent-a' && e.actor_id === 'agent-b') {
        steps.push({ id: `del-ab-${e.event_id}`, text: 'Assistant delegated to Investigator', tone: 'neutral' })
      }
      if (e.delegated_by === 'agent-b' && e.actor_id === 'agent-c') {
        steps.push({ id: `del-bc-${e.event_id}`, text: 'Investigator delegated to Corrector', tone: 'neutral' })
      }
    }

    if (e.type === 'credential_events' && e.actor_id === 'agent-c') {
      // GET /api/events/history returns ONE row per credential_event_id
      // (the row's CURRENT state, ordered by issued_at) — it is not a
      // per-transition log the way live SSE is, where issuance and
      // revocation arrive as two separate messages. Found live: on a
      // page reload after a run had already completed, an entry whose
      // CONTENT was already revoked still only appeared once, at its
      // issuance position — deriveNarrative only checked !e.revoked_at
      // to decide whether to render "issued," so the revoked reload
      // case rendered NEITHER "issued" NOR the right order, only
      // "revoked" floating before the mutations that actually preceded
      // it. Deciding "render issued" independently of revoked_at (only
      // gated on "not already rendered for this id") fixes both paths:
      // live SSE still renders issued then revoked as two arrivals;
      // backfill of an already-revoked credential renders both, right
      // here, adjacently — the best honest ordering this endpoint's own
      // one-row-per-id shape allows.
      if (!issuedSeen.has(e.credential_event_id)) {
        issuedSeen.add(e.credential_event_id)
        const overPrivileged = e.vault_role === 'factory-bad-role'
        steps.push({
          id: `cred-authority-${e.credential_event_id}`,
          text: overPrivileged
            ? 'Corrector received broad, over-privileged authority'
            : 'Corrector received narrow, bounded authority',
          tone: overPrivileged ? 'critical' : 'info',
        })
        steps.push({
          id: `cred-issued-${e.credential_event_id}`,
          text: "Vault issued Corrector's task-bound database credential",
          tone: overPrivileged ? 'critical' : 'info',
        })
      }
      if (e.revoked_at && e.revoked_reason === 'task_completed' && !revokedSeen.has(e.credential_event_id)) {
        revokedSeen.add(e.credential_event_id)
        steps.push({
          id: `cred-revoked-${e.credential_event_id}`,
          text: "Corrector's credential was revoked — task complete",
          tone: 'neutral',
        })
      }
    }

    if (
      e.type === 'authority_decisions' &&
      e.actor_id === 'agent-c' &&
      e.policy_result === 'DENY' &&
      DESTRUCTIVE_ACTIONS.has(e.requested_action)
    ) {
      steps.push({ id: `deny-${e.decision_id}`, text: 'The authority boundary denied the request', tone: 'contained' })
    }

    if (e.type === 'database_changes' && e.actor_id === 'agent-c') {
      const destructive = e.action === 'DELETE' || (e.action === 'UPDATE' && e.table_name === 'products')
      if (destructive) {
        steps.push({ id: `dmg-${e.change_id}`, text: 'Corrector caused the damage', tone: 'critical' })
        steps.push({ id: `dmg-recorded-${e.change_id}`, text: 'PostgreSQL recorded the resulting change', tone: 'critical' })
      } else if (e.action === 'UPDATE' && e.table_name === 'orders') {
        steps.push({ id: `status-${e.change_id}`, text: 'Corrector updated order status', tone: 'neutral' })
      }
    }

    if (e.type === 'findings' && e.actor_id === 'agent-d') {
      const code = e.title.match(/^(D-\d+b?)/)?.[1]
      if (code === 'D-005' || code === 'D-006') {
        steps.push({ id: `finding-${e.finding_id}`, text: 'Discovery warned about it', tone: 'critical' })
      } else if (code === 'D-007') {
        steps.push({ id: `finding-${e.finding_id}`, text: 'Discovery confirmed containment', tone: 'contained' })
      }
    }
  }

  return steps
}

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

// v2 (prompts/v2/02_06): the recoverable micro-DAG's own live state.
// SSE payloads for dag_nodes/dag_node_attempts carry only a partial
// patch (whatever the emitting call site happened to have in hand —
// see backend/src/orchestrator/dag-engine.js's own publishEvent calls),
// not the full row, so this follows the same pattern database_changes
// already uses below (refreshFactoryState() on each event) rather than
// hand-merging partial payloads: any DAG-related event schedules one
// debounced full re-fetch of the run's topology via GET
// /api/dag/runs/:id, which always returns the complete, authoritative
// current state.
const dagTopology = ref<DagRunTopology | null>(null)
let dagRefreshPending = false
let dagRefreshTimer: ReturnType<typeof setTimeout> | null = null

function scheduleDagTopologyRefresh(runId: string | null | undefined) {
  if (!runId) return
  if (dagRefreshTimer) return
  dagRefreshPending = true
  dagRefreshTimer = setTimeout(async () => {
    dagRefreshTimer = null
    if (!dagRefreshPending) return
    dagRefreshPending = false
    const { getDagRun } = useDemoApi()
    try {
      dagTopology.value = await getDagRun(runId)
    } catch {
      // A DAG run that hasn't been initialized yet (v2 mode selected but
      // POST /api/dag/runs not yet called) 404s here — not an error
      // worth surfacing, just means there's nothing to show yet.
    }
  }, 150)
}

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

// Agent-c DOES now have an explicit completion signal (Prompt 01.02
// Phase 2, agents/src/runtime.js -> POST /api/tasks/:taskId/complete) —
// but it doesn't itself publish an SSE event. Its real, visible effect
// is the credential_events row it triggers (revoked_reason=
// 'task_completed', handled directly in applyEntry below), which DOES
// publish. This timer stays as a fallback for the path that signal
// can't cover: agent-c stopping WITHOUT ever having requested a
// credential (nothing to revoke, so no credential_events row exists to
// react to) — inferring completion from a quiet period after its last
// real event in that specific case only, not faking progress with a
// fixed-duration timer.
function armDoneTimer() {
  if (doneTimer) clearTimeout(doneTimer)
  doneTimer = setTimeout(() => {
    if (nodeStatus['agent-c'] === 'acting') nodeStatus['agent-c'] = 'done'
  }, 4000)
}

function applyEntry(entry: TimelineEntry, { fromHistory = false } = {}) {
  // A live task.created always starts a fresh timeline, not only an
  // explicit Reset click — found live (Prompt 01.02 Phase 3 verification
  // with a real browser session): resetLocalState() clears the client
  // array immediately on the Reset button, but a still-in-flight
  // previous run's own agent containers can keep producing real events
  // for a few more seconds; those arrived after the clear and silently
  // repopulated the "story" with a mix of two different runs' steps.
  // Self-healing this at the one event that unambiguously means "a
  // genuinely new run has begun" is more robust than trying to win a
  // timing race on the Reset button alone.
  if (!fromHistory && entry.type === 'audit_events' && entry.action === 'task.created' && entry.actor_id === 'agent-a') {
    timeline.value = []
    findings.value = []
  }
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
    if (entry.revoked_at && entry.revoked_reason === 'task_completed') {
      if (doneTimer) clearTimeout(doneTimer)
      nodeStatus['agent-c'] = 'done'
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

  // v2 (prompts/v2/02_06): dag_runs/dag_nodes/dag_node_attempts are the
  // generic table-mirror events (backend/src/events.js's own
  // publishEvent convention, same as the v1 channels above);
  // DAG_NODE_CLAIMED/DAG_NODE_INVALIDATED/DAG_ATTEMPT_TIMED_OUT/
  // EVIDENCE_LEASE_REVOKED are the distinctly-named ones added in 02_02/
  // 02_05 specifically so agent-d's classify() (and this dashboard) have
  // something more specific to match on than a generic status field.
  // Every one of them just triggers the same debounced re-fetch above.
  const dagChannels = [
    'dag_runs',
    'dag_nodes',
    'dag_node_attempts',
    'DAG_NODE_CLAIMED',
    'DAG_NODE_INVALIDATED',
    'DAG_ATTEMPT_TIMED_OUT',
    'EVIDENCE_LEASE_REVOKED',
  ] as const
  for (const channel of dagChannels) {
    source.addEventListener(channel, (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data)
        scheduleDagTopologyRefresh(payload.run_id ?? dagTopology.value?.run?.run_id)
      } catch {
        // Malformed frame — skip.
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

  const narrativeSteps = computed(() => deriveNarrative(timeline.value))

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
    narrativeSteps,
    refreshAuthority,
    refreshFactoryState,
    setDemoModeLocal: (mode: DemoMode) => { demoMode.value = mode },
    resetLocalState: () => {
      timeline.value = []
      findings.value = []
      resetChainState()
      dagTopology.value = null
    },
    // v2 (02_06)
    dagTopology,
    refreshDagTopology: (runId: string) => scheduleDagTopologyRefresh(runId),
  }
}
