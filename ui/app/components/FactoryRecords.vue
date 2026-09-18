<script setup lang="ts">
import type { OrderRecord } from '~/types/factory'

const { getFactoryRecords } = useDemoApi()
const { timeline } = useEventStream()

const PAGE_SIZE = 5

const records = ref<OrderRecord[]>([])
const total = ref(0)
const page = ref(0)
const loading = ref(false)

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

async function load(p: number) {
  loading.value = true
  try {
    const result = await getFactoryRecords(PAGE_SIZE, p * PAGE_SIZE)
    records.value = result.records
    total.value = result.total
    page.value = p
  } catch {
    // Leave whatever was previously shown rather than blanking the panel
    // on a transient fetch failure.
  } finally {
    loading.value = false
  }
}

onMounted(() => load(0))

// Live-updating only while looking at the newest page — re-fetching out
// from under someone who paged back to browse older records would be
// disorienting, not helpful. Watches the shared event timeline (same
// source every other panel reads) rather than opening a second
// connection of its own.
watch(
  () => timeline.value.length,
  () => {
    const newest = timeline.value.at(-1)
    if (newest?.type === 'database_changes' && page.value === 0) load(0)
  },
)

function prev() { if (page.value > 0) load(page.value - 1) }
function next() { if (page.value < pageCount.value - 1) load(page.value + 1) }

const STATUS_TONE: Record<string, string> = {
  inconsistent: 'var(--color-state-warning)',
  quarantined: 'var(--color-state-contained)',
  cancelled: 'var(--color-text-muted)',
  fulfilled: 'var(--color-state-healthy)',
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <PanelShell title="Recent records" collapsible storage-key="records" default-open>
    <template #badge>
      <span class="text-xs" style="color: var(--color-text-muted)">{{ total }} orders</span>
    </template>
    <template #actions>
      <div class="pager">
        <button type="button" class="pager-btn" :disabled="page === 0 || loading" @click="prev" aria-label="Previous page">
          <svg viewBox="0 0 12 12" class="pager-icon"><path d="M7.5 2.5 3.5 6l4 3.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <span class="pager-label mono">{{ page + 1 }} / {{ pageCount }}</span>
        <button type="button" class="pager-btn" :disabled="page >= pageCount - 1 || loading" @click="next" aria-label="Next page">
          <svg viewBox="0 0 12 12" class="pager-icon"><path d="M4.5 2.5 8.5 6l-4 3.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>
    </template>

    <table class="records-table">
      <thead class="visually-hidden">
        <tr><th>Order</th><th>Customer</th><th>Status</th><th>Updated</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in records" :key="r.id">
          <td class="mono col-id">#{{ r.id }}</td>
          <td class="col-customer">{{ r.customer_ref }}</td>
          <td class="col-status">
            <span class="state-pill" :style="{ color: STATUS_TONE[r.status] ?? 'var(--color-text-secondary)' }">{{ r.status }}</span>
          </td>
          <td class="mono col-time">{{ formatTime(r.updated_at) }}</td>
        </tr>
        <tr v-if="!records.length && !loading">
          <td colspan="4" class="empty-row">No orders yet.</td>
        </tr>
      </tbody>
    </table>
  </PanelShell>
</template>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pager-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-control);
  border: var(--border-width) solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.pager-btn:hover:not(:disabled) { border-color: var(--color-border-active); color: var(--color-accent-primary); }
.pager-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.pager-icon { width: 12px; height: 12px; }
.pager-label { font-size: 11px; color: var(--color-text-muted); min-width: 34px; text-align: center; }

.records-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.records-table td {
  padding: 9px 16px;
  border-bottom: var(--border-width) solid var(--color-border-subtle);
  color: var(--color-text-secondary);
}
.records-table tr:last-child td { border-bottom: none; }
.col-id { color: var(--color-text-muted); width: 70px; }
.col-customer { color: var(--color-text-primary); font-weight: 600; }
.col-time { color: var(--color-text-muted); text-align: right; }

.empty-row { text-align: center; color: var(--color-text-muted); padding: 20px; }
</style>
