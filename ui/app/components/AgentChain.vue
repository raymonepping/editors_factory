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
  delegated: 'Delegated',
  done: 'Done',
}

function pathActive(fromStatus: AgentNodeStatus) {
  return fromStatus === 'delegated' || fromStatus === 'done'
}
</script>

<template>
  <section class="panel" aria-labelledby="agent-chain-title">
    <div class="panel-header">
      <h2 id="agent-chain-title" class="panel-title">Agent chain</h2>
    </div>
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
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.chain-row {
  display: flex;
  align-items: stretch;
  gap: 4px;
  padding: var(--pad-panel);
  flex-wrap: wrap;
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
}
.station.is-acting .station-pill { color: var(--color-accent-primary); }

.station.is-delegated {
  border-color: var(--color-border-active);
  color: var(--factory-warm-white);
}
.station.is-delegated .station-pill { color: var(--color-accent-primary); }

.station.is-done {
  border-color: var(--color-border-info);
  color: var(--color-text-secondary);
}
.station.is-done .station-pill { color: var(--color-state-contained); }

.connector {
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

@media (max-width: 720px) {
  .chain-row { flex-direction: column; }
  .connector { flex: 0 0 20px; }
  .connector-line { width: 2px; height: 100%; }
}
</style>
