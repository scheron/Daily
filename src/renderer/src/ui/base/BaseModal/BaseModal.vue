<script setup lang="ts">
import {cn} from "@/utils/ui/tailwindcss"

import Header from "./{fragments}/Header.vue"

import type {HTMLAttributes} from "vue"

withDefaults(
  defineProps<{
    title?: string
    fullscreen?: boolean
    hideHeader?: boolean
    hideToolbar?: boolean
    contentClass?: HTMLAttributes["class"]
    containerClass?: HTMLAttributes["class"]
  }>(),
  {
    fullscreen: false,
  },
)

defineEmits<{close: []}>()
</script>

<template>
  <div class="absolute inset-0 flex items-center justify-center" tabindex="-1">
    <div class="bg-base-300/60 absolute inset-0 backdrop-blur-xs" @click="$emit('close')" />

    <div class="bg-base-100 relative flex flex-col" :class="cn([fullscreen ? 'size-full' : 'h-[90vh] w-[90vw] rounded-lg'], containerClass)">
      <Header v-if="!hideHeader" :title="title" :hide-toolbar="hideToolbar" @close="$emit('close')">
        <template v-if="$slots.toolbar" #toolbar><slot name="toolbar" /></template>
        <template v-if="$slots.actions" #actions><slot name="actions" /></template>
      </Header>

      <div :class="cn('flex-1 overflow-y-auto md:p-4', contentClass)">
        <slot />
      </div>
    </div>
  </div>
</template>
