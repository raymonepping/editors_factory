<script setup lang="ts">
import type { Profile } from '~/types/factory'

const {
  connected,
  timeline,
  findings,
  factoryState,
  demoMode,
  authorityMap,
  riskState,
  nodeStatus,
  amplificationEventId,
  refreshAuthority,
  refreshFactoryState,
  setDemoModeLocal,
  resetLocalState,
} = useEventStream()

const { setDemoMode, resetDemo, runDemo, FIXED_TRIGGER_PROMPT } = useDemoApi()

const running = ref(false)
const switching = ref(false)
const showAgentD = ref(true)

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
  <div class="dashboard">
    <header class="dashboard-header">
      <div class="dashboard-title-group">
        <h1 class="dashboard-title">The Factory</h1>
        <span class="state-pill" :style="{ color: connected ? 'var(--color-state-healthy)' : 'var(--color-state-neutral)' }">
          {{ connected ? 'Live' : 'Connecting…' }}
        </span>
      </div>
      <label class="agent-d-toggle">
        <input type="checkbox" v-model="showAgentD" />
        <span>Enable autonomous vulnerability discovery</span>
      </label>
    </header>

    <main class="dashboard-grid">
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

      <AuthorityPanel :authority="authorityMap" :amplified="!!amplificationEventId" />

      <FactoryState :state="factoryState" />

      <AgentDLane v-if="showAgentD" :risk-state="riskState" :findings="findings" />

      <EventTimeline :entries="timeline" />
    </main>

    <footer class="dashboard-footer">
      <p>Break the factory. Learn from it. Reset. Repeat. No regrets.</p>
    </footer>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px 20px 40px;
  gap: var(--gap-panel);
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.dashboard-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dashboard-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  letter-spacing: -0.01em;
}

.agent-d-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--gap-panel);
}
.dashboard-grid > :deep(section) { min-width: 0; }

/* Human request spans full width above the chain. */
.dashboard-grid > :first-child {
  grid-column: 1 / -1;
}

.dashboard-footer {
  text-align: center;
  color: var(--color-text-muted);
  font-size: 12px;
  padding-top: 12px;
}

@media (max-width: 900px) {
  .dashboard-grid { grid-template-columns: 1fr; }
}
</style>
