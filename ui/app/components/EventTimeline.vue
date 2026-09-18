<script setup lang="ts">
import type { TimelineEntry } from '~/types/factory'

const props = defineProps<{ entries: TimelineEntry[] }>()

const rows = computed(() => [...props.entries].reverse().slice(0, 200))

function actionOf(e: TimelineEntry): string {
  switch (e.type) {
    case 'audit_events': return e.action ?? e.tool_name ?? '—'
    case 'authority_decisions': return e.requested_action
    case 'credential_events': return e.revoked_at ? 'credential.revoked' : 'credential.issued'
    case 'database_changes': return `${e.table_name}.${e.action.toLowerCase()}`
    case 'delegations': return 'delegation'
    case 'findings': return e.title
  }
}

function actorOf(e: TimelineEntry): string {
  if (e.type === 'delegations') return `${e.from_actor} → ${e.to_actor}`
  return e.actor_id
}

function targetOf(e: TimelineEntry): string {
  switch (e.type) {
    case 'audit_events': return e.target ?? '—'
    case 'database_changes': return `${e.rows_affected} row(s)`
    case 'credential_events': return e.vault_role
    default: return '—'
  }
}

function resultOf(e: TimelineEntry): { text: string; tone: 'ok' | 'deny' | 'critical' | 'neutral' } {
  if (e.type === 'authority_decisions') {
    return e.policy_result === 'ALLOW' ? { text: 'ALLOW', tone: 'ok' } : { text: 'DENY', tone: 'deny' }
  }
  if (e.type === 'database_changes') return { text: e.action, tone: e.action === 'DELETE' ? 'critical' : 'ok' }
  if (e.type === 'findings') return { text: e.severity.toUpperCase(), tone: e.severity === 'critical' ? 'critical' : 'neutral' }
  if (e.type === 'audit_events' && e.result) return { text: e.result, tone: e.result === 'ALLOW' ? 'ok' : 'deny' }
  return { text: '—', tone: 'neutral' }
}

function keyOf(e: TimelineEntry, i: number): string {
  const id = (e as any).event_id ?? (e as any).decision_id ?? (e as any).credential_event_id
    ?? (e as any).change_id ?? (e as any).delegation_id ?? (e as any).finding_id
  return id ?? `${e.type}-${i}`
}

function timeOf(e: TimelineEntry): string {
  const ts = (e as any).timestamp ?? (e as any).created_at ?? (e as any).issued_at
  return ts ? new Date(ts).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
}
</script>

<template>
  <PanelShell title="Event timeline" collapsible storage-key="timeline" :default-open="false" class="timeline-panel">
    <template #actions>
      <span class="text-xs" style="color: var(--color-text-muted)">{{ entries.length }} events</span>
    </template>
    <div class="timeline-scroll" role="log" aria-live="polite">
      <table class="timeline-table">
        <thead class="visually-hidden">
          <tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Result</th></tr>
        </thead>
        <tbody>
          <tr v-for="(entry, i) in rows" :key="keyOf(entry, i)" :class="{ 'is-newest': i === 0 }">
            <td class="mono col-time">{{ timeOf(entry) }}</td>
            <td class="col-actor">{{ actorOf(entry) }}</td>
            <td class="col-action mono">{{ actionOf(entry) }}</td>
            <td class="col-target mono">{{ targetOf(entry) }}</td>
            <td class="col-result">
              <span class="state-pill" :class="`tone-${resultOf(entry).tone}`">{{ resultOf(entry).text }}</span>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="5" class="empty-row">No events yet — press Run to start a demo run.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </PanelShell>
</template>

<style scoped>
.timeline-panel { display: flex; flex-direction: column; min-height: 0; }
.timeline-scroll {
  overflow-y: auto;
  max-height: 420px;
}
.timeline-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.timeline-table td {
  padding: 7px 14px;
  border-bottom: var(--border-width) solid var(--color-border-subtle);
  color: var(--color-text-secondary);
  white-space: nowrap;
}
.col-time { color: var(--color-text-muted); width: 90px; }
.col-actor { color: var(--color-text-primary); font-weight: 600; width: 140px; }
.col-action { max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
.col-target { color: var(--color-text-muted); max-width: 160px; overflow: hidden; text-overflow: ellipsis; }

tr.is-newest td { border-left: var(--rail-width) solid var(--color-accent-primary); }
tr:not(.is-newest) td:first-child { border-left: var(--rail-width) solid var(--factory-blue-700); }

.tone-ok { color: var(--color-state-healthy); }
.tone-deny { color: var(--color-state-warning); }
.tone-critical { color: var(--color-state-critical); }
.tone-neutral { color: var(--color-state-neutral); }

.empty-row {
  text-align: center;
  color: var(--color-text-muted);
  padding: 24px;
}
</style>
