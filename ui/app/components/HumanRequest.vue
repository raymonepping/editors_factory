<script setup lang="ts">
import type { Profile } from '~/types/factory'

const props = defineProps<{
  prompt: string
  profile: Profile | null
  running: boolean
  switching: boolean
}>()
const emit = defineEmits<{ run: []; reset: []; 'update:profile': [Profile] }>()

const resetArmed = ref(false)
let armTimer: ReturnType<typeof setTimeout> | null = null

function requestReset() {
  if (!resetArmed.value) {
    resetArmed.value = true
    if (armTimer) clearTimeout(armTimer)
    armTimer = setTimeout(() => { resetArmed.value = false }, 4000)
    return
  }
  resetArmed.value = false
  if (armTimer) clearTimeout(armTimer)
  emit('reset')
}
</script>

<template>
  <section class="panel" aria-labelledby="human-request-title">
    <div class="panel-header">
      <h2 id="human-request-title" class="panel-title">Human request</h2>
      <ProfileSwitch
        :model-value="profile"
        :disabled="switching"
        @update:model-value="(p) => emit('update:profile', p)"
      />
    </div>
    <div class="flex flex-col gap-4 p-5">
      <p class="console-prompt mono">{{ prompt }}</p>
      <div class="flex items-center gap-3">
        <button type="button" class="btn btn-primary" :disabled="running" @click="emit('run')">
          <span v-if="running">Running…</span>
          <span v-else>Run</span>
        </button>
        <button
          type="button"
          class="btn btn-destructive"
          :class="{ 'is-armed': resetArmed }"
          @click="requestReset"
        >
          {{ resetArmed ? 'Confirm reset?' : 'Reset' }}
        </button>
        <span v-if="resetArmed" class="text-xs" style="color: var(--color-text-muted)">
          Click again to confirm — clears this run's evidence and catalog.
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.console-prompt {
  padding: 12px 14px;
  border-radius: var(--radius-control);
  background: var(--color-bg-shell);
  border: var(--border-width) solid var(--color-border-subtle);
  color: var(--color-text-primary);
  font-size: 14px;
  line-height: 1.5;
}
</style>
