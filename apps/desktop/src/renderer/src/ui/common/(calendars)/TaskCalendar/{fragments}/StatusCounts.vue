<script setup lang="ts">
import vTooltip from "@/directives/v-tooltip"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {TaskColumn} from "@/types/ui"
import type {TaskStatus} from "@daily/protocol"

defineProps<{
  columns: TaskColumn[]
  counts: Record<TaskStatus, number>
  showLabels?: boolean
}>()

function getCountClasses(hasTasks: boolean, titleClass: string) {
  return cn("flex shrink-0 items-center gap-0.5 whitespace-nowrap", [hasTasks ? titleClass : "text-base-content/50"])
}
</script>

<template>
  <div class="flex shrink-0 items-center gap-2 text-xs font-semibold">
    <span
      v-for="column in columns"
      :key="column.status"
      v-tooltip="showLabels ? column.label : ''"
      :aria-label="`${column.label}: ${counts[column.status]}`"
      :class="getCountClasses(counts[column.status] > 0, column.titleClass)"
    >
      <BaseIcon :name="column.icon" class="size-3" />
      {{ counts[column.status] }}
    </span>
  </div>
</template>
