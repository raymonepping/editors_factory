<script setup lang="ts">
// prompts/v2/02_06 — renders 02_00's fixed 5-node topology:
//
//   [Triage] -> [Investigate] -+-> [Remediate (DB)] -+-> [Verify]
//                               +-> [Notify Operator] -+
//
// The shape is fixed and small (5 nodes, known edges) — hand-rolled
// flex/grid layout rather than a graph library, matching this project's
// own lean-dependency philosophy (no message broker for v1, no extra
// deps for a shape that never changes). Reacts to whatever
// useEventStream's dagTopology currently holds — see that composable's
// own comment on why it's a debounced full re-fetch, not a client-side
// SSE-payload merge.
import type { DagNode, DagNodeKey, DagRunTopology } from '~/types/factory'

const props = defineProps<{
  topology: DagRunTopology | null
}>()
const emit = defineEmits<{
  'select-node': [DagNodeKey]
  retry: [DagNodeKey]
}>()

function nodeFor(key: DagNodeKey): DagNode | null {
  return props.topology?.nodes.find((n) => n.node_key === key) ?? null
}

const STATUS_META: Record<string, { label: string; class: string }> = {
  pending: { label: 'Pending', class: 'state-pending' },
  runnable: { label: 'Ready', class: 'state-pending' },
  claimed: { label: 'Claimed', class: 'state-running' },
  running: { label: 'Running', class: 'state-running' },
  completed: { label: 'Completed', class: 'state-completed' },
  failed: { label: 'Failed', class: 'state-failed' },
  blocked: { label: 'Blocked', class: 'state-pending' },
  invalidated: { label: 'Invalidated', class: 'state-invalidated' },
  cancelled: { label: 'Cancelled', class: 'state-invalidated' },
}

const DEFAULT_META = { label: 'Pending', class: 'state-pending' }

function meta(key: DagNodeKey) {
  const status = nodeFor(key)?.status ?? 'pending'
  return STATUS_META[status] ?? DEFAULT_META
}

const NODE_LABELS: Record<DagNodeKey, string> = {
  triage: 'Triage',
  investigate: 'Investigate',
  remediate: 'Remediate (DB)',
  notify: 'Notify Operator',
  verify: 'Verify',
}
</script>

<template>
  <section class="panel" aria-labelledby="dag-visualizer-title">
    <div class="panel-header">
      <h2 id="dag-visualizer-title" class="panel-title">Micro-DAG execution</h2>
      <span v-if="topology?.run" class="run-status mono">{{ topology.run.status }}</span>
    </div>

    <div v-if="!topology?.run" class="dag-empty">
      No v2 run initialized yet — switch to Recoverable Micro-DAG and start a run.
    </div>

    <div v-else class="dag-graph">
      <div class="dag-col">
        <button
          type="button"
          class="dag-node"
          :class="meta('triage').class"
          @click="emit('select-node', 'triage')"
        >
          <span class="dag-node-label">{{ NODE_LABELS.triage }}</span>
          <span class="dag-node-status">{{ meta('triage').label }}</span>
          <span v-if="(nodeFor('triage')?.current_attempt_number ?? 0) > 1" class="dag-attempt-badge">
            attempt {{ nodeFor('triage')?.current_attempt_number }}
          </span>
          <button
            v-if="nodeFor('triage')?.status === 'failed'"
            type="button"
            class="dag-retry-btn"
            @click.stop="emit('retry', 'triage')"
          >
            Retry
          </button>
        </button>
      </div>

      <div class="dag-arrow" aria-hidden="true">→</div>

      <div class="dag-col">
        <button
          type="button"
          class="dag-node"
          :class="meta('investigate').class"
          @click="emit('select-node', 'investigate')"
        >
          <span class="dag-node-label">{{ NODE_LABELS.investigate }}</span>
          <span class="dag-node-status">{{ meta('investigate').label }}</span>
          <span v-if="(nodeFor('investigate')?.current_attempt_number ?? 0) > 1" class="dag-attempt-badge">
            attempt {{ nodeFor('investigate')?.current_attempt_number }}
          </span>
          <button
            v-if="nodeFor('investigate')?.status === 'failed'"
            type="button"
            class="dag-retry-btn"
            @click.stop="emit('retry', 'investigate')"
          >
            Retry
          </button>
        </button>
      </div>

      <div class="dag-branch-arrows" aria-hidden="true">
        <span class="branch-line branch-line--up" />
        <span class="branch-line branch-line--down" />
      </div>

      <div class="dag-col dag-col--branches">
        <button
          type="button"
          class="dag-node"
          :class="meta('remediate').class"
          @click="emit('select-node', 'remediate')"
        >
          <span class="dag-node-label">{{ NODE_LABELS.remediate }}</span>
          <span class="dag-node-status">{{ meta('remediate').label }}</span>
          <span v-if="(nodeFor('remediate')?.current_attempt_number ?? 0) > 1" class="dag-attempt-badge">
            attempt {{ nodeFor('remediate')?.current_attempt_number }}
          </span>
          <button
            v-if="nodeFor('remediate')?.status === 'failed'"
            type="button"
            class="dag-retry-btn"
            @click.stop="emit('retry', 'remediate')"
          >
            Retry
          </button>
        </button>
        <button
          type="button"
          class="dag-node dag-node--backend"
          :class="meta('notify').class"
          @click="emit('select-node', 'notify')"
        >
          <span class="dag-node-label">{{ NODE_LABELS.notify }}</span>
          <span class="dag-node-status">{{ meta('notify').label }}</span>
          <button
            v-if="nodeFor('notify')?.status === 'failed'"
            type="button"
            class="dag-retry-btn"
            @click.stop="emit('retry', 'notify')"
          >
            Retry
          </button>
        </button>
      </div>

      <div class="dag-branch-arrows" aria-hidden="true">
        <span class="branch-line branch-line--up" />
        <span class="branch-line branch-line--down" />
      </div>

      <div class="dag-col">
        <button
          type="button"
          class="dag-node dag-node--backend"
          :class="meta('verify').class"
          @click="emit('select-node', 'verify')"
        >
          <span class="dag-node-label">{{ NODE_LABELS.verify }}</span>
          <span class="dag-node-status">{{ meta('verify').label }}</span>
          <button
            v-if="nodeFor('verify')?.status === 'failed'"
            type="button"
            class="dag-retry-btn"
            @click.stop="emit('retry', 'verify')"
          >
            Retry
          </button>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.run-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-bg-panel-info);
  border: var(--border-width) solid var(--color-border-subtle);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.dag-empty {
  padding: 24px 20px;
  font-size: 13px;
  color: var(--color-text-muted);
}

.dag-graph {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px;
  overflow-x: auto;
}

.dag-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}
.dag-col--branches {
  justify-content: space-between;
}

.dag-arrow {
  color: var(--color-text-muted);
  font-size: 18px;
  flex-shrink: 0;
}

.dag-branch-arrows {
  position: relative;
  width: 24px;
  align-self: stretch;
  flex-shrink: 0;
}
.branch-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1.5px solid var(--color-border-subtle);
}
.branch-line--up { top: 25%; }
.branch-line--down { top: 75%; }

.dag-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 150px;
  padding: 10px 14px;
  border-radius: var(--radius-control);
  background: var(--color-bg-panel-info);
  color: var(--color-text-secondary);
  cursor: pointer;
  text-align: left;
  border: 2px solid var(--color-border-subtle);
}
.dag-node--backend {
  opacity: 0.9;
}
.dag-node-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.dag-node-status {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.dag-attempt-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-bg-panel-warning);
  border: var(--border-width) solid var(--factory-rust-700);
  color: var(--color-text-secondary);
}
.dag-retry-btn {
  margin-top: 4px;
  align-self: flex-start;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: var(--radius-control);
  border: var(--border-width) solid var(--color-state-critical);
  background: transparent;
  color: var(--color-state-critical);
  cursor: pointer;
}
.dag-retry-btn:hover {
  background: var(--color-bg-panel-warning);
}

/* Pending: dashed grey border */
.state-pending {
  border-style: dashed;
  border-color: var(--color-border-subtle);
}

/* Running: pulsing blue border */
.state-running {
  border-color: var(--factory-blue-400);
  animation: dag-pulse 1.6s ease-in-out infinite;
}
@keyframes dag-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.45); }
  50% { box-shadow: 0 0 0 4px rgba(96, 165, 250, 0); }
}

/* Completed: solid green border */
.state-completed {
  border-style: solid;
  border-color: var(--color-state-healthy);
}
.state-completed .dag-node-label::after {
  content: ' \2713';
  color: var(--color-state-healthy);
}

/* Failed: solid red border */
.state-failed {
  border-style: solid;
  border-color: var(--color-state-critical);
}

/* Invalidated: striped amber border */
.state-invalidated {
  border-style: solid;
  border-color: var(--color-state-warning);
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 6px,
    rgba(237, 186, 71, 0.12) 6px,
    rgba(237, 186, 71, 0.12) 12px
  );
}

@media (prefers-reduced-motion: reduce) {
  .state-running { animation: none; }
}
</style>
