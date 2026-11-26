<script setup lang="ts">
// prompts/frontend/01_02_dashboard_navigation_and_sidebar.md — the
// control-room rail that replaced the single long vertical stack.
// Reuses existing tokens/state-pill conventions only; introduces no new
// palette (01_00 section 20).
import type { CredentialEvent } from '~/types/factory'

const props = defineProps<{
  showAgentD: boolean
  riskState: 'NORMAL' | 'ELEVATED' | 'CRITICAL' | 'CONTAINED'
  credentialLedger: CredentialEvent[]
  eventCount: number
  open: boolean
}>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const route = useRoute()

const RISK_STYLE: Record<typeof props.riskState, { color: string; label: string }> = {
  NORMAL: { color: 'var(--color-state-healthy)', label: 'Normal' },
  ELEVATED: { color: 'var(--color-state-warning)', label: 'Elevated' },
  CRITICAL: { color: 'var(--color-state-critical)', label: 'Critical' },
  CONTAINED: { color: 'var(--color-state-contained)', label: 'Contained' },
}

const activeCredential = computed(() => props.credentialLedger.find((c) => !c.revoked_at) ?? null)
const credentialBadge = computed(() => {
  if (!activeCredential.value) return null
  const bad = activeCredential.value.vault_role === 'factory-bad-role'
  return { color: bad ? 'var(--color-state-critical)' : 'var(--color-state-healthy)', label: bad ? 'Live' : 'Live' }
})

interface SidebarItem {
  to: string
  label: string
  exact?: boolean
  badge?: { color: string; label: string } | null
  count?: number
  risk?: { color: string; label: string }
}

const items = computed<SidebarItem[]>(() => {
  const base: SidebarItem[] = [
    { to: '/', label: 'Overview', exact: true },
    { to: '/dag', label: 'Micro-DAG' },
    { to: '/records', label: 'Records' },
    { to: '/credentials', label: 'Credentials', badge: credentialBadge.value },
    { to: '/timeline', label: 'Timeline', count: props.eventCount },
  ]
  if (props.showAgentD) {
    base.push({ to: '/agent-d', label: 'Discovery', risk: RISK_STYLE[props.riskState] })
  }
  return base
})

function isActive(item: { to: string; exact?: boolean }) {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to)
}

function closeOnNavigate() {
  // Mobile/narrow drawer — a nav click should close the overlay; a no-op
  // (emitting the same false twice) is harmless when already collapsed.
  emit('update:open', false)
}
</script>

<template>
  <div v-if="open" class="sidebar-scrim" @click="emit('update:open', false)" />
  <aside class="app-sidebar" :class="{ 'is-open': open }">
    <nav class="sidebar-nav" aria-label="Dashboard sections">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="sidebar-item"
        :class="{ 'is-active': isActive(item) }"
        @click="closeOnNavigate"
      >
        <span class="sidebar-item-label">{{ item.label }}</span>
        <span
          v-if="item.risk"
          class="sidebar-dot"
          :style="{ background: item.risk.color }"
          :aria-label="`Discovery status: ${item.risk.label}`"
          :title="`Discovery: ${item.risk.label}`"
        />
        <span
          v-else-if="item.badge"
          class="sidebar-dot"
          :style="{ background: item.badge.color }"
          aria-label="Active credential"
          title="Active credential"
        />
        <span v-else-if="item.count" class="sidebar-count mono">{{ item.count }}</span>
      </NuxtLink>
    </nav>
  </aside>
</template>

<style scoped>
/* Frosted left rail. The active item is a raised white chip, never a
 * coloured left border. */
.app-sidebar {
  width: 216px;
  flex-shrink: 0;
  position: sticky;
  top: 88px;
  margin: 16px 0 16px clamp(16px, 2vw, 28px);
  background: var(--color-bg-shell);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  border: var(--border-width) solid var(--glass-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel), inset 0 1px 0 var(--glass-hi);
  padding: 10px 8px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--color-text-secondary);
  text-decoration: none;
  border-radius: 8px;
  transition: color 180ms var(--ease-out), background-color 180ms var(--ease-out), box-shadow 180ms var(--ease-out);
}
.sidebar-item:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.55);
}
.sidebar-item.is-active {
  color: var(--color-text-primary);
  font-weight: 700;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: inset 0 0 0 1px rgba(15, 26, 42, 0.08), 0 4px 12px -8px rgba(15, 26, 42, 0.35);
}
.sidebar-item:focus-visible {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: -2px;
  border-radius: 8px;
}

.sidebar-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.sidebar-count {
  font-size: 11px;
  color: var(--color-text-muted);
}

@media (max-width: 900px) {
  .app-sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    margin: 0;
    width: min(260px, 80vw);
    z-index: 60;
    transform: translateX(-100%);
    transition: transform 180ms ease;
    border-radius: 0 var(--radius-panel) var(--radius-panel) 0;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: var(--shadow-lift);
    overflow-y: auto;
    padding-top: 16px;
  }
  .app-sidebar.is-open {
    transform: translateX(0);
  }
  .sidebar-scrim {
    position: fixed;
    inset: 0;
    z-index: 55;
    background: var(--scrim);
  }
}
@media (min-width: 901px) {
  .sidebar-scrim { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .app-sidebar { transition: none; }
}
</style>
