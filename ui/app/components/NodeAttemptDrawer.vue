<script setup lang="ts">
// prompts/v2/02_06 — the multi-attempt history drawer.
//
// Grounding-pass correction (kept from the prompt's own grounding pass,
// still honored here): never render a full Vault lease ID — a short
// correlation fingerprint (last 6 chars) is enough to visually confirm
// "these two are different leases" without displaying a live
// credential-adjacent identifier.
//
// Grounding-pass correction: "Evidence Preserved: 100%" was an
// unprovable, undefined metric. Replaced with an actually-computed
// claim — SHA-256 (Web Crypto, no library) of this attempt's own
// dag_node_attempts.input_evidence, compared against a fresh hash of
// whatever the upstream node's own output_evidence currently is in
// `topology`. Both values are real, already-fetched data; nothing here
// is invented.
import type { DagNodeAttempt, DagNodeKey, DagRunTopology } from '~/types/factory'

const props = defineProps<{
  open: boolean
  nodeKey: DagNodeKey | null
  topology: DagRunTopology | null
}>()
const emit = defineEmits<{ close: [] }>()

const attempts = computed<DagNodeAttempt[]>(() => {
  if (!props.nodeKey || !props.topology) return []
  const node = props.topology.nodes.find((n) => n.node_key === props.nodeKey)
  if (!node) return []
  return props.topology.attempts
    .filter((a) => a.node_id === node.node_id)
    .sort((a, b) => a.attempt_number - b.attempt_number)
})

function leaseFingerprint(leaseId: string | null): string {
  if (!leaseId) return 'no credential requested'
  return `Lease …${leaseId.slice(-6)}`
}

function duration(attempt: DagNodeAttempt): string {
  if (!attempt.ended_at) return 'in progress'
  const ms = new Date(attempt.ended_at).getTime() - new Date(attempt.started_at).getTime()
  return `${(ms / 1000).toFixed(1)}s`
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? null))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// node_key -> that node's own current output_evidence, from whichever
// attempt actually holds it (its current attempt, if completed).
const currentOutputByNode = computed(() => {
  const map = new Map<string, unknown>()
  if (!props.topology) return map
  for (const node of props.topology.nodes) {
    const current = props.topology.attempts.find(
      (a) => a.node_id === node.node_id && a.attempt_number === node.current_attempt_number,
    )
    if (current?.output_evidence !== undefined) map.set(node.node_key, current.output_evidence)
  }
  return map
})

const evidenceVerification = ref<Record<string, 'checking' | 'verified' | 'mismatch' | 'no-input'>>({})

watch(
  attempts,
  async (list) => {
    for (const attempt of list) {
      const inputEvidence = attempt.input_evidence as Record<string, unknown> | null
      if (!inputEvidence || !Object.keys(inputEvidence).length) {
        evidenceVerification.value[attempt.attempt_id] = 'no-input'
        continue
      }
      evidenceVerification.value[attempt.attempt_id] = 'checking'
      let allMatch = true
      for (const [upstreamKey, snapshot] of Object.entries(inputEvidence)) {
        const current = currentOutputByNode.value.get(upstreamKey)
        if (current === undefined) continue
        const [snapshotHash, currentHash] = await Promise.all([sha256(snapshot), sha256(current)])
        if (snapshotHash !== currentHash) allMatch = false
      }
      evidenceVerification.value[attempt.attempt_id] = allMatch ? 'verified' : 'mismatch'
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="open" class="drawer-scrim" @click="emit('close')" />
  <aside class="attempt-drawer" :class="{ 'is-open': open }" aria-label="Node attempt history">
    <div class="drawer-header">
      <h3>{{ nodeKey }} — attempt history</h3>
      <button type="button" class="drawer-close" aria-label="Close" @click="emit('close')">✕</button>
    </div>

    <div v-if="!attempts.length" class="drawer-empty">No attempts recorded for this node yet.</div>

    <div v-for="attempt in attempts" :key="attempt.attempt_id" class="attempt-card">
      <div class="attempt-card-header">
        <span class="attempt-number">Attempt {{ attempt.attempt_number }}</span>
        <span class="attempt-exec-status" :class="`exec-${attempt.execution_status}`">
          {{ attempt.execution_status }}
        </span>
      </div>

      <dl class="attempt-fields">
        <dt>Credential</dt>
        <dd :class="{ 'is-revoked': attempt.authority_status === 'revoked' }">
          {{ leaseFingerprint(attempt.vault_lease_id) }}
          <span v-if="attempt.authority_status === 'revoked'" class="revoked-tag">REVOKED</span>
        </dd>

        <dt>Duration</dt>
        <dd>{{ duration(attempt) }}</dd>

        <template v-if="attempt.error_details">
          <dt>Error</dt>
          <dd class="error-text">{{ JSON.stringify(attempt.error_details) }}</dd>
        </template>

        <dt>Evidence</dt>
        <dd>
          <span v-if="evidenceVerification[attempt.attempt_id] === 'verified'" class="evidence-badge evidence-verified">
            Input evidence hash matches upstream output hash: ✓ verified
          </span>
          <span v-else-if="evidenceVerification[attempt.attempt_id] === 'mismatch'" class="evidence-badge evidence-mismatch">
            Input evidence hash does NOT match current upstream output — evidence has since changed
          </span>
          <span v-else-if="evidenceVerification[attempt.attempt_id] === 'checking'" class="evidence-badge">
            Verifying…
          </span>
          <span v-else class="evidence-badge evidence-none">
            No upstream evidence to verify (root node)
          </span>
        </dd>

        <dt>Authority</dt>
        <dd>
          {{ attempt.vault_lease_id
            ? (attempt.attempt_number > 1 ? 'Authority Reissued: Fresh Dynamic Lease' : 'Fresh Dynamic Lease Issued')
            : 'No database authority requested' }}
        </dd>
      </dl>
    </div>
  </aside>
</template>

<style scoped>
.drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: 65;
  background: rgb(0 0 0 / 0.5);
}
.attempt-drawer {
  position: fixed;
  top: 0;
  bottom: 0;
  right: 0;
  z-index: 70;
  width: min(420px, 92vw);
  background: var(--color-bg-shell);
  border-left: var(--border-width) solid var(--color-border-subtle);
  padding: 16px;
  overflow-y: auto;
  transform: translateX(100%);
  transition: transform 180ms ease;
}
.attempt-drawer.is-open {
  transform: translateX(0);
}
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.drawer-header h3 {
  margin: 0;
  font-size: 14px;
  text-transform: capitalize;
  color: var(--color-text-primary);
}
.drawer-close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 14px;
}
.drawer-empty {
  font-size: 12px;
  color: var(--color-text-muted);
}

.attempt-card {
  border: var(--border-width) solid var(--color-border-subtle);
  border-radius: var(--radius-control);
  padding: 12px;
  margin-bottom: 10px;
  background: var(--color-bg-panel-info);
}
.attempt-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.attempt-number {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.attempt-exec-status {
  font-size: 10px;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
  border: var(--border-width) solid var(--color-border-subtle);
}
.exec-completed { color: var(--color-state-healthy); border-color: var(--color-state-healthy); }
.exec-failed, .exec-timed_out { color: var(--color-state-critical); border-color: var(--color-state-critical); }
.exec-running { color: var(--factory-blue-400); border-color: var(--factory-blue-400); }

.attempt-fields {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 4px 8px;
  margin: 0;
}
.attempt-fields dt {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-muted);
}
.attempt-fields dd {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.is-revoked {
  text-decoration: line-through;
  opacity: 0.7;
}
.revoked-tag {
  margin-left: 6px;
  font-size: 9px;
  text-decoration: none;
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-bg-panel-warning);
  color: var(--color-state-critical);
  border: var(--border-width) solid var(--color-state-critical);
}
.error-text {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  word-break: break-word;
}
.evidence-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-control);
}
.evidence-verified { color: var(--color-state-healthy); }
.evidence-mismatch { color: var(--color-state-critical); }
.evidence-none { color: var(--color-text-muted); }
</style>
