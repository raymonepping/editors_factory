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
  credentialLedger,
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
        <svg class="dashboard-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="6" fill="var(--color-bg-shell)" stroke="var(--color-border-active)" stroke-width="1" />
          <path d="M6 22 L6 16 L12 16 L12 19 L20 19 L20 13 L26 13 L26 22 Z" fill="var(--color-accent-primary)" />
          <circle cx="23" cy="10" r="2.4" fill="var(--factory-gold-glow)" />
        </svg>
        <div>
          <h1 class="dashboard-title">The Factory</h1>
          <p class="dashboard-subtitle">Delegated-authority control room</p>
        </div>
        <span class="state-pill connection-pill" :class="connected ? 'tone-ok' : 'tone-neutral'">
          <span class="connection-dot" :class="{ 'is-live': connected }" aria-hidden="true" />
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

      <FactoryState :state="factoryState" />
      <AgentChain :nodes="nodeStatus" />

      <AuthorityPanel :authority="authorityMap" :amplified="!!amplificationEventId" />
      <CredentialLedger :ledger="credentialLedger" />

      <template v-if="showAgentD">
        <AgentDLane :risk-state="riskState" :findings="findings" />
        <EventTimeline :entries="timeline" />
      </template>
      <EventTimeline v-else :entries="timeline" class="timeline-full" />
    </main>

    <FactoryFooter />
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 1400px;
  margin: 0 auto;
  padding: 28px 20px 0;
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
  gap: 14px;
}
.dashboard-mark {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  filter: drop-shadow(0 0 10px rgb(237 186 71 / 0.25));
}
.dashboard-title {
  font-size: 30px;
  font-weight: 750;
  color: var(--color-text-primary);
  margin: 0;
  letter-spacing: -0.015em;
  line-height: 1.1;
}
.dashboard-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
}

.connection-pill { margin-left: 4px; }
.connection-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  display: inline-block;
}
.connection-dot.is-live {
  animation: dot-pulse 1.8s ease-in-out infinite;
}
@keyframes dot-pulse {
  0%, 100% { box-shadow: 0 0 0 rgb(111 146 120 / 0); }
  50% { box-shadow: 0 0 6px rgb(111 146 120 / 0.8); }
}
@media (prefers-reduced-motion: reduce) {
  .connection-dot.is-live { animation: none; }
}
.tone-ok { color: var(--color-state-healthy); border-color: var(--color-state-healthy); }
.tone-neutral { color: var(--color-state-neutral); border-color: var(--color-state-neutral); }

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
  /* The footer is position:fixed (FactoryFooter.vue's own comment) and
   * so reserves no space in normal flow on its own — this padding is
   * that reserved space, kept in sync with the footer's REAL rendered
   * height via the --footer-height custom property FactoryFooter.vue
   * measures live, not a guessed constant that would drift the moment
   * the footer's content wraps differently (e.g. its mobile layout). */
  padding-bottom: calc(var(--footer-height, 160px) + 24px);
}
.dashboard-grid > :deep(section) { min-width: 0; }

/* Human request spans full width above everything else. */
.dashboard-grid > :first-child {
  grid-column: 1 / -1;
}
.timeline-full { grid-column: 1 / -1; }

@media (max-width: 900px) {
  .dashboard-grid { grid-template-columns: 1fr; }
}
</style>
