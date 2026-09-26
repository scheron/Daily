<script setup lang="ts">
import {computed, useTemplateRef, watch} from "vue"
import {storeToRefs} from "pinia"

import {useTaskColumns} from "@/composables/tasks/useTaskColumns"
import {TASK_COLUMNS} from "@/constants/ui"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import ActionsDock from "@/ui/modules/ActionsDock"
import CalendarDock from "@/ui/modules/CalendarDock"
import FocusDock from "@/ui/modules/FocusDock"
import TagsDock from "@/ui/modules/TagsDock.vue"
import {useDragScroll} from "./composables/useDragScroll"
import NoTasksPlaceholder from "./{fragments}/NoTasksPlaceholder.vue"
import TaskColumn from "./{fragments}/TaskColumn.vue"
import TaskDragPreview from "./{fragments}/TaskDragPreview.vue"

const emit = defineEmits<{createTask: []}>()

const tasksStore = useTasksStore()
const filterStore = useFilterStore()
const milestonesStore = useMilestonesStore()
const dragDropStore = useDragDropStore()

const {activeDay} = storeToRefs(tasksStore)

const containerRef = useTemplateRef<HTMLElement>("container")
const boardRef = useTemplateRef<HTMLElement>("board")

const columns = useTaskColumns()

const framedMilestoneName = computed(() => {
  if (filterStore.frame !== "milestone") return undefined
  if (!filterStore.activeMilestoneId) return "All milestones"
  return milestonesStore.milestonesMap.get(filterStore.activeMilestoneId)?.name
})

const placeholderDate = computed(() => (filterStore.frame === "milestone" ? undefined : tasksStore.activeDay))

const isBoardVisible = computed(() => {
  if (dragDropStore.draggingTaskId) return true

  const byStatus = columns.tasksByStatus.value
  return byStatus.active.length + byStatus.done.length + byStatus.discarded.length + byStatus.backlog.length > 0
})

useDragScroll(boardRef)

watch(activeDay, () => containerRef.value?.scrollTo({top: 0, behavior: "instant"}))
</script>

<template>
  <div ref="container" class="relative min-w-0 flex-1 overflow-hidden">
    <NoTasksPlaceholder v-if="!isBoardVisible" :date="placeholderDate" :milestone-name="framedMilestoneName" @create-task="emit('createTask')" />

    <div v-else ref="board" data-task-board class="flex size-full overflow-x-auto overflow-y-hidden">
      <template v-for="(column, index) in TASK_COLUMNS" :key="column.status">
        <TaskColumn :status="column.status" />

        <div
          v-if="
            index < TASK_COLUMNS.length - 1 && !columns.isColumnCollapsed(column.status) && !columns.isColumnCollapsed(TASK_COLUMNS[index + 1].status)
          "
          class="to-base-300/50 h-full w-px shrink-0 bg-linear-to-b from-transparent from-[44px] to-[98px]"
        />
      </template>
    </div>

    <div class="drag-region absolute inset-x-0 top-0 z-20 h-11" />
    <TagsDock />
    <CalendarDock />
    <ActionsDock @create-task="emit('createTask')" />
    <FocusDock />
    <TaskDragPreview />
  </div>
</template>
