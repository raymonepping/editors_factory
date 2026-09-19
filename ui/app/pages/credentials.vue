<script setup lang="ts">
// prompts/frontend/01_02_dashboard_navigation_and_sidebar.md — Credentials
// section: the full Vault credential lifecycle ledger (issuance, renewal
// count, revocation reason, history). Overview keeps only enough of this
// story via The Story's own steps and the sidebar's active-credential dot.
definePageMeta({ layout: 'dashboard' })

const { credentialLedger } = useEventStream()
</script>

<template>
  <div class="credentials-page">
    <CredentialLedger :ledger="credentialLedger" />
  </div>
</template>

<style scoped>
.credentials-page { max-width: 640px; }
</style>
