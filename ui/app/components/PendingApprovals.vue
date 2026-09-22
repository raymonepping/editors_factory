<script setup lang="ts">
// prompts/improvements/01_08_agentic_iam_inspired_hardening.md Phase 4 —
// the supervised, Control-Group-gated credential path: a second
// credential request in one run is withheld until a human clicks
// Authorize here. Polls rather than waiting for a dedicated SSE event
// type (this path is rare by design — an anomaly, not the normal flow
// — so a lightweight poll is proportionate; every other panel on this
// dashboard has a real backend event to react to, this one does not
// yet). The backend, not this component, is the actual authority
// boundary: requireRole('authorize_credential') rejects a viewer's
// attempt with a real 403, surfaced below rather than hidden client-side
// — matching how the rest of this dashboard already lets the backend
// enforce role checks instead of duplicating them here.
import type { PendingApproval } from '~/types/factory'

const { getPendingApprovals, authorizeCredential } = useDemoApi()

const pending = ref<PendingApproval[]>([])
const authorizing = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

async function refresh() {
  try {
    const { pending: rows } = await getPendingApprovals()
    pending.value = rows
  } catch {
    // A viewer session still gets read_dashboard, so a fetch failure
    // here is a real connectivity problem, not an auth gap — stay
    // quiet rather than flash a spurious error on every poll tick.
  }
}

async function authorize(approvalId: string) {
  authorizing.value = approvalId
  errorMessage.value = null
  try {
    await authorizeCredential(approvalId)
    await refresh()
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode
    errorMessage.value =
      statusCode === 403
        ? 'Only a factory-operator may authorize a supervised credential request.'
        : 'Authorization failed — see server logs.'
  } finally {
    authorizing.value = null
  }
}

onMounted(() => {
  refresh()
  timer = setInterval(refresh, 5000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <PanelShell v-if="pending.length" title="Pending credential approval" :alarm="true">
    <template #badge>
      <span class="state-pill tone-critical">{{ pending.length }} awaiting review</span>
    </template>

    <ul class="approval-list">
      <li v-for="p in pending" :key="p.approvalId" class="approval-row">
        <div class="approval-info">
          <div class="approval-role-row">
            <span class="mono approval-role">{{ p.role }}</span>
            <span class="approval-actor">requested by {{ p.actorId }}</span>
          </div>
          <div class="approval-reason">
            Second credential request in this run — withheld pending human review.
          </div>
        </div>
        <button
          type="button"
          class="approval-authorize-btn"
          :disabled="authorizing === p.approvalId"
          @click="authorize(p.approvalId)"
        >
          {{ authorizing === p.approvalId ? 'Authorizing…' : 'Authorize' }}
        </button>
      </li>
    </ul>
    <div v-if="errorMessage" class="approval-error">{{ errorMessage }}</div>
  </PanelShell>
</template>

<style scoped>
.approval-list {
  list-style: none;
  margin: 0;
  padding: var(--pad-dense) var(--pad-panel);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.approval-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px;
  border-radius: var(--radius-control);
  border: var(--border-width) solid var(--color-border-subtle);
  background: var(--color-bg-panel-warning);
}
.approval-role-row { display: flex; align-items: baseline; gap: 8px; }
.approval-role { font-size: 13px; font-weight: 700; color: var(--color-text-primary); }
.approval-actor { font-size: 11px; color: var(--color-text-muted); }
.approval-reason { margin-top: 4px; font-size: 11px; color: var(--color-text-secondary); }

.approval-authorize-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: var(--radius-control);
  border: var(--border-width) solid var(--color-state-critical);
  background: transparent;
  color: var(--color-state-critical);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.approval-authorize-btn:disabled { cursor: not-allowed; opacity: 0.6; }
.approval-authorize-btn:not(:disabled):hover {
  background: var(--color-state-critical);
  color: var(--color-bg-page);
}

.approval-error {
  padding: 0 var(--pad-panel) var(--pad-dense);
  font-size: 11px;
  color: var(--color-state-critical);
}

.tone-critical { color: var(--color-state-critical); border-color: var(--color-state-critical); }
</style>
