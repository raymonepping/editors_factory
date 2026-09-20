<script setup lang="ts">
import type { NarrativeStep } from '~/composables/useEventStream'

const props = defineProps<{ steps: NarrativeStep[] }>()

// Prompt 01.02 Phase 3 (input/Codex_Feedback.md): the single most
// important panel in the dashboard — "the heart of the entire demo."
// Renders exactly the steps useEventStream's deriveNarrative() produced
// from real evidence; this component adds no logic of its own about
// what happened, only how it looks.
const TONE_COLOR: Record<NarrativeStep['tone'], string> = {
  neutral: 'var(--color-text-secondary)',
  info: 'var(--color-border-info)',
  warning: 'var(--color-state-warning)',
  critical: 'var(--color-state-critical)',
  contained: 'var(--color-state-contained)',
}
</script>

<template>
  <PanelShell title="The story" class="story-panel" :alarm="steps.some((s) => s.tone === 'critical')">
    <template #badge>
      <span v-if="steps.length" class="state-pill tone-neutral">{{ steps.length }} steps</span>
    </template>
    <ol v-if="steps.length" class="story-list">
      <TransitionGroup name="story-step">
        <li
          v-for="(step, i) in steps"
          :key="step.id"
          class="story-step"
          :style="{ '--step-color': TONE_COLOR[step.tone] }"
        >
          <div class="story-rail">
            <span class="story-index mono">{{ i + 1 }}</span>
            <span v-if="i < steps.length - 1" class="story-line" aria-hidden="true" />
          </div>
          <span class="story-text">{{ step.text }}</span>
        </li>
      </TransitionGroup>
    </ol>
    <div v-else class="story-empty">No run yet — press Run to start telling the story.</div>
  </PanelShell>
</template>

<style scoped>
.story-panel { display: flex; flex-direction: column; }

.story-list {
  list-style: none;
  margin: 0;
  padding: var(--pad-panel);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.story-step {
  display: grid;
  grid-template-columns: 20px 1fr;
  column-gap: 12px;
  align-items: stretch;
  min-height: 28px;
}

.story-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.story-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: var(--border-width) solid var(--step-color);
  color: var(--step-color);
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.story-line {
  width: 2px;
  flex: 1;
  background: var(--color-border-subtle);
  margin: 4px 0;
  min-height: 8px;
}

.story-text {
  padding: 1px 0 12px;
  font-size: 14px;
  line-height: 1.4;
  color: var(--color-text-primary);
}

.story-step-enter-active { transition: opacity 300ms ease, transform 300ms ease; }
.story-step-enter-from { opacity: 0; transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) {
  .story-step-enter-active { transition: none; }
}

.story-empty {
  padding: var(--pad-panel);
  color: var(--color-text-muted);
  font-size: 13px;
}

.tone-neutral { color: var(--color-text-muted); border-color: var(--color-border-subtle); }
</style>
