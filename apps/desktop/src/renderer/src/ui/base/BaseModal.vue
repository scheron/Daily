<script setup lang="ts">
import {computed} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

import type {HTMLAttributes} from "vue"

const props = defineProps<{
  contentClass?: HTMLAttributes["class"]
  containerClass?: HTMLAttributes["class"]
}>()

defineEmits<{close: []}>()

const containerClass = computed(() => cn("bg-base-100 relative flex flex-col h-[90vh] w-[90vw] rounded-lg", props.containerClass))
const contentClass = computed(() => cn("flex-1 overflow-y-auto md:p-4", props.contentClass))
</script>

<template>
  <div class="absolute inset-0 flex items-center justify-center" tabindex="-1">
    <div class="bg-base-300/60 backdrop-blur-xs absolute inset-0" @click="$emit('close')" />

    <div :class="containerClass">
      <slot name="header" />

      <div :class="contentClass">
        <slot />
      </div>
    </div>
  </div>
</template>
