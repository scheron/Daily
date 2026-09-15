<script setup lang="ts">
import {cn} from "@/utils/ui/tailwindcss"
import Header from "./{fragments}/Header.vue"

import type {HTMLAttributes} from "vue"

const props = defineProps<{
  title?: string
  hideHeader?: boolean
  contentClass?: HTMLAttributes["class"]
  containerClass?: HTMLAttributes["class"]
}>()

defineEmits<{close: []}>()

function getContainerClasses() {
  return cn("bg-base-100 relative flex flex-col h-[90vh] w-[90vw] rounded-lg", props.containerClass)
}

function getContentClasses() {
  return cn("flex-1 overflow-y-auto md:p-4", props.contentClass)
}
</script>

<template>
  <div class="absolute inset-0 flex items-center justify-center" tabindex="-1">
    <div class="bg-base-300/60 absolute inset-0 backdrop-blur-xs" @click="$emit('close')" />

    <div :class="getContainerClasses()">
      <Header v-if="!hideHeader" :title="title" @close="$emit('close')" />

      <div :class="getContentClasses()">
        <slot />
      </div>
    </div>
  </div>
</template>
