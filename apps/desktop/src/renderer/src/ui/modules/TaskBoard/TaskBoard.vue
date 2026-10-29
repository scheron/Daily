<script setup lang="ts">
import {computed, useTemplateRef, watch} from "vue"
import {storeToRefs} from "pinia"

import {useTaskColumns} from "@/composables/tasks/useTaskColumns"
import {useSettingValue} from "@/composables/useSettingValue"
import {TASK_COLUMNS} from "@/constants/ui"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import ActionsDock from "@/ui/modules/ActionsDock"
import CalendarDock from "@/ui/modules/CalendarDock"
import FocusDock from "@/ui/modules/FocusDock.vue"
import TagsDock from "@/ui/modules/TagsDock.vue"
import {cn} from "@/utils/ui/tailwindcss"
import {useColumnReorder} from "./composables/useColumnReorder"
import {useDragScroll} from "./composables/useDragScroll"
import ColumnDragPreview from "./{fragments}/ColumnDragPreview.vue"
import NoTasksPlaceholder from "./{fragments}/NoTasksPlaceholder.vue"
import TaskColumn from "./{fragments}/TaskColumn.vue"
import TaskDragPreview from "./{fragments}/TaskDragPreview.vue"

import type {TaskStatus} from "@daily/protocol"

const emit = defineEmits<{createTask: []}>()

const tasksStore = useTasksStore()
const filterStore = useFilterStore()
const milestonesStore = useMilestonesStore()
const dragDropStore = useDragDropStore()

const {activeDay} = storeToRefs(tasksStore)

const containerRef = useTemplateRef<HTMLElement>("container")
const boardRef = useTemplateRef<HTMLElement>("board")

const columns = useTaskColumns()
const boardMode = useSettingValue("appearance.boardMode", "normal")
const columnOrder = useSettingValue(
  "layout.columnOrder",
  TASK_COLUMNS.map((column) => column.status),
)

const {draggingStatus, previewOrder, previewPosition} = useColumnReorder(boardRef)

const visibleColumns = computed(() => {
  const order = previewOrder.value ?? (Array.isArray(columnOrder.value) ? columnOrder.value : [])
  const position = (status: (typeof order)[number]) => {
    const index = order.indexOf(status)
    return index === -1 ? order.length : index
  }

  return TASK_COLUMNS.filter((column) => boardMode.value === "agents" || !["ready_for_agent", "ready_to_merge"].includes(column.status)).sort(
    (left, right) => position(left.status) - position(right.status),
  )
})

const columnLayoutStyle = computed(() => {
  const collapsed = visibleColumns.value.map((column) => columns.isColumnCollapsed(column.status))
  const expandedCount = collapsed.filter((isCollapsed) => !isCollapsed).length
  const dividerCount = collapsed.slice(1).filter((isCollapsed, index) => !isCollapsed && !collapsed[index]).length

  return {
    "--board-collapsed-columns": collapsed.length - expandedCount,
    "--board-expanded-columns": Math.max(1, expandedCount),
    "--board-column-dividers": dividerCount,
  }
})

const framedMilestoneName = computed(() => {
  if (filterStore.frame !== "milestone") return undefined
  if (filterStore.isNoMilestoneActive) return "No milestone"
  if (!filterStore.activeMilestoneId) return "All tasks"
  return milestonesStore.milestonesMap.get(filterStore.activeMilestoneId)?.name
})

const placeholderDate = computed(() => (filterStore.frame === "milestone" ? undefined : tasksStore.activeDay))

const isBoardVisible = computed(() => {
  if (dragDropStore.draggingTaskId) return true

  const byStatus = columns.tasksByStatus.value
  return Object.values(byStatus).some((tasks) => tasks.length > 0)
})

useDragScroll(boardRef)

function getColumnClasses(status: TaskStatus) {
  return cn(draggingStatus.value === status && "pointer-events-none")
}

watch(activeDay, () => containerRef.value?.scrollTo({top: 0, behavior: "instant"}))
</script>

<template>
  <div ref="container" class="relative min-w-0 flex-1 overflow-hidden">
    <NoTasksPlaceholder v-if="!isBoardVisible" :date="placeholderDate" :milestone-name="framedMilestoneName" @create-task="emit('createTask')" />

    <div v-else ref="board" data-task-board class="task-board flex size-full overflow-x-auto overflow-y-hidden" :style="columnLayoutStyle">
      <template v-for="(column, index) in visibleColumns" :key="column.status">
        <TaskColumn :status="column.status" :class="getColumnClasses(column.status)" />

        <div
          v-if="
            index < visibleColumns.length - 1 &&
            !columns.isColumnCollapsed(column.status) &&
            !columns.isColumnCollapsed(visibleColumns[index + 1].status)
          "
          class="to-base-300/50 bg-linear-to-b h-full w-px shrink-0 from-transparent from-[44px] to-[98px]"
        />
      </template>
    </div>

    <div class="drag-region absolute inset-x-0 top-0 z-20 h-11" />
    <TagsDock />
    <CalendarDock />
    <ActionsDock @create-task="emit('createTask')" />
    <FocusDock />
    <TaskDragPreview />
    <ColumnDragPreview v-if="draggingStatus" :status="draggingStatus" :x="previewPosition.x" :y="previewPosition.y" />
  </div>
</template>

<style scoped>
.task-board {
  container-type: inline-size;
  --board-column-rail-width: calc(var(--spacing) * 17);
  --board-compact-column-width: calc(
    0.7 *
      max(
        370px,
        (100cqw - var(--board-collapsed-columns) * var(--board-column-rail-width) - var(--board-column-dividers) * 1px) /
          var(--board-expanded-columns)
      )
  );
}
</style>
