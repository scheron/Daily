<script setup lang="ts">
import {cn} from "@/utils/ui/tailwindcss"

const props = defineProps<{
  active?: boolean
}>()

function getBarClasses() {
  return cn("bg-transparent transition-colors duration-150 group-hover:bg-base-content/40 h-full w-px", props.active && "bg-accent!")
}
</script>

<template>
  <div role="separator" aria-orientation="vertical" class="group flex w-2.5 shrink-0 cursor-ew-resize touch-none items-center justify-center">
    <div :class="getBarClasses()" />
  </div>
</template>
