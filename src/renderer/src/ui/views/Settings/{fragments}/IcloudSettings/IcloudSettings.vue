<script setup lang="ts">
import SyncSection from "./{fragments}/SyncSection.vue"
import SettingsGroup from "../SettingsGroup.vue"
</script>

<template>
  <div class="flex flex-col gap-8 py-2">
    <SettingsGroup label="Sync" icon="cloud">
      <SyncSection />
    </SettingsGroup>
  </div>
</template>
