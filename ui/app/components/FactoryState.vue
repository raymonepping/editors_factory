<script setup lang="ts">
import type { FactoryState } from '~/types/factory'

const props = defineProps<{ state: FactoryState | null }>()

const STATUS_STYLE: Record<FactoryState['status'], { color: string; label: string }> = {
  HEALTHY: { color: 'var(--color-state-healthy)', label: 'Healthy' },
  DEGRADED: { color: 'var(--color-state-warning)', label: 'Degraded' },
  FAILED: { color: 'var(--color-state-critical)', label: 'Failed' },
}

// Flash-once-then-settle per 01_00 10.4 ("counters that changed may flash
// gold once, then settle to their state color") — one Metric child per
// value handles its own transient flash via a watcher, not a global timer.
</script>

<template>
  <PanelShell title="Factory state" :alarm="state?.status === 'FAILED'" class="factory-state-panel">
    <template #badge>
      <span
        v-if="state"
        class="state-pill"
        :style="{ color: STATUS_STYLE[state.status].color, borderColor: STATUS_STYLE[state.status].color }"
      >
        {{ STATUS_STYLE[state.status].label }}
      </span>
    </template>
    <div class="metric-grid">
      <FactoryMetric label="Orders" :value="state?.orders.total ?? '—'" compact />
      <FactoryMetric
        label="Inconsistent"
        :value="state?.orders.inconsistent ?? '—'"
        :warn="!!state && state.orders.inconsistent > 0"
        compact
      />
      <FactoryMetric label="Products" :value="state?.products.total ?? '—'" compact />
      <FactoryMetric label="Avg price" :value="state ? `€${state.products.avgPrice.toFixed(2)}` : '—'" compact />
      <FactoryMetric
        label="Low stock"
        :value="state?.inventory.lowStockCount ?? '—'"
        :warn="!!state && state.inventory.lowStockCount > 0"
        compact
      />
    </div>
  </PanelShell>
</template>

<style scoped>
.factory-state-panel { display: flex; flex-direction: column; }
.metric-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1px;
  background: var(--color-border-subtle);
  flex: 1;
}

@media (max-width: 640px) {
  .metric-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
