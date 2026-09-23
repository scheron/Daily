<script setup lang="ts">
import {computed} from "vue"

import {useTaskColumns} from "@/composables/tasks/useTaskColumns"
import {TASK_COLUMNS} from "@/constants/ui"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {TaskStatus} from "@daily/protocol"

const props = defineProps<{
  status: TaskStatus
}>()

const columns = useTaskColumns()

const column = computed(() => TASK_COLUMNS.find((s) => s.status === props.status)!)
const tasksCount = computed(() => columns.tasksByStatus.value[props.status].length)
const collapsed = computed(() => columns.isColumnCollapsed(props.status))

const containerStyle = computed(() => (collapsed.value ? undefined : {flexBasis: "370px", minWidth: "370px"}))

function onToggle() {
  columns.onToggleColumn(props.status)
}

function getContainerClasses(isCollapsed: boolean) {
  return cn("bg-base-100 relative flex min-w-0 flex-col overflow-hidden", isCollapsed ? "w-17 max-w-17 min-w-17 h-full" : "h-full grow shrink-0")
}

function getRailClasses(titleClass: string) {
  return cn(
    "dock-surface focus-visible-accent hover:bg-base-200/60 mx-3 mt-14 flex w-11 cursor-pointer flex-col items-center gap-2 rounded-full py-2.5 transition-colors outline-none",
    titleClass,
  )
}

function getHeaderClasses(titleClass: string) {
  return cn(
    "focus-visible-accent absolute inset-x-0 top-14 z-10 flex h-9 cursor-pointer items-center justify-between px-4 transition-colors outline-none",
    titleClass,
  )
}

function getCounterClasses(counterClass: string) {
  return cn("rounded-full px-2 py-0.5 text-xs font-medium", counterClass)
}

function getListClasses(isCollapsed: boolean) {
  return cn(
    "pt-25 absolute inset-0 flex min-w-0 overflow-y-auto overflow-x-hidden px-1.5 pb-4",
    isCollapsed && "pointer-events-none invisible w-0 px-0",
  )
}
</script>

<template>
  <div :data-column-status="column.status" :class="getContainerClasses(collapsed)" :style="containerStyle">
    <button
      v-if="collapsed"
      type="button"
      aria-expanded="false"
      :title="column.label"
      :aria-label="`${column.label} column, ${tasksCount} tasks`"
      :class="getRailClasses(column.titleClass)"
      @click="onToggle"
    >
      <BaseIcon :name="column.icon" class="size-4" />
      <span :class="getCounterClasses(column.counterClass)">
        {{ tasksCount }}
      </span>
    </button>

    <button v-else type="button" aria-expanded="true" :class="getHeaderClasses(column.titleClass)" @click="onToggle">
      <span class="flex items-center gap-2">
        <BaseIcon :name="column.icon" class="size-4" />
        <span class="text-sm font-medium uppercase tracking-wide">{{ column.label }}</span>
      </span>
      <span :class="getCounterClasses(column.counterClass)">
        {{ tasksCount }}
      </span>
    </button>

    <div :class="getListClasses(collapsed)">
      <slot />

      <div
        v-if="!collapsed && !tasksCount && !columns.isDragging.value"
        class="text-base-content/70 pointer-events-none absolute inset-1.5 flex flex-col items-center justify-center gap-2 rounded-lg text-center"
      >
        <div class="bg-base-200 rounded-full p-3">
          <BaseIcon name="empty" class="size-5" />
        </div>
        <span class="text-sm">No {{ column.emptyLabel }} tasks</span>
      </div>
    </div>

    <template v-if="!collapsed">
      <div
        class="from-base-100 via-base-100/60 h-26 bg-linear-to-b pointer-events-none absolute inset-x-0 top-0 z-[5] from-35% via-70% to-transparent"
      />
      <div class="to-base-100/70 bg-linear-to-b pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-12 from-transparent" />
    </template>
  </div>
</template>
