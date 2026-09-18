<script setup lang="ts">
import type { Profile } from '~/types/factory'

const props = defineProps<{
  modelValue: Profile | null
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Profile] }>()

function select(profile: Profile) {
  if (props.disabled || props.modelValue === profile) return
  emit('update:modelValue', profile)
}
</script>

<template>
  <div class="flex gap-2" role="radiogroup" aria-label="Demo profile">
    <button
      type="button"
      role="radio"
      :aria-checked="modelValue === 'good'"
      class="profile-segment"
      :class="{ 'is-selected': modelValue === 'good' }"
      :disabled="disabled"
      @click="select('good')"
    >
      <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M10 2 3 5v5c0 4 3 6.5 7 8 4-1.5 7-4 7-8V5l-7-3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      </svg>
      <span>GOOD</span>
      <span class="profile-caption">bounded credential</span>
    </button>
    <button
      type="button"
      role="radio"
      :aria-checked="modelValue === 'bad'"
      class="profile-segment profile-segment--bad"
      :class="{ 'is-selected': modelValue === 'bad' }"
      :disabled="disabled"
      @click="select('bad')"
    >
      <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M10 2 3 5v5c0 4 3 6.5 7 8 4-1.5 7-4 7-8V5l-7-3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M7 12.5 13 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <span>BAD</span>
      <span class="profile-caption">over-privileged credential</span>
    </button>
  </div>
</template>

<style scoped>
.profile-segment {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 132px;
  padding: 8px 16px;
  border-radius: var(--radius-control);
  border: var(--border-width) solid var(--color-border-info);
  background: var(--color-bg-panel-info);
  color: var(--color-text-secondary);
  cursor: pointer;
}
.profile-segment:disabled { cursor: not-allowed; opacity: 0.6; }
.profile-segment svg { color: var(--factory-blue-400); }
.profile-segment.is-selected {
  border-color: var(--color-border-active);
  box-shadow: 0 0 0 1px var(--color-border-active), var(--glow-active);
  color: var(--color-text-primary);
}
.profile-segment.is-selected svg { color: var(--color-accent-primary); }

.profile-segment--bad {
  border-color: var(--factory-rust-700);
  background: var(--color-bg-panel-warning);
}
.profile-segment--bad svg { color: var(--color-state-critical); }
.profile-segment--bad.is-selected {
  border-color: var(--color-border-active);
  box-shadow: 0 0 0 1px var(--color-border-active), var(--glow-active);
}

.profile-caption {
  font-size: 10px;
  letter-spacing: 0.03em;
  color: var(--color-text-muted);
}
</style>
