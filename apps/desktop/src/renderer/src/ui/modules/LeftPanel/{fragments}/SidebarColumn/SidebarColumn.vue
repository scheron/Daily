<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue"
import {toasts} from "vue-toasts-lite"
import VueDraggable from "vuedraggable"

import {useTaskColumns} from "@/composables/tasks/useTaskColumns"
import {DRAGGABLE_ATTRS} from "@/constants/ui"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import ViewPicker from "@/ui/common/pickers/ViewPicker.vue"
import TaskCard from "@/ui/modules/TaskBoard/{fragments}/TaskCard"
import TaskColumn from "@/ui/modules/TaskBoard/{fragments}/TaskColumn.vue"
import {ConfirmPopup} from "@/ui/overlays/ConfirmPopup"
import {resolveMoveTarget} from "@/utils/tasks/resolveMoveTarget"

import type {IconName} from "@/ui/base/BaseIcon"
import type {Task} from "@daily/protocol"

type ColumnView = "backlog" | "trash"

const VIEW_OPTIONS: {value: ColumnView; label: string; icon: IconName}[] = [
  {value: "backlog", label: "Backlog", icon: "inbox"},
  {value: "trash", label: "Trash", icon: "trash"},
]

const tasksStore = useTasksStore()
const dragDropStore = useDragDropStore()
const columns = useTaskColumns()

const view = ref<ColumnView>("backlog")

const isTrashView = computed(() => view.value === "trash")
const columnCount = computed(() => (isTrashView.value ? tasksStore.trashTasks.length : undefined))
const columnEmptyLabel = computed(() => (isTrashView.value ? "trash" : undefined))

onMounted(() => {
  tasksStore.getBacklogList()
})

watch(view, (next) => {
  if (next === "trash") tasksStore.getTrashList()
})

async function onTrashChange(event: {added?: {element: Task; newIndex: number}; moved?: {newIndex: number; oldIndex: number}}) {
  if (!event.added && !event.moved) return

  if (dragDropStore.dayDropHandled) {
    await tasksStore.getTrashList()
    return
  }

  const newIndex = event.added?.newIndex ?? event.moved!.newIndex
  const {targetTaskId, position} = resolveMoveTarget(tasksStore.trashTasks, newIndex)

  if (event.added) {
    const isDeleted = await tasksStore.deleteTask(event.added.element.id)
    if (isDeleted) await tasksStore.moveTaskInTrash(event.added.element.id, targetTaskId, position)
    return
  }

  const movedTask = tasksStore.trashTasks[newIndex]
  if (movedTask) await tasksStore.moveTaskInTrash(movedTask.id, targetTaskId, position)
}

async function onEmptyTrash() {
  const count = await tasksStore.emptyTrash()
  if (count > 0) toasts.success(`Permanently deleted ${count} task${count === 1 ? "" : "s"}`)
}
</script>

<template>
  <TaskColumn status="backlog" variant="sidebar" :count="columnCount" :empty-label="columnEmptyLabel" :show-count="!isTrashView">
    <template #heading>
      <ViewPicker v-model="view" :options="VIEW_OPTIONS" />
    </template>

    <template v-if="isTrashView" #actions>
      <ConfirmPopup
        title="Empty trash?"
        message="Every deleted task in this project will be removed permanently."
        confirm-text="Empty"
        position="end"
        content-class="max-w-72"
        @confirm="onEmptyTrash"
      >
        <template #trigger="{show}">
          <BaseButton icon="trash" variant="ghost" size="sm" icon-class="size-3.5" class="text-error hover:bg-error/10" @click="show">
            Empty
          </BaseButton>
        </template>
      </ConfirmPopup>
    </template>

    <VueDraggable
      v-if="!isTrashView"
      :list="columns.localTasksByStatus.backlog"
      item-key="id"
      :disabled="columns.isDragDisabled.value"
      class="flex min-h-full w-full min-w-0 flex-col overflow-x-hidden"
      v-bind="DRAGGABLE_ATTRS"
      @start="columns.onDragStart"
      @end="columns.onDragEnd"
      @change="columns.onColumnChange('backlog', $event)"
    >
      <template #item="{element: task}">
        <div class="relative mx-1.5 mb-1.5 last:mb-0" data-task-card :data-task-id="task.id">
          <div class="w-full shrink-0">
            <TaskCard :task="task" />
          </div>
        </div>
      </template>
    </VueDraggable>

    <VueDraggable
      v-else
      :list="tasksStore.trashTasks"
      item-key="id"
      :disabled="columns.isDragDisabled.value"
      class="flex min-h-full w-full min-w-0 flex-col overflow-x-hidden"
      v-bind="DRAGGABLE_ATTRS"
      @start="columns.onDragStart"
      @end="columns.onDragEnd"
      @change="onTrashChange"
    >
      <template #item="{element: task}">
        <div class="relative mx-1.5 mb-1.5 last:mb-0" data-task-card :data-task-id="task.id">
          <div class="w-full shrink-0">
            <TaskCard :task="task" trashed />
          </div>
        </div>
      </template>
    </VueDraggable>
  </TaskColumn>
</template>
