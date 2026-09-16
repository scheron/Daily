<script setup lang="ts">
import {computed, useTemplateRef, watch} from "vue"
import {storeToRefs} from "pinia"
import VueDraggable from "vuedraggable"

import {useTaskColumns} from "@/composables/tasks/useTaskColumns"
import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import CalendarDock from "@/ui/modules/CalendarDock"
import NewTaskDock from "@/ui/modules/NewTaskDock.vue"
import ProjectDock from "@/ui/modules/ProjectDock.vue"
import TagsDock from "@/ui/modules/TagsDock.vue"
import {useDragScroll} from "./composables/useDragScroll"
import NoTasksPlaceholder from "./{fragments}/NoTasksPlaceholder.vue"
import TaskCard from "./{fragments}/TaskCard"
import TaskColumn from "./{fragments}/TaskColumn.vue"

const DRAGGABLE_ATTRS = {
  group: "daily-board",
  filter: "[data-draggable-task-ignore], [data-draggable-task-ignore] *, button, a, input, textarea, select, [role='button']",
  preventOnFilter: false,
  forceFallback: true,
  fallbackOnBody: true,
  fallbackTolerance: 2,
  ghostClass: "draggable-task-ghost",
  chosenClass: "draggable-task-chosen",
  dragClass: "draggable-task-dragging",
  animation: 140,
}

const emit = defineEmits<{createTask: []}>()

const tasksStore = useTasksStore()
const filterStore = useFilterStore()
const milestonesStore = useMilestonesStore()

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

const hasAnyTasks = computed(
  () =>
    columns.tasksByStatus.value.active.length +
      columns.tasksByStatus.value.done.length +
      columns.tasksByStatus.value.discarded.length +
      columns.tasksByStatus.value.backlog.length >
    0,
)

useDragScroll(boardRef)

watch(activeDay, () => containerRef.value?.scrollTo({top: 0, behavior: "instant"}))
</script>

<template>
  <div ref="container" class="relative min-w-0 flex-1 overflow-hidden">
    <NoTasksPlaceholder v-if="!hasAnyTasks" :date="placeholderDate" :milestone-name="framedMilestoneName" @create-task="emit('createTask')" />

    <div v-else ref="board" class="flex size-full overflow-x-auto overflow-y-hidden" @dragover="columns.onDragOver">
      <template v-for="(column, index) in columns.visibleColumns.value" :key="column.status">
        <TaskColumn :status="column.status">
          <VueDraggable
            :list="columns.localTasksByStatus[column.status]"
            item-key="id"
            :disabled="columns.isDragDisabled.value"
            class="flex min-h-full w-full min-w-0 flex-col overflow-x-hidden"
            v-bind="DRAGGABLE_ATTRS"
            @start="columns.onDragStart"
            @end="columns.onDragEnd"
            @change="columns.onColumnChange(column.status, $event)"
          >
            <template #item="{element: task}">
              <div class="relative mx-1.5 mb-1.5 last:mb-0" data-task-card>
                <div class="w-full shrink-0">
                  <TaskCard :task="task" />
                </div>
              </div>
            </template>
          </VueDraggable>
        </TaskColumn>

        <div
          v-if="
            index < columns.visibleColumns.value.length - 1 &&
            !columns.isColumnCollapsed(column.status) &&
            !columns.isColumnCollapsed(columns.visibleColumns.value[index + 1].status)
          "
          class="to-base-300/50 h-full w-px shrink-0 bg-linear-to-b from-transparent from-[44px] to-[98px]"
        />
      </template>
    </div>

    <div class="drag-region absolute inset-x-0 top-0 z-20 h-11" />
    <TagsDock />
    <CalendarDock />
    <ProjectDock />
    <NewTaskDock @create-task="emit('createTask')" />
  </div>
</template>
