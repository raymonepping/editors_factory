<script setup lang="ts">
// prompts/v2/02_06 — wraps ProfileSwitch.vue unchanged (it already owns
// the Authority Profile control end to end) and adds the two genuinely
// new v2 selectors alongside it: Execution Model and Fault Injection.
// Mode changes are disabled while a run is active — 02_00's "Orthogonal
// Demo Controls": workflow_mode and profile never affect each other.
import type { AuthorityMechanism, FaultInjectionMode, Profile, WorkflowMode } from '~/types/factory'

const props = defineProps<{
  profile: Profile | null
  workflowMode: WorkflowMode | null
  faultInjectionMode: FaultInjectionMode | null
  authorityMechanism: AuthorityMechanism | null
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:profile': [Profile]
  'update:workflowMode': [WorkflowMode]
  'update:faultInjectionMode': [FaultInjectionMode]
  'update:authorityMechanism': [AuthorityMechanism]
}>()

const WORKFLOW_MODES: { value: WorkflowMode; label: string }[] = [
  { value: 'fixed_chain', label: 'Fixed Chain (v1)' },
  { value: 'recoverable_dag', label: 'Recoverable Micro-DAG (v2)' },
]
const FAULT_MODES: { value: FaultInjectionMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fail_before_mutation', label: 'Fail Before Mutation' },
  { value: 'fail_after_mutation', label: 'Fail After Mutation' },
  { value: 'lock_timeout', label: 'Lock Timeout' },
]
// prompts/v3/03_01 — a separate, additive credential path (its own
// root-scoped Vault database mount, its own narrow role), not a
// replacement for anything v1/v2 already do. "(preview)" and the note
// below are deliberate: credential issuance here goes through a demo
// token issuer factory-api itself runs, standing in for a real IdP
// (Keycloak in this stack can't yet produce a token Vault accepts —
// see prompts/v3/03_00_findings.md) — Vault's own verification and
// enforcement are real, only the IdP role is stood in for.
const AUTHORITY_MECHANISMS: { value: AuthorityMechanism; label: string }[] = [
  { value: 'sentinel_approle', label: 'Sentinel + AppRole (v1/v2)' },
  { value: 'vault_native_oauth', label: 'Vault-native OAuth (v3 preview)' },
]

const isV2 = computed(() => props.workflowMode === 'recoverable_dag')
</script>

<template>
  <section class="panel" aria-labelledby="workflow-control-title">
    <div class="panel-header">
      <h2 id="workflow-control-title" class="panel-title">Workflow controls</h2>
      <ProfileSwitch
        :model-value="profile"
        :disabled="disabled"
        @update:model-value="(p) => emit('update:profile', p)"
      />
    </div>
    <div class="control-body">
      <fieldset class="control-group">
        <legend>Execution model</legend>
        <div class="segment-row" role="radiogroup" aria-label="Execution model">
          <button
            v-for="mode in WORKFLOW_MODES"
            :key="mode.value"
            type="button"
            role="radio"
            :aria-checked="workflowMode === mode.value"
            class="segment"
            :class="{ 'is-selected': workflowMode === mode.value }"
            :disabled="disabled"
            @click="!disabled && workflowMode !== mode.value && emit('update:workflowMode', mode.value)"
          >
            {{ mode.label }}
          </button>
        </div>
      </fieldset>

      <fieldset class="control-group" :class="{ 'is-inactive': !isV2 }">
        <legend>Fault injection <span class="v2-only">v2 only</span></legend>
        <div class="segment-row" role="radiogroup" aria-label="Fault injection mode">
          <button
            v-for="mode in FAULT_MODES"
            :key="mode.value"
            type="button"
            role="radio"
            :aria-checked="faultInjectionMode === mode.value"
            class="segment segment--compact"
            :class="{ 'is-selected': faultInjectionMode === mode.value }"
            :disabled="disabled || !isV2"
            @click="!disabled && isV2 && faultInjectionMode !== mode.value && emit('update:faultInjectionMode', mode.value)"
          >
            {{ mode.label }}
          </button>
        </div>
      </fieldset>

      <fieldset class="control-group">
        <legend>Credential mechanism <span class="v2-only">v3 preview</span></legend>
        <div class="segment-row" role="radiogroup" aria-label="Credential mechanism">
          <button
            v-for="mech in AUTHORITY_MECHANISMS"
            :key="mech.value"
            type="button"
            role="radio"
            :aria-checked="authorityMechanism === mech.value"
            class="segment segment--compact"
            :class="{ 'is-selected': authorityMechanism === mech.value }"
            :disabled="disabled"
            @click="!disabled && authorityMechanism !== mech.value && emit('update:authorityMechanism', mech.value)"
          >
            {{ mech.label }}
          </button>
        </div>
        <p v-if="authorityMechanism === 'vault_native_oauth'" class="control-hint">
          Agent C's credential is issued through Vault's native OAuth Resource Server + Agent Registry mechanism instead of Sentinel + AppRole — a demo token issuer stands in for a real identity provider (Vault's own verification is real). Read-only, scoped to a separate database role.
        </p>
      </fieldset>

      <p v-if="disabled" class="control-hint">
        Mode changes are disabled while a run is active — reset the factory first.
      </p>
    </div>
  </section>
</template>

<style scoped>
.control-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 20px 18px;
}
.control-group {
  border: none;
  padding: 0;
  margin: 0;
}
.control-group legend {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  padding: 0 0 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.v2-only {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-bg-panel-info);
  border: var(--border-width) solid var(--color-border-info);
  color: var(--color-text-secondary);
  text-transform: none;
  letter-spacing: 0;
}
.control-group.is-inactive {
  opacity: 0.55;
}
.segment-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.segment {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: var(--radius-control);
  border: var(--border-width) solid var(--color-border-subtle);
  background: var(--color-bg-panel-info);
  color: var(--color-text-secondary);
  cursor: pointer;
}
.segment--compact {
  padding: 5px 10px;
  font-size: 11px;
}
.segment:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.segment.is-selected {
  border-color: var(--color-border-active);
  box-shadow: 0 0 0 1px var(--color-border-active);
  color: var(--color-text-primary);
  background: var(--color-bg-panel-active, var(--color-bg-panel-info));
}
.control-hint {
  margin: 0;
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>
