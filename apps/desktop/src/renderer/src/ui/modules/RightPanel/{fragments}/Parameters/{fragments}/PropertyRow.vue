<script setup lang="ts">
import {cn} from "@/utils/ui/tailwindcss"

defineProps<{
  label: string
  disabled?: boolean
}>()

function getRowClasses(disabled?: boolean) {
  return cn("flex min-h-8 items-start gap-3 py-0.5", disabled && "pointer-events-none opacity-40")
}
</script>

<template>
  <div :class="getRowClasses(disabled)">
    <span class="text-base-content/50 mt-1 w-24 shrink-0 text-sm leading-none">{{ label }}</span>

    <div class="min-w-0 flex-1 text-sm">
      <slot />
    </div>
  </div>
</template>
