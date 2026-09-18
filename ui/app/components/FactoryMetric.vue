<script setup lang="ts">
const props = defineProps<{
  label: string
  value: string | number
  warn?: boolean
  compact?: boolean
}>()

const flashing = ref(false)
watch(
  () => props.value,
  (next, prev) => {
    if (prev === undefined || next === prev) return
    flashing.value = true
    setTimeout(() => { flashing.value = false }, 700)
  },
)
</script>

<template>
  <div class="metric" :class="{ 'is-warn': warn, 'is-flash': flashing, 'is-compact': compact }">
    <span class="metric-label">{{ label }}</span>
    <span class="metric-value mono">{{ value }}</span>
  </div>
</template>

<style scoped>
.metric {
  background: var(--color-bg-panel);
  padding: var(--pad-dense) 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.metric-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
  transition: color 160ms ease;
}
.metric.is-warn .metric-value { color: var(--color-state-warning); }
.metric.is-flash .metric-value { color: var(--color-accent-primary); }

.metric.is-compact {
  padding: 10px 12px;
  justify-content: center;
  gap: 3px;
}
.metric.is-compact .metric-label { font-size: 9.5px; }
.metric.is-compact .metric-value { font-size: clamp(20px, 1.15vw, 27px); }
</style>
