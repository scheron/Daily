<script setup lang="ts">
import {computed, HTMLAttributes} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

const props = defineProps<{
  active: boolean
  class?: HTMLAttributes["class"]
}>()

const buttonClass = computed(() => {
  const baseClass = "flex-1 rounded-lg border p-3 text-left flex flex-col items-start justify-start transition-colors"
  return cn(baseClass, [props.active ? "border-accent bg-accent/10" : "border-base-300 bg-base-200 hover:border-base-content/20"], props.class)
})
</script>

<template>
  <button :class="buttonClass">
    <slot />
  </button>
</template>
