<script setup lang="ts">
import type { Finding } from '~/types/factory'

const props = defineProps<{
  riskState: 'NORMAL' | 'ELEVATED' | 'CRITICAL' | 'CONTAINED'
  findings: Finding[]
}>()

const RISK_STYLE: Record<typeof props.riskState, { color: string; label: string }> = {
  NORMAL: { color: 'var(--color-state-healthy)', label: 'Normal' },
  ELEVATED: { color: 'var(--color-state-warning)', label: 'Elevated' },
  CRITICAL: { color: 'var(--color-state-critical)', label: 'Critical' },
  CONTAINED: { color: 'var(--color-state-contained)', label: 'Contained' },
}

const recent = computed(() => [...props.findings].reverse().slice(0, 12))
const lastScan = computed(() => {
  const last = props.findings.at(-1)
  return last ? new Date(last.created_at).toLocaleTimeString(undefined, { hour12: false }) : '—'
})
</script>

<template>
  <PanelShell
    title="Agent D — Inspection &amp; Containment"
    collapsible
    storage-key="agent-d"
    :default-open="false"
    :alarm="riskState === 'CRITICAL'"
    class="agent-d-panel"
  >
    <template #badge>
      <span class="state-pill" :style="{ color: RISK_STYLE[riskState].color, borderColor: RISK_STYLE[riskState].color }">
        {{ RISK_STYLE[riskState].label }}
      </span>
    </template>
    <div class="agent-d-summary">
      <div>
        <span class="summary-label">Last scan</span>
        <span class="mono">{{ lastScan }}</span>
      </div>
      <div>
        <span class="summary-label">Open findings</span>
        <span class="mono">{{ findings.length }}</span>
      </div>
    </div>
    <ul class="findings-feed">
      <li v-for="f in recent" :key="f.finding_id" class="finding-row" :class="`severity-${f.severity}`">
        <span class="finding-title">{{ f.title }}</span>
        <span v-if="f.detail" class="finding-detail">{{ f.detail }}</span>
      </li>
      <li v-if="!recent.length" class="finding-empty">No findings yet.</li>
    </ul>
  </PanelShell>
</template>

<style scoped>
.agent-d-panel {
  background: var(--color-bg-panel-info);
  border-color: var(--color-border-info);
}
.agent-d-summary {
  display: flex;
  gap: 24px;
  padding: var(--pad-dense) var(--pad-panel);
  border-bottom: var(--border-width) solid var(--color-border-subtle);
}
.agent-d-summary > div { display: flex; flex-direction: column; gap: 2px; }
.summary-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.findings-feed {
  list-style: none;
  margin: 0;
  padding: var(--pad-dense) var(--pad-panel);
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}
.finding-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  border-left: var(--rail-width) solid var(--color-state-neutral);
  font-size: 12px;
}
.finding-title { color: var(--color-text-primary); font-weight: 600; }
.finding-detail { color: var(--color-text-muted); }

.finding-row.severity-critical { border-left-color: var(--color-state-critical); }
.finding-row.severity-high { border-left-color: var(--color-state-warning); }
.finding-row.severity-medium { border-left-color: var(--color-accent-info); }
.finding-row.severity-low { border-left-color: var(--color-state-contained); }

.finding-empty { color: var(--color-text-muted); font-size: 12px; }
</style>
