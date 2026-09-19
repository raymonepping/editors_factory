<script setup lang="ts">
import { DESTRUCTIVE_ACTIONS } from '~/types/factory'
import type { ActorId, AuthorityMap } from '~/types/factory'

const props = defineProps<{
  authority: AuthorityMap | null
  amplified: boolean
}>()

// prompts/improvements/01_05_add_identity.md: friendly display names —
// the underlying actor_id (agent-a/b/c/d) is what appears in evidence and
// Sentinel checks, unchanged.
const actors: { id: ActorId; label: string }[] = [
  { id: 'agent-a', label: 'Assistant' },
  { id: 'agent-b', label: 'Investigator' },
  { id: 'agent-c', label: 'Corrector' },
  { id: 'agent-d', label: 'Discovery' },
]

function entriesFor(id: ActorId) {
  return props.authority?.authority?.[id] ?? []
}
</script>

<template>
  <PanelShell title="Effective authority" collapsible storage-key="authority" :alarm="amplified">
    <template #badge>
      <span
        v-if="amplified"
        class="state-pill"
        style="color: var(--color-state-critical); border-color: var(--color-state-critical)"
      >
        Amplified
      </span>
    </template>
    <template #actions>
      <span v-if="authority" class="text-xs" style="color: var(--color-text-muted)">
        {{ authority.profile.toUpperCase() }}
      </span>
    </template>
    <div class="authority-grid">
      <div v-for="actor in actors" :key="actor.id" class="authority-col">
        <span class="authority-actor">{{ actor.label }}</span>
        <ul class="authority-list">
          <li v-if="!entriesFor(actor.id).length" class="authority-empty">—</li>
          <li
            v-for="entry in entriesFor(actor.id)"
            :key="entry"
            class="authority-entry"
            :class="{
              'is-destructive': DESTRUCTIVE_ACTIONS.has(entry),
              'is-amplified': DESTRUCTIVE_ACTIONS.has(entry) && actor.id === 'agent-c' && amplified,
            }"
          >
            {{ entry }}
          </li>
        </ul>
      </div>
    </div>
  </PanelShell>
</template>

<style scoped>
.authority-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1px;
  background: var(--color-border-subtle);
}
.authority-col {
  background: var(--color-bg-panel);
  padding: var(--pad-dense) 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.authority-actor {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}
.authority-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.authority-entry {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
}
.authority-empty { color: var(--color-text-muted); opacity: 0.6; }

.authority-entry.is-destructive {
  color: var(--color-state-critical);
  font-weight: 600;
}
.authority-entry.is-amplified {
  text-shadow: var(--glow-critical);
}
</style>
