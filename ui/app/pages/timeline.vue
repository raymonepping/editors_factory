<script setup lang="ts">
// prompts/frontend/01_02_dashboard_navigation_and_sidebar.md — Timeline
// section: the full raw event log, previously a collapsed panel
// competing for space on the single long page.
definePageMeta({ layout: 'dashboard' })

const { timeline } = useEventStream()
</script>

<template>
  <EventTimeline :entries="timeline" default-open />
</template>
