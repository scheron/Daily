<script setup lang="ts">
import {computed} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

const props = defineProps<{
  active?: boolean
}>()

const barClass = computed(() =>
  cn("bg-transparent transition-colors duration-150 group-hover:bg-base-content/40 h-full w-px", {"bg-accent!": props.active}),
)
</script>

<template>
  <div role="separator" aria-orientation="vertical" class="group flex w-2.5 shrink-0 cursor-ew-resize touch-none items-center justify-center">
    <div :class="barClass" />
  </div>
</template>
