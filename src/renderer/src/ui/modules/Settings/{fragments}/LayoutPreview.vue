<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"

import type {LayoutType} from "@shared/types/storage"

defineProps<{
  type: LayoutType
  label: string
  selected: boolean
}>()
</script>

<template>
  <button
    class="border-base-300 hover:border-accent focus-visible:ring-accent bg-base-100 relative flex w-full flex-col items-center rounded-lg border p-2 transition-colors outline-none focus-visible:ring-2"
    :class="{'border-accent shadow-lg': selected}"
  >
    <div class="bg-base-200 border-base-300 relative flex h-20 w-full overflow-hidden rounded-md border p-1.5">
      <template v-if="type === 'list'">
        <div class="flex w-5 flex-col gap-1 border-r pr-1" :class="{'border-base-300': true}">
          <div class="bg-base-300 h-2 rounded-sm" />
          <div class="bg-base-300 h-2 rounded-sm" />
          <div class="bg-base-300 h-2 rounded-sm" />
        </div>
        <div class="flex flex-1 flex-col gap-1 pl-1.5">
          <div class="bg-base-100 border-base-300 h-3 rounded-sm border" />
          <div class="bg-base-100 border-base-300 h-6 rounded-sm border" />
          <div class="bg-base-100 border-base-300 h-6 rounded-sm border" />
        </div>
      </template>

      <template v-else>
        <div class="flex w-5 flex-col gap-1 border-r pr-1" :class="{'border-base-300': true}">
          <div class="bg-base-300 h-2 rounded-sm" />
          <div class="bg-base-300 h-2 rounded-sm" />
          <div class="bg-base-300 h-2 rounded-sm" />
        </div>
        <div class="flex flex-1 gap-1 pl-1.5">
          <div class="bg-base-100 border-base-300 flex-1 rounded-sm border" />
          <div class="bg-base-100 border-base-300 flex-1 rounded-sm border" />
          <div class="bg-base-100 border-base-300 flex-1 rounded-sm border" />
        </div>
      </template>
    </div>

    <div class="mt-1 flex w-full items-center justify-center gap-1">
      <BaseIcon v-if="selected" name="check" class="text-accent size-4" />
      <span class="text-base-content truncate text-xs font-medium">{{ label }}</span>
    </div>
  </button>
</template>
