<script setup lang="ts">
// prompts/v2/02_06 — the recoverable micro-DAG's own dashboard section.
// Its own route, not folded into Overview — mirrors agent-d.vue's own
// precedent of keeping a genuinely distinct execution model in its own
// place rather than crowding the v1 story.
import type { DagNodeKey, FaultInjectionMode, Profile, WorkflowMode } from '~/types/factory'

definePageMeta({ layout: 'dashboard' })

const {
  demoMode,
  dagTopology,
  setDemoModeLocal,
  refreshDagTopology,
} = useEventStream()

const {
  setDemoMode,
  getWorkflowMode,
  setWorkflowMode,
  getFaultInjectionMode,
  setFaultInjectionMode,
  initDagRun,
  retryDagNode,
} = useDemoApi()

const workflowMode = ref<WorkflowMode | null>(null)
const faultInjectionMode = ref<FaultInjectionMode | null>(null)
const switching = ref(false)
const starting = ref(false)
const startError = ref<string | null>(null)
const drawerOpen = ref(false)
const selectedNode = ref<DagNodeKey | null>(null)

onMounted(async () => {
  const [wm, fm] = await Promise.all([getWorkflowMode(), getFaultInjectionMode()])
  workflowMode.value = wm.workflowMode
  faultInjectionMode.value = fm.faultInjectionMode
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
    startError.value =
      body?.statusMessage || body?.message || 'Failed to start the micro-DAG run — see server logs.'
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
      :disabled="switching || runActive"
      @update:profile="onProfileChange"
      @update:workflow-mode="onWorkflowModeChange"
      @update:fault-injection-mode="onFaultInjectionModeChange"
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
      <p class="dag-start-hint">
        Uses the current run (reset the factory first for a clean start).
      </p>
    </div>
    <p v-else class="dag-start-hint">
      Switch Execution Model to "Recoverable Micro-DAG (v2)" to start a v2 run.
    </p>
    <p v-if="startError" class="dag-error">{{ startError }}</p>

    <DagVisualizer :topology="dagTopology" @select-node="onSelectNode" @retry="onRetry" />

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
