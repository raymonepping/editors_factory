<script setup lang="ts">
import type { AgentNodeStatus } from '~/types/factory'

const props = defineProps<{
  nodes: Record<'agent-a' | 'agent-b' | 'agent-c', AgentNodeStatus>
}>()

const stations: { id: 'agent-a' | 'agent-b' | 'agent-c'; label: string; role: string }[] = [
  { id: 'agent-a', label: 'Agent A', role: 'Coordinator' },
  { id: 'agent-b', label: 'Agent B', role: 'Investigator' },
  { id: 'agent-c', label: 'Agent C', role: 'Remediation' },
]

const STATUS_LABEL: Record<AgentNodeStatus, string> = {
  idle: 'Idle',
  reasoning: 'Reasoning',
  acting: 'Acting',
  done: 'Done',
}

function pathActive(fromStatus: AgentNodeStatus) {
  return fromStatus === 'done'
}
</script>

<template>
  <PanelShell title="Agent chain" class="agent-chain-panel">
    <div class="chain-row">
      <template v-for="(station, i) in stations" :key="station.id">
        <div class="station" :class="`is-${nodes[station.id]}`">
          <span class="station-label">{{ station.label }}</span>
          <span class="station-role">{{ station.role }}</span>
          <span class="state-pill station-pill">{{ STATUS_LABEL[nodes[station.id]] }}</span>
        </div>
        <div
          v-if="i < stations.length - 1"
          class="connector"
          :class="{ 'is-active': pathActive(nodes[station.id]) }"
          aria-hidden="true"
        >
          <span class="connector-line" />
          <span v-if="pathActive(nodes[station.id])" class="connector-spark" />
        </div>
      </template>
    </div>
  </PanelShell>
</template>

<style scoped>
.agent-chain-panel { display: flex; flex-direction: column; }
.chain-row {
  display: flex;
  align-items: stretch;
  gap: 4px;
  padding: var(--pad-panel);
  flex-wrap: wrap;
  flex: 1;
}

.station {
  flex: 1 1 160px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--pad-dense) 14px;
  border-radius: var(--radius-control);
  background: var(--color-bg-panel-raised);
  border: var(--border-width) solid var(--color-border-subtle);
  color: var(--color-text-muted);
  transition: border-color 160ms ease, box-shadow 160ms ease, color 160ms ease;
}

.station-label {
  font-size: 14px;
  font-weight: 650;
  color: var(--color-text-primary);
}
.station-role {
  font-size: 11px;
  color: var(--color-text-muted);
}
.station-pill { align-self: flex-start; margin-top: 4px; }

.station.is-idle { border-color: var(--color-border-subtle); }

.station.is-reasoning {
  border-color: var(--color-border-info);
  color: var(--factory-blue-200);
}
.station.is-reasoning .station-pill { color: var(--factory-blue-300); }

.station.is-acting {
  border-color: var(--color-border-active);
  box-shadow: var(--glow-active);
  color: var(--factory-warm-white);
  animation: station-breathe 2.2s ease-in-out infinite;
}
.station.is-acting .station-pill { color: var(--color-accent-primary); }

@keyframes station-breathe {
  0%, 100% { box-shadow: var(--glow-active); }
  50% { box-shadow: 0 0 26px rgb(237 186 71 / 0.42); }
}
@media (prefers-reduced-motion: reduce) {
  .station.is-acting { animation: none; }
}

.station.is-done {
  border-color: var(--color-border-info);
  color: var(--color-text-secondary);
}
.station.is-done .station-pill { color: var(--color-state-contained); }

.connector {
  position: relative;
  flex: 0 0 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.connector-line {
  width: 100%;
  height: 2px;
  background: var(--color-border-subtle);
  border-radius: 2px;
}
.connector.is-active .connector-line {
  background: var(--color-accent-primary);
  box-shadow: var(--glow-active);
}

/* One moving highlight travels the real direction of work — 01_00
 * section 12's own rule ("one moving highlight is enough... duration
 * reflects sequence clearly rather than simulating physical speed"). */
.connector-spark {
  position: absolute;
  left: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--factory-gold-glow);
  box-shadow: 0 0 8px var(--factory-gold-glow);
  animation: connector-travel 1.4s ease-in-out infinite;
}
@keyframes connector-travel {
  0% { left: 0; opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  100% { left: calc(100% - 6px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .connector-spark { display: none; }
}

@media (max-width: 720px) {
  .chain-row { flex-direction: column; }
  .connector { flex: 0 0 20px; }
  .connector-line { width: 2px; height: 100%; }
  .connector-spark { animation: none; display: none; }
}
</style>
