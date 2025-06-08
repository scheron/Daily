<script setup lang="ts">
import {toast} from "vue-sonner"
import {computed} from "vue"
import {useTasksStore} from "@/stores/tasks.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useFilterStore} from "@/stores/filter.store"

import PanelDeleteConfirm from "./fragments/panels/PanelDeleteConfirm.vue"
import PanelEdit from "./fragments/panels/PanelEdit.vue"
import PanelFilters from "./fragments/panels/PanelFilters.vue"
import {useRestoreTaskToast} from "./modal/useRestoreTaskToast"

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()
const filterStore = useFilterStore()

const toastRestoreTask = useRestoreTaskToast(async (task) => await tasksStore.restoreTask(task.id))

const activeState = computed(() => {
  if (taskEditorStore.isTaskEditorOpen) return "edit"
  if (taskEditorStore.isTaskDeleteConfirmOpen) return "delete"
  return "filter"
})

async function onCreate(content: string) {
  const isSuccess = await tasksStore.createTask(content)

  if (!isSuccess) return toast.error("Failed to create task")
  else toast.success("Task created successfully")

  onClose()
}

async function onEdit(content: string) {
  if (taskEditorStore.currentEditingTask) {
    const isSuccess = await tasksStore.updateTask(taskEditorStore.currentEditingTask.id, {content})

    if (!isSuccess) return toast.error("Failed to update task")
    else toast.success("Task updated successfully")
  }

  onClose()
}

async function onDelete() {
  if (taskEditorStore.currentEditingTask) {
    await tasksStore.deleteTask(taskEditorStore.currentEditingTask.id)
    toastRestoreTask(taskEditorStore.currentEditingTask)
  }

  onClose()
}

function onClose() {
  taskEditorStore.setCurrentEditingTask(null)
  taskEditorStore.setIsTaskDeleteConfirmOpen(false)
  taskEditorStore.setIsTaskEditorOpen(false)
}
</script>

<template>
  <PanelEdit
    v-if="activeState === 'edit'"
    :new-task="taskEditorStore.currentEditingTask === null"
    :model-value="taskEditorStore.editorContent"
    @update:model-value="taskEditorStore.setEditorContent"
    @create="onCreate"
    @update="onEdit"
    @cancel="onClose"
  />

  <PanelDeleteConfirm v-else-if="activeState === 'delete'" @delete="onDelete" @cancel="onClose" />

  <PanelFilters
    v-else
    :date="tasksStore.activeDay"
    :active="filterStore.activeFilter"
    :tasks="tasksStore.dailyTasks"
    @update:active="filterStore.setActiveFilter"
  />
</template>
