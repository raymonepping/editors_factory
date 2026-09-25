<script setup lang="ts">
// prompts/v2/02_06 — the recoverable micro-DAG's own dashboard section.
// Its own route, not folded into Overview — mirrors agent-d.vue's own
// precedent of keeping a genuinely distinct execution model in its own
// place rather than crowding the v1 story.
import type { AuthorityMechanism, DagNodeKey, FaultInjectionMode, Profile, WorkflowMode } from '~/types/factory'

definePageMeta({ layout: 'dashboard' })

const {
  demoMode,
  dagTopology,
  dagNarrativeSteps,
  setDemoModeLocal,
  refreshDagTopology,
} = useEventStream()

// prompts/frontend/01_04: Graph is the existing, unchanged default —
// nobody's current workflow shifts under them. Story reads the same
// already-fetched dagTopology, no re-fetch on switch.
const activeTab = ref<'graph' | 'story'>('graph')

const {
  getDemoMode,
  setDemoMode,
  getWorkflowMode,
  setWorkflowMode,
  getFaultInjectionMode,
  setFaultInjectionMode,
  getAuthorityMechanism,
  setAuthorityMechanism,
  initDagRun,
  retryDagNode,
} = useDemoApi()

const workflowMode = ref<WorkflowMode | null>(null)
const faultInjectionMode = ref<FaultInjectionMode | null>(null)
const authorityMechanism = ref<AuthorityMechanism | null>(null)
// The CURRENT run's own stored workflow_mode, independent of the
// selector above (which reflects what the NEXT run will get). Fetched
// fresh here rather than trusted from the shared demoMode ref — found
// live, reported three times: demoMode is shared across pages and
// nothing refreshes it after a reset performed on a different page
// (Overview's own onReset only refreshes factory-state/authority), so
// an operator landing on /dag after resetting elsewhere could see a
// stale value here otherwise. Same reasoning workflowMode/
// faultInjectionMode above already fetch fresh rather than trust
// shared state.
const currentRunWorkflowMode = ref<WorkflowMode | null>(null)
const switching = ref(false)
const starting = ref(false)
const startError = ref<string | null>(null)
const drawerOpen = ref(false)
const selectedNode = ref<DagNodeKey | null>(null)

// True exactly when clicking Start would 409 for the reason this page
// has now seen reported three times: the selector says recoverable_dag,
// but the current run was created before that switch and still carries
// its old mode. Surfaced before the click, not only after it fails.
const modeMismatch = computed(() =>
  workflowMode.value === 'recoverable_dag' &&
  currentRunWorkflowMode.value !== null &&
  currentRunWorkflowMode.value !== 'recoverable_dag',
)

async function refreshCurrentRunWorkflowMode() {
  const mode = await getDemoMode()
  currentRunWorkflowMode.value = mode.currentRunWorkflowMode
}

onMounted(async () => {
  const [wm, fm, am] = await Promise.all([
    getWorkflowMode(),
    getFaultInjectionMode(),
    getAuthorityMechanism(),
    refreshCurrentRunWorkflowMode(),
  ])
  workflowMode.value = wm.workflowMode
  faultInjectionMode.value = fm.faultInjectionMode
  authorityMechanism.value = am.authorityMechanism
  if (demoMode.value?.runId) refreshDagTopology(demoMode.value.runId)
})

// A v2 run is "active" (controls disabled) once its own DAG has been
// initialized and hasn't reached a terminal status yet — mirrors
// HumanRequest.vue's own reset-arms-controls pattern for v1.
const runActive = computed(() => {
  const status = dagTopology.value?.run?.status
  return status === 'pending' || status === 'running'
})

async function onProfileChange(profile: Profile) {
  switching.value = true
  try {
    const mode = await setDemoMode(profile)
    setDemoModeLocal(mode)
    // Switching profile starts a fresh run (server-side), which captures
    // whatever workflow_mode is currently in memory — already in this
    // same response, no extra fetch needed.
    currentRunWorkflowMode.value = mode.currentRunWorkflowMode
  } finally {
    switching.value = false
  }
}

async function onWorkflowModeChange(mode: WorkflowMode) {
  switching.value = true
  startError.value = null
  try {
    const res = await setWorkflowMode(mode)
    workflowMode.value = res.workflowMode
  } finally {
    switching.value = false
  }
}

async function onFaultInjectionModeChange(mode: FaultInjectionMode) {
  switching.value = true
  try {
    const res = await setFaultInjectionMode(mode)
    faultInjectionMode.value = res.faultInjectionMode
  } finally {
    switching.value = false
  }
}

async function onAuthorityMechanismChange(mechanism: AuthorityMechanism) {
  switching.value = true
  try {
    const res = await setAuthorityMechanism(mechanism)
    authorityMechanism.value = res.authorityMechanism
  } finally {
    switching.value = false
  }
}

async function onStartRun() {
  // Found live: initDagRun() (POST /api/dag/runs) uses the backend's own
  // server-side current run — it takes no run id from the client at
  // all — so gating this on demoMode.value?.runId was both unnecessary
  // and actively wrong: demoMode is populated by useEventStream's own
  // backfill(), which may not have resolved yet on a fresh navigation
  // straight to /dag, silently no-opping this click with no feedback.
  starting.value = true
  startError.value = null
  try {
    dagTopology.value = await initDagRun()
  } catch (err) {
    // Found live: this used to only console.error — invisible during
    // normal use, so a 409 here (workflow_mode switched via this page's
    // own selector, but the CURRENT run was already created under the
    // old mode — switching the selector alone never retroactively
    // changes it) looked exactly like "nothing happens" from the
    // button's own perspective. The real reason from factory-api
    // (server/routes/gateway's own [...path].ts now forwards it instead
    // of a generic message) is what actually tells the operator what to
    // do next — surface it here rather than only in devtools.
    //
    // ofetch's own FetchError.data is the WHOLE parsed Nitro error body
    // (found live — it is not, as it might look, just the inner `data`
    // field the gateway route passed to createError): that body's own
    // `statusMessage` is where the gateway's forwarded factory-api
    // message actually lands. The body also carries a same-named but
    // unrelated top-level `error: true` flag (Nitro's own "this is an
    // error response" marker) — reading `err.data?.error` here would
    // silently read that boolean instead of the real message, which is
    // exactly what happened before this was checked against the real
    // response shape rather than assumed.
    const body = (err as { data?: { statusMessage?: string; message?: string } })?.data
    const reason =
      body?.statusMessage || body?.message || 'Failed to start the micro-DAG run — see server logs.'
    // The real reason above is factory-api's own message, written for an
    // API caller (it names the PUT/POST route to call) — accurate, but not
    // actionable from the dashboard itself, which has no such route to
    // click. Every 409 this button can hit shares the same real fix
    // regardless of the specific reason: the CURRENT run doesn't match
    // what's needed anymore, and a reset starts a fresh one that does.
    // Keep the real reason visible (don't replace it — it's still the
    // honest "what actually happened"), just add the concrete next step.
    startError.value = `${reason} Reset the factory, then try again.`
    console.error('Failed to start micro-DAG run:', err)
  } finally {
    starting.value = false
  }
}

function onSelectNode(nodeKey: DagNodeKey) {
  selectedNode.value = nodeKey
  drawerOpen.value = true
}

async function onRetry(nodeKey: DagNodeKey) {
  // Same silent-failure shape onStartRun had — found while checking this
  // page for other spots with the same gap, not from a separate report.
  // A rejected retry (node not actually 'failed' anymore, a viewer
  // without the operator role, a stale run) failed with no feedback at
  // all beyond an uncaught rejection in devtools. Reuses startError/
  // .dag-error rather than adding a second error slot — both are "the
  // last DAG action failed," shown in the same place.
  if (!dagTopology.value?.run) return
  startError.value = null
  try {
    await retryDagNode(dagTopology.value.run.run_id, nodeKey)
    refreshDagTopology(dagTopology.value.run.run_id)
  } catch (err) {
    const body = (err as { data?: { statusMessage?: string; message?: string } })?.data
    startError.value =
      body?.statusMessage || body?.message || `Failed to retry "${nodeKey}" — see server logs.`
    console.error(`Failed to retry node "${nodeKey}":`, err)
  }
}
</script>

<template>
  <div class="dag-page">
    <WorkflowControlBar
      :profile="demoMode?.profile ?? null"
      :workflow-mode="workflowMode"
      :fault-injection-mode="faultInjectionMode"
      :authority-mechanism="authorityMechanism"
      :disabled="switching || runActive"
      @update:profile="onProfileChange"
      @update:workflow-mode="onWorkflowModeChange"
      @update:fault-injection-mode="onFaultInjectionModeChange"
      @update:authority-mechanism="onAuthorityMechanismChange"
    />

    <div v-if="workflowMode === 'recoverable_dag'" class="dag-start-row">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="starting || runActive"
        @click="onStartRun"
      >
        <span v-if="starting">Starting…</span>
        <span v-else-if="runActive">Run in progress</span>
        <span v-else>Start Micro-DAG Run</span>
      </button>
      <p v-if="modeMismatch" class="dag-error">
        The current run was started under "{{ currentRunWorkflowMode }}", not
        Recoverable Micro-DAG — Start will fail until you reset the factory.
        Reset now, then start.
      </p>
      <p v-else class="dag-start-hint">
        Uses the current run. Switching Execution Model does not change a
        run already in progress or already reset — if you just switched
        to Recoverable Micro-DAG, reset the factory now so the next run
        picks it up, then start.
      </p>
    </div>
    <p v-else class="dag-start-hint">
      Switch Execution Model to "Recoverable Micro-DAG (v2)" to start a v2 run.
    </p>
    <p v-if="startError" class="dag-error">{{ startError }}</p>

    <div class="dag-tabs" role="tablist" aria-label="Run view">
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'graph'"
        class="dag-tab"
        :class="{ 'dag-tab--active': activeTab === 'graph' }"
        @click="activeTab = 'graph'"
      >
        Graph
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'story'"
        class="dag-tab"
        :class="{ 'dag-tab--active': activeTab === 'story' }"
        @click="activeTab = 'story'"
      >
        Story
      </button>
    </div>

    <DagVisualizer
      v-show="activeTab === 'graph'"
      :topology="dagTopology"
      @select-node="onSelectNode"
      @retry="onRetry"
    />
    <NarrativeStory v-show="activeTab === 'story'" :steps="dagNarrativeSteps" />

    <NodeAttemptDrawer
      :open="drawerOpen"
      :node-key="selectedNode"
      :topology="dagTopology"
      @close="drawerOpen = false"
    />
  </div>
</template>

<style scoped>
.dag-page {
  display: flex;
  flex-direction: column;
  gap: var(--gap-panel);
  max-width: 1100px;
}
.dag-tabs {
  display: flex;
  gap: 6px;
  border-bottom: var(--border-width) solid var(--color-border-subtle);
}
.dag-tab {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
}
.dag-tab:hover {
  color: var(--color-text-secondary);
}
.dag-tab--active {
  color: var(--color-text-primary);
  border-bottom-color: var(--factory-blue-400);
}
.dag-start-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dag-start-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}
.dag-error {
  margin: 0;
  font-size: 12px;
  color: var(--color-state-critical);
}
</style>
