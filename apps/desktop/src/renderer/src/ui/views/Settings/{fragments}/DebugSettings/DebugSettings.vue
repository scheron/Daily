<script setup lang="ts">
import SettingsGroup from "@/ui/views/Settings/{fragments}/SettingsGroup.vue"
import IconsSection from "./{fragments}/IconsSection.vue"
</script>

<template>
  <div class="flex flex-col gap-8 py-2">
    <SettingsGroup label="Icons" icon="image">
      <IconsSection />
    </SettingsGroup>
  </div>
</template>
