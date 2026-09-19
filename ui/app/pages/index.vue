<script setup lang="ts">
import type { Profile } from '~/types/factory'
import type { UserSession } from '~/composables/useDemoApi'

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
  narrativeSteps,
  refreshAuthority,
  refreshFactoryState,
  setDemoModeLocal,
  resetLocalState,
} = useEventStream()

const { setDemoMode, resetDemo, runDemo, FIXED_TRIGGER_PROMPT, getMe, logout } = useDemoApi()

const running = ref(false)
const switching = ref(false)
const showAgentD = ref(true)
const session = ref<UserSession | null>(null)

onMounted(async () => {
  try {
    session.value = await getMe()
  } catch {
    // handled by middleware
  }
})

async function handleSignOut() {
  try {
    const res = await logout()
    if (res.logoutUrl) {
      window.location.href = res.logoutUrl
    } else {
      window.location.href = '/login'
    }
  } catch {
    window.location.href = '/login'
  }
}

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

      <div class="header-actions">
        <label class="agent-d-toggle">
          <input type="checkbox" v-model="showAgentD" />
          <span>Vulnerability discovery (Agent D)</span>
        </label>

        <div v-if="session?.user" class="user-badge">
          <span class="user-name">{{ session.user }}</span>
          <span class="role-tag" :class="session.role === 'factory-operator' ? 'role-operator' : 'role-viewer'">
            {{ session.role }}
          </span>
          <button class="logout-btn" @click="handleSignOut" title="Sign out">Sign out</button>
        </div>
      </div>
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

      <FactoryRecords />

      <NarrativeStory :steps="narrativeSteps" />

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
  max-width: var(--dashboard-max-width);
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
  font-size: clamp(26px, 1.5vw, 38px);
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}

.user-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  font-size: 12px;
}
.user-name {
  color: var(--color-text-primary);
  font-weight: 600;
}
.role-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.role-operator {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
  border: 1px solid rgba(249, 115, 22, 0.4);
}
.role-viewer {
  background: rgba(148, 163, 184, 0.2);
  color: #cbd5e1;
  border: 1px solid rgba(148, 163, 184, 0.4);
}
.logout-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
  margin-left: 4px;
  padding: 2px 4px;
  border-radius: 4px;
}
.logout-btn:hover {
  color: var(--color-accent-primary);
  background: rgba(255, 255, 255, 0.05);
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
  padding-bottom: calc(var(--footer-height, 160px) + 24px);
}
.dashboard-grid > :deep(section) { min-width: 0; }

.dashboard-grid > :nth-child(-n+3) {
  grid-column: 1 / -1;
}
.timeline-full { grid-column: 1 / -1; }

@media (max-width: 900px) {
  .dashboard-grid { grid-template-columns: 1fr; }
}
</style>
