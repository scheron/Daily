<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"

import About from "./fragments/About.vue"
import Shortcuts from "./fragments/Shortcuts.vue"
import StorageSettings from "./fragments/StorageSettings.vue"
</script>

<template>
  <div class="flex w-full cursor-auto flex-col gap-3 py-3">
    <div>
      <div class="border-base-300 text-accent mb-2 flex items-center gap-1 border-b pb-1 text-xs font-bold uppercase select-none">
        <BaseIcon name="star" class="size-4" />
        About
      </div>

      <div class="flex flex-col gap-1 px-2">
        <About />
      </div>
    </div>
    <div>
      <div class="border-base-300 text-accent mb-2 flex items-center gap-1 border-b pb-1 text-xs font-bold uppercase select-none">
        <BaseIcon name="keyboard" class="size-4" />
        Shortcuts
      </div>

      <div class="flex flex-col gap-1 px-2">
        <Shortcuts />
      </div>
    </div>

    <div>
      <div class="border-base-300 text-accent mb-2 flex items-center gap-1 border-b pb-1 text-xs font-bold uppercase select-none">
        <BaseIcon name="folder" class="size-4" />
        Storage
      </div>
      <div class="flex flex-col gap-1 px-2">
        <StorageSettings />
      </div>
    </div>
  </div>
</template>
