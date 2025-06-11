<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
import About from "./fragments/About.vue"
import Shortcuts from "./fragments/Shortcuts.vue"
import TaskWorkflow from "./fragments/TaskWorkflow/TaskWorkflow.vue"
</script>

<template>
  <div class="flex w-full cursor-auto flex-col gap-3 py-3">
    <div>
      <div class="border-b pb-1 mb-2 border-base-300 text-accent flex items-center gap-1 text-xs font-bold uppercase select-none">
        <BaseIcon name="fire" class="size-4" />
        Task workflow
      </div>

      <div class="flex flex-col gap-1 px-2">
        <TaskWorkflow />
      </div>
    </div>

    <div>
      <div class="border-b pb-1 mb-2 border-base-300 text-accent flex items-center gap-1 text-xs font-bold uppercase select-none">
        <BaseIcon name="keyboard" class="size-4" />
        Shortcuts
      </div>

      <div class="flex flex-col gap-1 px-2">
        <Shortcuts />
      </div>
    </div>

    <div>
      <div class="border-b pb-1 mb-2 border-base-300 text-accent flex items-center gap-1 text-xs font-bold uppercase select-none">
        <BaseIcon name="star" class="size-4" />
        About
      </div>

      <div class="flex flex-col gap-1 px-2">
        <About />
      </div>
    </div>
  </div>
</template>
