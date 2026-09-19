<script setup lang="ts">
import type { CredentialEvent } from '~/types/factory'

const props = defineProps<{ ledger: CredentialEvent[] }>()

// A real ticking clock, not a fake progress bar — it only ever reads real
// issued_at/ttl_seconds/revoked_at values from the backend; the tick just
// re-renders the same arithmetic against the current time
// (prompts/frontend/01_00's own "do not use timers to fake backend
// progress" is about faking STATE, not about a live countdown of a real
// expiry that's already known).
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

const active = computed(() => props.ledger.filter((c) => !c.revoked_at).at(-1) ?? null)
const history = computed(() => [...props.ledger].reverse())

function secondsLeft(c: CredentialEvent): number | null {
  if (!c.ttl_seconds) return null
  const expiresAt = new Date(c.issued_at).getTime() + c.ttl_seconds * 1000
  return Math.max(0, Math.round((expiresAt - now.value) / 1000))
}

function formatTtl(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${seconds}s`
}

function roleTone(role: string): 'critical' | 'ok' {
  return role === 'factory-bad-role' ? 'critical' : 'ok'
}

// Prompt 01.02 Phase 4 (input/Codex_Feedback.md): renewal and revocation
// reason were already real, audited data (Wave 2.5 / Phase 2) but never
// rendered anywhere — visible only via podman logs or a direct SQL
// query. This is a rendering gap, not a new backend capability.
// Exact reason strings from backend/src/services/revocation.js's real
// call sites (routes/actions.js, tasks.js, demo.js, index.js) — kept in
// sync with those, not guessed.
const REVOKED_LABEL: Record<string, string> = {
  task_completed: 'Revoked — task complete',
  policy_denial_containment: 'Revoked — denied',
  profile_switch: 'Revoked — profile switch',
  reset: 'Revoked — reset',
  startup_recovery: 'Revoked — startup recovery',
}

function revokedLabel(c: CredentialEvent): string {
  if (!c.revoked_at) return 'Active'
  return (c.revoked_reason && REVOKED_LABEL[c.revoked_reason]) || 'Revoked'
}
</script>

<template>
  <PanelShell title="Credential ledger" collapsible storage-key="credentials" :alarm="!!active && roleTone(active.vault_role) === 'critical'">
    <template #badge>
      <span v-if="active" class="state-pill" :class="`tone-${roleTone(active.vault_role)}`">
        {{ active.vault_role === 'factory-bad-role' ? 'Over-privileged' : 'Bounded' }}
      </span>
    </template>

    <div v-if="active" class="ledger-active" :class="`tone-${roleTone(active.vault_role)}`">
      <div class="ledger-active-row">
        <span class="ledger-role mono">{{ active.vault_role }}</span>
        <span class="ledger-actor">leased by {{ active.actor_id }}</span>
      </div>
      <div class="ledger-ttl-row">
        <span class="ledger-ttl-label">Expires in</span>
        <span class="ledger-ttl mono">
          {{ active.ttl_seconds != null ? formatTtl(secondsLeft(active) ?? 0) : '—' }}
        </span>
      </div>
      <div class="ttl-bar" aria-hidden="true">
        <div
          class="ttl-bar-fill"
          :style="{ width: `${active.ttl_seconds ? Math.min(100, ((secondsLeft(active) ?? 0) / active.ttl_seconds) * 100) : 0}%` }"
        />
      </div>
      <div v-if="active.renewal_count > 0" class="ledger-renewal">
        Renewed {{ active.renewal_count }}×<template v-if="active.last_renewed_at">, last {{ formatTtl(Math.max(0, Math.round((now - new Date(active.last_renewed_at).getTime()) / 1000))) }} ago</template>
      </div>
    </div>
    <div v-else class="ledger-empty">No active credential — Agent C has not requested one this run.</div>

    <ul class="ledger-history">
      <li v-for="c in history" :key="c.credential_event_id" class="ledger-row">
        <span class="mono ledger-row-role">{{ c.vault_role }}</span>
        <span v-if="c.renewal_count > 0" class="ledger-row-renewals mono">×{{ c.renewal_count }}</span>
        <span class="ledger-row-actor">{{ c.actor_id }}</span>
        <span class="state-pill" :class="c.revoked_at ? 'tone-neutral' : `tone-${roleTone(c.vault_role)}`">
          {{ revokedLabel(c) }}
        </span>
      </li>
      <li v-if="!history.length" class="ledger-empty">No credentials issued yet.</li>
    </ul>
  </PanelShell>
</template>

<style scoped>
.ledger-active {
  padding: var(--pad-panel);
  border-bottom: var(--border-width) solid var(--color-border-subtle);
}
.ledger-active-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.ledger-role { font-size: 15px; font-weight: 700; color: var(--color-text-primary); }
.ledger-actor { font-size: 11px; color: var(--color-text-muted); }

.ledger-ttl-row { display: flex; align-items: baseline; justify-content: space-between; margin-top: 10px; }
.ledger-ttl-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); }
.ledger-ttl { font-size: 20px; font-weight: 700; color: var(--color-text-primary); }

.ttl-bar {
  margin-top: 8px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-border-subtle);
  overflow: hidden;
}
.ttl-bar-fill {
  height: 100%;
  background: var(--color-accent-primary);
  transition: width 1s linear;
}
.ledger-active.tone-critical .ttl-bar-fill { background: var(--color-state-critical); }

.ledger-renewal {
  margin-top: 6px;
  font-size: 10px;
  color: var(--color-accent-info);
}

.ledger-history {
  list-style: none;
  margin: 0;
  padding: var(--pad-dense) var(--pad-panel);
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
}
.ledger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}
.ledger-row-role { color: var(--color-text-secondary); }
.ledger-row-renewals { color: var(--color-accent-info); font-size: 10px; }
.ledger-row-actor { color: var(--color-text-muted); flex: 1; text-align: right; margin-right: 8px; }

.ledger-empty { color: var(--color-text-muted); font-size: 12px; padding: var(--pad-dense) var(--pad-panel); }

.tone-critical { color: var(--color-state-critical); border-color: var(--color-state-critical); }
.tone-ok { color: var(--color-state-healthy); border-color: var(--color-state-healthy); }
.tone-neutral { color: var(--color-state-neutral); border-color: var(--color-state-neutral); }
</style>
