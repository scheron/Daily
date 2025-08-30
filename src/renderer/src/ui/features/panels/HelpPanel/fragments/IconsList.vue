<script setup lang="ts">
// NOTE: Only debug purpose

import BaseIcon from "@/ui/base/BaseIcon"

</script>

<template>
  <div class="flex flex-1 flex-col overflow-y-auto">
    <div class="space-y-2">
      <h3 class="text-base font-semibold">Icons</h3>
      <p class="text-base-content/80 flex items-start gap-2 text-sm">
        Icons list
      </p>
    </div>

    <div class="mt-4 space-y-2">
      <ul class="text-base-content/80 space-y-1 text-sm">
        <li>- <BaseIcon name="sparkles" class="text-accent mr-2 size-4" /> <span class="font-medium">Sparkles</span></li>
        <li>- <BaseIcon name="touch-hold" class="text-accent mr-2 size-4" /> <span class="font-medium">Touch Hold</span></li>
        <li>- <BaseIcon name="markdown" class="text-accent mr-2 size-4" /> <span class="font-medium">Markdown</span></li>
        <li>- <BaseIcon name="background" class="text-accent mr-2 size-4" /> <span class="font-medium">Background</span></li>
        <li>- <BaseIcon name="keyboard" class="text-accent mr-2 size-4" /> <span class="font-medium">Keyboard</span></li>
        <li>- <BaseIcon name="export" class="text-accent mr-2 size-4" /> <span class="font-medium">Export</span></li>
      </ul>
    </div>
  </div>
</template>
