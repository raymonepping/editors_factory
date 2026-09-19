<script setup lang="ts">
// prompts/frontend/01_02_dashboard_navigation_and_sidebar.md — Overview:
// the lean landing view. Only the core live story lives here (Human
// Request, Agent Chain, The Story, Factory State, Effective Authority);
// Records, the full Credential Ledger, the full Event Timeline, and
// Agent D's full detail moved to their own sections, reachable from the
// sidebar in the shared `dashboard` layout.
import type { Profile } from '~/types/factory'

definePageMeta({ layout: 'dashboard' })

const {
  timeline,
  factoryState,
  demoMode,
  authorityMap,
  nodeStatus,
  amplificationEventId,
  narrativeSteps,
  refreshAuthority,
  refreshFactoryState,
  setDemoModeLocal,
  resetLocalState,
} = useEventStream()

const { setDemoMode, resetDemo, runDemo, FIXED_TRIGGER_PROMPT } = useDemoApi()

const running = ref(false)
const switching = ref(false)

async function onProfileChange(profile: Profile) {
  switching.value = true
  try {
    const mode = await setDemoMode(profile)
    setDemoModeLocal(mode)
    await refreshAuthority()
  } finally {
    switching.value = false
  }
}

async function onRun() {
  running.value = true
  try {
    await runDemo(FIXED_TRIGGER_PROMPT)
  } finally {
    running.value = false
  }
}

async function onReset() {
  resetLocalState()
  await resetDemo()
  await Promise.all([refreshFactoryState(), refreshAuthority()])
}
</script>

<template>
  <div class="overview">
    <HumanRequest
      :prompt="FIXED_TRIGGER_PROMPT"
      :profile="demoMode?.profile ?? null"
      :running="running"
      :switching="switching"
      @run="onRun"
      @reset="onReset"
      @update:profile="onProfileChange"
    />

    <AgentChain :nodes="nodeStatus" />

    <NarrativeStory :steps="narrativeSteps" />

    <FactoryState :state="factoryState" />

    <AuthorityPanel :authority="authorityMap" :amplified="!!amplificationEventId" />

    <p v-if="!timeline.length" class="overview-hint">
      Press Run to start a live BAD or GOOD journey — Records, Credentials, Timeline, and Discovery detail live in the sidebar.
    </p>
  </div>
</template>

<style scoped>
.overview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--gap-panel);
  align-items: start;
}
.overview > :deep(section) { min-width: 0; }

/* Human Request, Agent Chain, and The Story each span the full width;
   Factory State and Effective Authority sit side by side below them. */
.overview > :nth-child(-n+3) {
  grid-column: 1 / -1;
}

.overview-hint {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 8px 0;
}

@media (max-width: 900px) {
  .overview { grid-template-columns: 1fr; }
}
</style>
