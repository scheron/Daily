<script setup lang="ts">
import IconsSection from "./{fragments}/IconsSection.vue"
import SettingsGroup from "../SettingsGroup.vue"
</script>

<template>
  <div class="flex flex-col gap-8 py-2">
    <SettingsGroup label="Icons" icon="image">
      <IconsSection />
    </SettingsGroup>
  </div>
</template>
