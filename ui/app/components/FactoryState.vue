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
  <section class="panel" aria-labelledby="factory-state-title">
    <div class="panel-header">
      <h2 id="factory-state-title" class="panel-title">Factory state</h2>
      <span
        v-if="state"
        class="state-pill"
        :style="{ color: STATUS_STYLE[state.status].color }"
      >
        {{ STATUS_STYLE[state.status].label }}
      </span>
    </div>
    <div class="metric-grid">
      <FactoryMetric label="Orders" :value="state?.orders.total ?? '—'" />
      <FactoryMetric
        label="Inconsistent"
        :value="state?.orders.inconsistent ?? '—'"
        :warn="!!state && state.orders.inconsistent > 0"
      />
      <FactoryMetric label="Products" :value="state?.products.total ?? '—'" />
      <FactoryMetric label="Avg price" :value="state ? `€${state.products.avgPrice.toFixed(2)}` : '—'" />
      <FactoryMetric
        label="Low stock"
        :value="state?.inventory.lowStockCount ?? '—'"
        :warn="!!state && state.inventory.lowStockCount > 0"
      />
    </div>
  </section>
</template>

<style scoped>
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 1px;
  background: var(--color-border-subtle);
}

/* 5 metrics don't divide evenly across a 3-column auto-fit track at
 * narrow widths — found live: it left one dangling empty cell on
 * mobile. An explicit 2-column layout below this breakpoint divides
 * cleanly (2/2/1) with no leftover track. */
@media (max-width: 480px) {
  .metric-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
