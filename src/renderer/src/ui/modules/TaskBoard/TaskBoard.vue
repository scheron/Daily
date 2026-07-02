<script setup lang="ts">
import {computed, ref, watch} from "vue"
import VueDraggable from "vuedraggable"

import {useTasksStore} from "@/stores/tasks"
import {DRAGGABLE_ATTRS} from "@/constants/ui"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"
import TaskCard from "@/ui/modules/TaskBoard/{fragments}/TaskCard"

import {useTaskColumns} from "../../../composables/tasks/useTaskColumns"
import {useDragScroll} from "./composables/useDragScroll"
import NoTasksPlaceholder from "./{fragments}/NoTasksPlaceholder.vue"
import TaskColumn from "./{fragments}/TaskColumn.vue"

const emit = defineEmits<{createTask: []}>()

const containerRef = ref<HTMLElement | null>(null)
const boardRef = ref<HTMLElement | null>(null)

const tasksStore = useTasksStore()
const columns = useTaskColumns()

const hasAnyTasks = computed(
  () => columns.tasksByStatus.value.active.length + columns.tasksByStatus.value.done.length + columns.tasksByStatus.value.discarded.length > 0,
)

useDragScroll(boardRef)

watch(
  () => tasksStore.activeDay,
  () => containerRef.value?.scrollTo({top: 0, behavior: "instant"}),
)
</script>

<template>
  <div ref="containerRef" class="min-w-0 flex-1 overflow-hidden">
    <BaseSpinner v-if="!tasksStore.isDaysLoaded" />
    <NoTasksPlaceholder v-else-if="!hasAnyTasks" :date="tasksStore.activeDay" filter="all" @create-task="emit('createTask')" />

    <div v-else ref="boardRef" class="flex size-full overflow-x-auto overflow-y-hidden" @dragover="columns.onDragOver">
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

        <div v-if="index < columns.visibleColumns.value.length - 1" class="bg-base-300/50 h-full w-px shrink-0 last:hidden" />
      </template>
    </div>
  </div>
</template>
