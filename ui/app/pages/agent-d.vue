<script setup lang="ts">
// prompts/frontend/01_02_dashboard_navigation_and_sidebar.md — Agent D's
// own section: full inspection/containment detail. Deliberately its own
// route, not a step appended to the A-to-B-to-C chain (01_00 section
// 10.6's "must not look like Agent C delegates to Agent D") — Overview
// and the sidebar itself only ever show Agent D's current status badge.
definePageMeta({ layout: 'dashboard' })

const { riskState, findings } = useEventStream()

// Shared with the layout via useState — if a viewer disables Agent D
// visibility while this page happens to be open (or links here directly
// while it's off), send them back to Overview rather than leaving an
// unreachable-from-the-sidebar page on screen.
const showAgentD = useState('show-agent-d', () => true)
watchEffect(() => {
  if (!showAgentD.value) navigateTo('/')
})
</script>

<template>
  <div class="agent-d-page">
    <AgentDLane :risk-state="riskState" :findings="findings" default-open />
  </div>
</template>

<style scoped>
.agent-d-page { max-width: 720px; }
</style>
