<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"

import ProjectsForm from "./{fragments}/ProjectsForm.vue"
import TagsForm from "./{fragments}/TagsForm.vue"
</script>

<template>
  <div class="grid h-full grid-cols-2 gap-10">
    <div class="flex h-full flex-col gap-4 overflow-hidden px-2">
      <h3 class="text-base-content flex items-center gap-2 text-sm font-semibold">
        <BaseIcon name="tags" class="text-accent size-4" />
        Tags
      </h3>

      <TagsForm />
    </div>

    <div class="flex h-full flex-col gap-4 overflow-hidden px-2">
      <h3 class="text-base-content flex items-center gap-2 text-sm font-semibold">
        <BaseIcon name="project" class="text-accent size-4" />
        Projects
      </h3>

      <ProjectsForm />
    </div>
  </div>
</template>
