<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string
    collapsible?: boolean
    defaultOpen?: boolean
    storageKey?: string
    /** Adds a pulsing critical-red edge — reserved for a real alarm state
     * (authority amplification), never decorative. */
    alarm?: boolean
  }>(),
  { collapsible: false, defaultOpen: true, alarm: false },
)

const open = ref(props.defaultOpen)

if (props.collapsible && props.storageKey && import.meta.client) {
  try {
    const stored = localStorage.getItem(`factory-panel:${props.storageKey}`)
    if (stored !== null) open.value = stored === '1'
  } catch {
    // Private browsing / storage disabled — fall back to defaultOpen silently.
  }
}

function toggle() {
  if (!props.collapsible) return
  open.value = !open.value
  if (props.storageKey && import.meta.client) {
    try {
      localStorage.setItem(`factory-panel:${props.storageKey}`, open.value ? '1' : '0')
    } catch {
      // Same rationale as above.
    }
  }
}

const bodyId = useId()
</script>

<template>
  <section class="panel" :class="{ 'is-collapsed': collapsible && !open, 'is-alarm': alarm }">
    <div class="panel-header" :class="{ 'is-toggle': collapsible }" @click="toggle">
      <div class="panel-header-title">
        <h2 class="panel-title">{{ title }}</h2>
        <slot name="badge" />
      </div>
      <div class="panel-header-actions">
        <slot name="actions" />
        <button
          v-if="collapsible"
          type="button"
          class="panel-toggle"
          :aria-expanded="open"
          :aria-controls="bodyId"
          :aria-label="open ? `Collapse ${title}` : `Expand ${title}`"
          @click.stop="toggle"
        >
          <svg viewBox="0 0 12 12" class="panel-toggle-icon" aria-hidden="true">
            <path d="M3 4.5 6 8l3-3.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
    <div v-show="!collapsible || open" :id="bodyId">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panel-header.is-toggle { cursor: pointer; user-select: none; }
.panel-header-title { display: flex; align-items: center; gap: 10px; }
.panel-header-actions { display: flex; align-items: center; gap: 10px; }

.panel-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-control);
  border: var(--border-width) solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: transform 160ms ease, color 120ms ease, border-color 120ms ease;
}
.panel-toggle:hover { color: var(--color-accent-primary); border-color: var(--color-border-active); }
.panel.is-collapsed .panel-toggle-icon { transform: rotate(-90deg); }
.panel-toggle-icon { transition: transform 160ms ease; }

.panel.is-alarm {
  border-color: var(--color-state-critical);
  animation: alarm-pulse 1.8s ease-in-out infinite;
}
@keyframes alarm-pulse {
  0%, 100% { box-shadow: var(--shadow-panel), var(--shadow-inset-steel), 0 0 0 rgb(196 71 61 / 0); }
  50% { box-shadow: var(--shadow-panel), var(--shadow-inset-steel), 0 0 22px rgb(196 71 61 / 0.45); }
}
@media (prefers-reduced-motion: reduce) {
  .panel.is-alarm {
    animation: none;
    box-shadow: var(--shadow-panel), var(--shadow-inset-steel), var(--glow-critical);
  }
}
</style>
