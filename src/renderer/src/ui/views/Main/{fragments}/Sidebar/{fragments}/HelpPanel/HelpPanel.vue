<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"

import About from "./{fragments}/About.vue"
import Shortcuts from "./{fragments}/Shortcuts.vue"
</script>

<template>
  <div class="flex h-full flex-col gap-4 px-4 py-4">
    <h3 class="text-base-content text-sm font-semibold">Daily</h3>

    <div class="border-base-300 flex flex-col gap-3 rounded-md border p-3">
      <div class="flex items-center gap-2">
        <BaseIcon name="star" class="text-accent size-5" />
        <h3 class="text-xs font-medium">About</h3>
      </div>
      <About />
    </div>

    <div class="border-base-300 flex flex-col gap-3 rounded-md border p-3">
      <div class="flex items-center gap-2">
        <BaseIcon name="keyboard" class="text-accent size-5" />
        <h3 class="text-xs font-medium">Shortcuts</h3>
      </div>
      <Shortcuts />
    </div>

    <div class="border-base-300 flex flex-col gap-3 rounded-md border p-3">
      <div class="flex items-center gap-2">
        <BaseIcon name="folder" class="text-accent size-5" />
        <h3 class="text-xs font-medium">Export</h3>
      </div>
      <p class="text-base-content/60 text-xs leading-relaxed">
        Export functionality is currently in development. Soon you'll be able to export your tasks and data.
      </p>
    </div>
  </div>
</template>
