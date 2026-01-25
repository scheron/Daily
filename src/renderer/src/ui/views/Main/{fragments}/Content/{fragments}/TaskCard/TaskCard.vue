<script setup lang="ts">
import {computed} from "vue"
import {toasts} from "vue-toasts-lite"

import {ISODate} from "@shared/types/common"
import {useTasksStore} from "@/stores/tasks.store"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"

import {useTaskEditorStore} from "@MainView/stores/taskEditor.store"
import QuickActions from "./{fragments}/QuickActions.vue"
import StatusButtons from "./{fragments}/StatusButtons.vue"
import TaskContent from "./{fragments}/TaskContent.vue"
import TimeTrackingButton from "./{fragments}/TimeTrackingButton.vue"
import {TaskEditorCard} from "../TaskEditorCard"

import type {Tag, Task, TaskStatus} from "@shared/types/storage"

const props = withDefaults(defineProps<{task: Task; tags?: Tag[]}>(), {tags: () => []})

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()

const isEditing = computed(() => {
  if (!taskEditorStore.isTaskEditorOpen) return false

  if (props.task.id === "new-task" && !taskEditorStore.currentEditingTask) {
    return true
  }

  return taskEditorStore.currentEditingTask?.id === props.task.id
})

function onChangeStatus(status: TaskStatus) {
  if (props.task.status === status) return
  tasksStore.updateTask(props.task.id, {status})
}

function onEdit() {
  taskEditorStore.setCurrentEditingTask(props.task ?? null)
  taskEditorStore.setEditorTags(props.task?.tags ?? [])
  taskEditorStore.setIsTaskEditorOpen(true)
}

async function onDelete() {
  if (!props.task) return
  await tasksStore.deleteTask(props.task.id)
  toasts.success("Task deleted")
}

async function onMoveDate(targetDate: ISODate) {
  if (!props.task || !targetDate) return
  if (targetDate === props.task.scheduled.date) return

  const isMoved = await tasksStore.moveTask(props.task.id, targetDate)

  if (isMoved) toasts.success("Task moved successfully")
  else toasts.error("Failed to move task")
}
</script>

<template>
  <TaskEditorCard v-if="isEditing" />

  <div
    v-else
    :id="task.id"
    class="group min-h-card bg-base-100 hover:shadow-accent/5 relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg"
    :class="{
      'border-success/30 hover:border-success/40': task.status === 'done',
      'border-warning/30 hover:border-warning/40': task.status === 'discarded',
      'border-base-300 hover:border-base-content/20': task.status === 'active',
    }"
  >
    <div
      class="absolute top-0 left-0 z-30 h-0 w-1 rounded-l-sm opacity-0 transition-all duration-500"
      aria-label="Task status indicator"
      :class="{
        'bg-warning/30 h-full opacity-100': task.status === 'discarded',
        'bg-success/30 h-full opacity-100': task.status === 'done',
      }"
    />

    <div class="relative z-10 w-full px-5 pt-3 pb-1">
      <div class="mb-3 flex w-full items-center justify-between gap-3">
        <DynamicTagsPanel :tags="tags" empty-message="No tags" />
        <div class="flex shrink-0 items-center gap-2">
          <QuickActions @move-date="onMoveDate" @edit="onEdit" @delete="onDelete" />
          <TimeTrackingButton :task="task" />
          <StatusButtons :status="task.status" @update:status="onChangeStatus" />
        </div>
      </div>

      <div class="mb-5 transition-opacity duration-200" :class="{'opacity-50': ['done', 'discarded'].includes(task.status)}">
        <TaskContent :content="task.content" />
      </div>
    </div>
  </div>
</template>
