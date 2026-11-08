<script setup lang="ts">
import {computed, useTemplateRef} from "vue"

import {useTaskColumns} from "@/composables/tasks/useTaskColumns"
import {useBoardCardGeometry} from "@/composables/useBoardCardGeometry"
import {TASK_COLUMNS} from "@/constants/ui"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"
import {useVirtualColumn} from "../composables/useVirtualColumn"
import TaskCard from "./TaskCard"

import type {TaskStatus} from "@daily/protocol"

const props = defineProps<{
  status: TaskStatus
}>()

const listRef = useTemplateRef<HTMLElement>("list")
const trackRef = useTemplateRef<HTMLElement>("track")

const columns = useTaskColumns()
const {isCompact, cardHeight, cardStep} = useBoardCardGeometry()

const column = computed(() => TASK_COLUMNS.find((s) => s.status === props.status)!)
const tasksCount = computed(() => columns.tasksByStatus.value[props.status].length)
const collapsed = computed(() => columns.isColumnCollapsed(props.status))
const items = computed(() => columns.columnItems.value[props.status])
const itemCount = computed(() => items.value.length)

const containerStyle = computed(() => {
  if (collapsed.value) return null
  const width = isCompact.value ? "var(--board-compact-column-width)" : "370px"
  return {flexBasis: width, minWidth: width}
})

const {range, trackHeight} = useVirtualColumn(listRef, trackRef, itemCount)

const visibleItems = computed(() => (collapsed.value ? [] : items.value.slice(range.value.start, range.value.end)))

const containerClass = computed(() =>
  cn("bg-base-100 relative flex h-full min-w-0 flex-col overflow-hidden", [collapsed.value ? "w-17 max-w-17 min-w-17" : "shrink-0"], {
    grow: !collapsed.value && !isCompact.value,
  }),
)
const railClass = computed(() =>
  cn(
    "dock-surface focus-visible-accent hover:bg-base-200/60 mx-3 mt-14 flex w-11 touch-none cursor-grab flex-col items-center gap-2 rounded-full py-2.5 transition-colors outline-none",
    column.value.titleClass,
  ),
)
const headerClass = computed(() =>
  cn(
    "focus-visible-accent absolute inset-x-0 top-14 z-10 flex h-9 touch-none cursor-grab items-center justify-between px-4 transition-colors outline-none",
    column.value.titleClass,
  ),
)
const counterClass = computed(() => cn("rounded-full px-2 py-0.5 text-xs font-medium", column.value.counterClass))
const itemClass = computed(() => cn("absolute inset-x-1.5 top-0", {"transition-transform duration-140": columns.isDragging.value}))
const listClass = computed(() =>
  cn("pt-25 absolute inset-0 flex min-w-0 overflow-y-auto overflow-x-hidden px-1.5 pb-4", {
    "pointer-events-none invisible w-0 px-0": collapsed.value,
  }),
)
const emptyIconClass = computed(() => cn("size-12 opacity-30", column.value.titleClass))

function onToggle() {
  columns.onToggleColumn(props.status)
}

function onCardDragStart(event: DragEvent) {
  if (!(event.target as Element | null)?.closest("a")) event.preventDefault()
}
</script>

<template>
  <div :data-column-status="column.status" :class="containerClass" :style="containerStyle">
    <button
      v-if="collapsed"
      v-tooltip="`${column.label}: click to expand, drag to reorder`"
      type="button"
      data-column-drag-handle
      aria-expanded="false"
      :aria-label="`${column.label} column, ${tasksCount} tasks`"
      :class="railClass"
      @click="onToggle"
    >
      <BaseIcon name="drag-vertical" class="text-base-content/40 size-3.5" />
      <BaseIcon :name="column.icon" class="size-4" />
      <span :class="counterClass">
        {{ tasksCount }}
      </span>
    </button>

    <button
      v-else
      v-tooltip="`${column.label}: click to collapse, drag to reorder`"
      type="button"
      data-column-drag-handle
      aria-expanded="true"
      :class="headerClass"
      @click="onToggle"
    >
      <span class="flex items-center gap-2">
        <BaseIcon name="drag-vertical" class="text-base-content/40 size-3.5" />
        <BaseIcon :name="column.icon" class="size-4" />
        <span class="text-sm font-medium uppercase tracking-wide">{{ column.label }}</span>
      </span>
      <span :class="counterClass">
        {{ tasksCount }}
      </span>
    </button>

    <div ref="list" data-column-list :class="listClass">
      <div ref="track" data-column-track class="relative w-full min-w-px shrink-0" :style="{height: `${trackHeight}px`}">
        <template v-for="(item, offset) in visibleItems" :key="item.kind === 'task' ? item.task.id : 'placeholder'">
          <div
            v-if="item.kind === 'task'"
            data-task-card
            :class="itemClass"
            :style="{transform: `translateY(${(range.start + offset) * cardStep}px)`}"
            @pointerdown="columns.onCardPointerDown($event, item.task)"
            @dragstart="onCardDragStart"
          >
            <TaskCard :task="item.task" />
          </div>
          <div
            v-else
            class="border-base-content/38 bg-base-300/40 duration-140 absolute inset-x-1.5 top-0 rounded-[0.9rem] border border-dashed transition-transform"
            :style="{height: `${cardHeight}px`, transform: `translateY(${(range.start + offset) * cardStep}px)`}"
          />
        </template>
      </div>

      <div
        v-if="!collapsed && !tasksCount && !columns.isDragging.value"
        class="text-base-content/70 pointer-events-none absolute inset-1.5 flex flex-col items-center justify-center gap-2 rounded-lg text-center"
      >
        <BaseIcon :name="column.icon" :class="emptyIconClass" />
        <span class="text-sm"
          >No <span :class="column.titleClass">{{ column.emptyLabel }}</span> tasks</span
        >
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
