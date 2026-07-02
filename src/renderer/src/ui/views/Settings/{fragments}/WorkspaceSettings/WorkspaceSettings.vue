<script setup lang="ts">
import ProjectsForm from "@/ui/common/projects/ProjectsForm.vue"
import TagsForm from "@/ui/common/tags/TagsForm.vue"

import SettingsGroup from "../SettingsGroup.vue"
</script>

<template>
  <div class="grid grid-cols-2 items-start gap-6 py-2">
    <SettingsGroup label="Tags" icon="tags">
      <TagsForm />
    </SettingsGroup>

    <SettingsGroup label="Projects" icon="project">
      <ProjectsForm />
    </SettingsGroup>
  </div>
</template>
