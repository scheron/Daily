import {computed, toValue} from "vue"
import {toasts} from "vue-toasts-lite"
import {useClipboard} from "@vueuse/core"

import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {buildTaskDetails} from "@/utils/tasks/buildTaskDetails"

import type {ISODate} from "@shared/types/common"
import type {Tag, Task, TaskStatus} from "@shared/types/storage"
import type {MaybeRefOrGetter} from "vue"

export function useTaskModel(rawTask: MaybeRefOrGetter<Task>, rawTags: MaybeRefOrGetter<Tag[]> = []) {
  const tasksStore = useTasksStore()
  const taskEditorStore = useTaskEditorStore()

  const {copy} = useClipboard({legacy: true})

  const task = computed(() => toValue(rawTask))
  const tags = computed(() => toValue(rawTags))

  function startEdit() {
    taskEditorStore.setCurrentEditingTask(task.value ?? null)
    taskEditorStore.setEditorTags(task.value?.tags ?? [])
    taskEditorStore.setIsTaskEditorOpen(true)
  }

  function changeStatus(status: TaskStatus) {
    if (task.value?.status === status || !task.value) return
    tasksStore.updateTask(task.value!.id, {status})
    toasts.success(`Task status updated to ${status}`, {id: "task-status"})
  }

  async function deleteTask() {
    if (!task.value) return
    await tasksStore.deleteTask(task.value.id)
    toasts.success("Task deleted")
  }

  async function rescheduleTask(targetDate: ISODate) {
    if (!task.value || !targetDate) return
    if (targetDate === task.value.scheduled.date) return

    const isMoved = await tasksStore.moveTask(task.value.id, targetDate)

    if (isMoved) toasts.success("Task moved successfully")
    else toasts.error("Failed to move task")
  }

  async function copyToClipboardTask() {
    if (!task.value) return

    try {
      const text = buildTaskDetails(task.value, tags.value)
      await copy(text)
      toasts.success("Task copied to clipboard")
    } catch {
      toasts.error("Failed to copy task")
    }
  }

  async function updateTaskTags(tags: Tag[]) {
    const isUpdated = await tasksStore.updateTask(task.value.id, {tags})
    if (!isUpdated) toasts.error("Failed to update tags")
  }

  return {
    startEdit,
    changeStatus,
    deleteTask,
    rescheduleTask,
    copyToClipboardTask,
    updateTaskTags,
  }
}
