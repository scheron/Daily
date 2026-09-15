<script setup lang="ts" generic="T extends string">
import {cn} from "@/utils/ui/tailwindcss"

defineProps<{
  options: {value: T; label: string}[]
}>()

const model = defineModel<T>({required: true})

function getOptionClasses(isActive: boolean) {
  return cn(
    "focus-visible-accent cursor-pointer rounded px-2.5 py-1 transition-colors outline-none",
    isActive ? "bg-accent text-base-100" : "text-base-content/60 hover:text-base-content",
  )
}
</script>

<template>
  <div class="bg-base-300 inline-flex items-center gap-0.5 rounded-md p-0.5 text-xs">
    <button v-for="opt in options" :key="opt.value" type="button" :class="getOptionClasses(model === opt.value)" @click="model = opt.value">
      {{ opt.label }}
    </button>
  </div>
</template>
