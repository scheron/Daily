<script setup lang="ts">
import {computed} from "vue"

import {useTaskColumns} from "@/composables/tasks/useTaskColumns"
import {TASK_COLUMNS} from "@/constants/ui"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {TaskStatus} from "@daily/protocol"

const props = defineProps<{status: TaskStatus; x: number; y: number}>()

const columns = useTaskColumns()

const column = computed(() => TASK_COLUMNS.find((column) => column.status === props.status)!)
const tasksCount = computed(() => columns.tasksByStatus.value[props.status].length)
const position = computed(() => ({translate: `${props.x - 26}px ${props.y - 22}px`}))

function getIconClasses(titleClass: string) {
  return cn("size-4 shrink-0", titleClass)
}

function getCounterClasses(counterClass: string) {
  return cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", counterClass)
}
</script>

<template>
  <Teleport to="body">
    <div
      data-column-drag-preview
      aria-hidden="true"
      inert
      class="bg-base-100/80 border-base-300/70 dark:border-base-300 pointer-events-none fixed left-0 top-0 z-[100002] flex h-[44px] w-[248px] shrink-0 -rotate-[1.6deg] items-center gap-2.5 overflow-hidden rounded-full border px-[18px] opacity-90 shadow-lg backdrop-blur-sm"
      :style="position"
    >
      <BaseIcon :name="column.icon" :class="getIconClasses(column.titleClass)" />
      <span class="min-w-0 flex-1 truncate text-sm">{{ column.label }}</span>
      <span :class="getCounterClasses(column.counterClass)">{{ tasksCount }}</span>
    </div>
  </Teleport>
</template>
