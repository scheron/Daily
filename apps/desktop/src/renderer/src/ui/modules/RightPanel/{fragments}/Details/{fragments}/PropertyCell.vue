<script setup lang="ts">
import {cn} from "@/utils/ui/tailwindcss"

defineProps<{
  label: string
  isEmpty?: boolean
}>()

const emit = defineEmits<{click: []}>()

function getCellClasses(isEmpty?: boolean) {
  return cn(
    "focus-visible-accent hover:bg-base-content/10 flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm transition-colors",
    isEmpty && "text-base-content/40",
  )
}
</script>

<template>
  <button type="button" :class="getCellClasses(isEmpty)" @click="emit('click')">
    <slot name="icon" />
    <span class="min-w-0 flex-1 truncate text-left leading-none">{{ label }}</span>
  </button>
</template>
