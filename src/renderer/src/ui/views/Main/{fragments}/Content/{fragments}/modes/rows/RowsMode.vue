<script setup lang="ts">
import {computed, ref, watch} from "vue"
import VueDraggable from "vuedraggable"

import {useTasksStore} from "@/stores/tasks.store"
import BaseIcon from "@/ui/base/BaseIcon"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import TaskCard from "@/ui/modules/TaskCard"

import {BOARD_COLUMNS, DRAGGABLE_ATTRS} from "../../../model/constants"
import {useBoardModel} from "../../../model/useBoardModel"
import MasonryItem from "./MasonryItem.vue"
import StatusDropZones from "./StatusDropZones.vue"
import StatusSwitcher from "./StatusSwitcher.vue"

import type {Task, TaskStatus} from "@shared/types/storage"
import type {DraggableChangeEvent} from "./viewStatuses"

const props = defineProps<{tasks: Task[]; dndDisabled: boolean}>()

const tasksStore = useTasksStore()

const currentView = ref<TaskStatus>("active")

const {
  isDragging,
  isDragDisabled,
  localTasksByStatus,
  tasksByStatus,
  tagsByStatus,
  onDragStart,
  onDragEnd,
  onDragOver,
  onColumnChange,
  onSelectTag,
  getSelectedTagIdsSet,
  getTaskTags,
} = useBoardModel({tasks: () => props.tasks, dndDisabled: () => props.dndDisabled})

const counts = computed<Record<TaskStatus, number>>(() => ({
  active: tasksByStatus.value.active.length,
  done: tasksByStatus.value.done.length,
  discarded: tasksByStatus.value.discarded.length,
}))

const currentColumn = computed(() => BOARD_COLUMNS.find((column) => column.status === currentView.value)!)

function onZoneChange(status: TaskStatus, event: DraggableChangeEvent) {
  void onColumnChange(status, event)
}

watch(
  () => tasksStore.activeDay,
  () => (currentView.value = "active"),
)
</script>

<template>
  <div class="relative h-full w-full" @dragover="onDragOver">
    <div class="h-full w-full overflow-x-hidden overflow-y-auto p-1.5">
      <div class="bg-base-100 border-base-300 flex min-h-full w-full flex-col rounded-xl border">
        <div class="border-base-300 flex items-center gap-3 border-b px-3 py-1.5">
          <StatusSwitcher v-model="currentView" :counts="counts" />

          <div class="min-w-0 flex-1">
            <DynamicTagsPanel
              :tags="tagsByStatus[currentView]"
              :selected-tags="getSelectedTagIdsSet(currentView)"
              selectable
              @select="onSelectTag(currentView, $event)"
            />
          </div>
        </div>

        <div class="relative flex-1 p-1.5" :data-column-status="currentView">
          <VueDraggable
            :key="currentView"
            :list="localTasksByStatus[currentView]"
            item-key="id"
            :disabled="isDragDisabled"
            class="grid gap-1.5"
            style="grid-template-columns: repeat(auto-fill, minmax(294px, 1fr)); grid-auto-rows: 4px"
            v-bind="DRAGGABLE_ATTRS"
            @start="onDragStart"
            @end="onDragEnd"
            @change="onColumnChange(currentView, $event)"
          >
            <template #item="{element: task}">
              <MasonryItem>
                <TaskCard :task="task" :tags="getTaskTags(task)" view="rows" />
              </MasonryItem>
            </template>
          </VueDraggable>

          <div
            v-if="!localTasksByStatus[currentView].length && !isDragging"
            class="text-base-content/70 pointer-events-none absolute inset-1.5 flex flex-col items-center justify-center gap-2 rounded-lg text-center"
          >
            <div class="bg-base-200 rounded-full p-3">
              <BaseIcon name="empty" class="size-5" />
            </div>
            <span class="text-sm">No {{ currentColumn.emptyLabel }} tasks</span>
          </div>
        </div>
      </div>
    </div>

    <StatusDropZones
      class="absolute inset-x-3 bottom-3 z-10"
      :visible="isDragging"
      :current-view="currentView"
      :lists="localTasksByStatus"
      @change="onZoneChange"
    />
  </div>
</template>
