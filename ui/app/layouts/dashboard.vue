<script setup lang="ts">
// prompts/frontend/01_02_dashboard_navigation_and_sidebar.md — shared
// shell for every authenticated section (Overview, Records, Credentials,
// Timeline, Agent D). Owns the header and sidebar so navigating between
// sections never remounts them or drops the live SSE connection
// (useEventStream's own module-level singleton already survives Nuxt
// client-side route changes on its own — this layout just avoids
// re-creating the chrome around it).
import type { UserSession } from '~/composables/useDemoApi'

const { connected, riskState, credentialLedger, timeline } = useEventStream()
const { getMe, logout } = useDemoApi()

// Shared (not a local ref) so the /agent-d page itself can also read it,
// e.g. to redirect if it's visited directly while Agent D visibility is
// off — the layout alone can't see a route-level guard on its own page.
const showAgentD = useState('show-agent-d', () => true)
const session = ref<UserSession | null>(null)
const sidebarOpen = ref(false)

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

const route = useRoute()
const router = useRouter()
// If Agent D visibility is turned off while its own section is open,
// return to Overview rather than leaving a hidden section's content on
// screen with no way back to it via the sidebar.
watch(showAgentD, (visible) => {
  if (!visible && route.path.startsWith('/agent-d')) {
    router.push('/')
  }
})
</script>

<template>
  <div class="shell">
    <header class="dashboard-header">
      <div class="dashboard-title-group">
        <button
          type="button"
          class="sidebar-toggle"
          :aria-expanded="sidebarOpen"
          aria-label="Toggle section navigation"
          @click="sidebarOpen = !sidebarOpen"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
        </button>
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
          <span>Vulnerability discovery</span>
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

    <div class="shell-body">
      <AppSidebar
        v-model:open="sidebarOpen"
        :show-agent-d="showAgentD"
        :risk-state="riskState"
        :credential-ledger="credentialLedger"
        :event-count="timeline.length"
      />
      <main class="shell-main">
        <slot />
      </main>
    </div>

    <FactoryFooter />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 20px clamp(16px, 2vw, 28px);
  border-bottom: var(--border-width) solid var(--color-border-subtle);
}
.dashboard-title-group {
  display: flex;
  align-items: center;
  gap: 14px;
}
.sidebar-toggle {
  display: none;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: var(--border-width) solid var(--color-border-subtle);
  border-radius: var(--radius-control);
  color: var(--color-text-secondary);
  cursor: pointer;
}
.sidebar-toggle svg { width: 18px; height: 18px; }
.sidebar-toggle:hover { color: var(--color-accent-primary); border-color: var(--color-border-active); }

.dashboard-mark {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  filter: drop-shadow(0 0 10px rgb(237 186 71 / 0.25));
}
.dashboard-title {
  font-size: clamp(22px, 1.4vw, 32px);
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

.shell-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.shell-main {
  flex: 1;
  min-width: 0;
  max-width: var(--dashboard-max-width);
  margin: 0 auto;
  width: 100%;
  padding: clamp(16px, 1.4vw, 28px);
}

@media (max-width: 900px) {
  .sidebar-toggle { display: inline-flex; }
  .dashboard-subtitle { display: none; }
}
</style>
