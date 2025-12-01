<script setup lang="ts">
import type {Theme} from "@/types/theme"

import BaseIcon from "@/ui/base/BaseIcon"

defineProps<{
  theme: Theme
  systemEnabled: boolean
  selected: boolean
  preferred: boolean
}>()
</script>

<template>
  <button
    class="border-base-300 hover:border-accent focus-visible:ring-accent relative flex w-[140px] max-w-[140px] min-w-[140px] flex-shrink-0 flex-col items-center rounded-lg border p-2 transition-colors outline-none focus-visible:ring-2"
    :class="{'border-accent shadow-lg': selected}"
    tabindex="0"
  >
    <div
      class="relative flex h-20 w-full overflow-hidden rounded-md border"
      :style="{borderColor: theme.colorScheme['base-300'], backgroundColor: theme.colorScheme['base-100']}"
    >
      <div
        class="flex flex-col gap-0.5 border-r py-0.5"
        :style="{width: '20%', borderColor: theme.colorScheme['base-300'], backgroundColor: theme.colorScheme['base-100']}"
      >
        <div class="flex flex-col gap-0.5 px-0.5">
          <div class="rounded-sm" :style="{width: '80%', height: '2px', backgroundColor: theme.colorScheme['base-content']}" />
          <div class="rounded-sm" :style="{width: '60%', height: '2px', backgroundColor: theme.colorScheme['base-content']}" />
          <div class="rounded-sm" :style="{width: '40%', height: '2px', backgroundColor: theme.colorScheme['base-content']}" />
        </div>
      </div>

      <div class="flex flex-1 flex-col gap-0.5 py-0.5 pr-0.5 pl-0.5">
        <div class="mb-0.5 flex items-center gap-0.5 border-b pb-1" :style="{borderColor: theme.colorScheme['base-300']}">
          <div class="rounded-sm" :style="{width: '35%', height: '2px', backgroundColor: theme.colorScheme['base-content'], opacity: 0.3}" />
          <div class="ml-auto rounded-sm" :style="{width: '10px', height: '2px', backgroundColor: theme.colorScheme.accent}" />
        </div>

        <div class="mb-0.5 flex items-center justify-between gap-0.5 px-0.5">
          <div class="rounded-sm" :style="{width: '28%', height: '2px', backgroundColor: theme.colorScheme['base-content']}" />
          <div class="rounded-sm" :style="{width: '28%', height: '3px', backgroundColor: theme.colorScheme['base-300']}" />
        </div>

        <div class="flex flex-1 flex-col gap-0.5 rounded-md p-0.5" :style="{backgroundColor: theme.colorScheme['base-200']}">
          <div class="flex h-4 w-full flex-col gap-0.5 rounded-sm p-1" :style="{backgroundColor: theme.colorScheme['base-100']}">
            <div class="rounded-sm" :style="{width: '80%', height: '2px', backgroundColor: theme.colorScheme['base-content']}" />
            <div class="mt-0.5 rounded-sm" :style="{width: '52%', height: '2px', backgroundColor: theme.colorScheme['base-content']}" />
          </div>

          <div class="flex h-3 w-full flex-col gap-0.5 rounded-sm p-1" :style="{backgroundColor: theme.colorScheme['base-100']}">
            <div class="rounded-sm" :style="{width: '20%', height: '2px', backgroundColor: theme.colorScheme['base-content']}" />
          </div>
        </div>
      </div>
    </div>

    <div class="mt-1 flex w-full items-center justify-center gap-1">
      <BaseIcon v-if="systemEnabled && preferred" name="star" class="text-warning size-4" />
      <BaseIcon v-if="!systemEnabled && selected" name="check" class="text-accent size-4" />
      <span class="text-base-content truncate text-xs font-medium">{{ theme.name }}</span>
    </div>
  </button>
</template>
