import {computed, toValue} from "vue"
import {toasts} from "vue-toasts-lite"
import {useClipboard} from "@vueuse/core"

import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {buildTaskDetails} from "@/utils/tasks/buildTaskDetails"

import type {ISODate} from "@shared/types/common"
import type {LayoutType, Tag, Task, TaskStatus} from "@shared/types/storage"
import type {MaybeRefOrGetter} from "vue"

type TaskModelProps = {task: Task; tags?: Tag[]; view?: LayoutType}

export function useTaskModel(rawProps: MaybeRefOrGetter<TaskModelProps>) {
  const tasksStore = useTasksStore()
  const taskEditorStore = useTaskEditorStore()

  const {copy} = useClipboard({legacy: true})

  const task = computed(() => toValue(rawProps).task)
  const tags = computed(() => toValue(rawProps).tags ?? [])
  const view = computed(() => toValue(rawProps).view ?? "list")
  const moveScope = computed(() => {
    if (!task.value) return []

    if (view.value === "columns") {
      return tasksStore.dailyTasks.filter((item) => item.status === task.value.status)
    }

    return tasksStore.dailyTasks
  })
  const moveIndex = computed(() => moveScope.value.findIndex((item) => item.id === task.value?.id))
  const canMoveUp = computed(() => moveIndex.value > 0)
  const canMoveDown = computed(() => moveIndex.value > -1 && moveIndex.value < moveScope.value.length - 1)
  const canMoveToTop = computed(() => canMoveUp.value)
  const canMoveToBottom = computed(() => canMoveDown.value)

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

  async function toggleMinimized() {
    if (!task.value) return

    const nextState = !task.value.minimized
    await tasksStore.toggleTaskMinimized(task.value.id, nextState)
  }

  async function deleteTask() {
    if (!task.value) return false
    const isDeleted = await tasksStore.deleteTask(task.value.id)
    if (!isDeleted) return false
    toasts.success("Task deleted")
    return true
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

  async function moveUp() {
    if (!task.value || !canMoveUp.value) return

    const previousTask = moveScope.value[moveIndex.value - 1]
    if (!previousTask) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: task.value.id,
      mode: view.value === "columns" ? "column" : "list",
      targetTaskId: previousTask.id,
      targetStatus: view.value === "columns" ? task.value.status : undefined,
      position: "before",
    })

    if (!result) toasts.error("Failed to move task")
  }

  async function moveDown() {
    if (!task.value || !canMoveDown.value) return

    const nextTask = moveScope.value[moveIndex.value + 1]
    if (!nextTask) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: task.value.id,
      mode: view.value === "columns" ? "column" : "list",
      targetTaskId: nextTask.id,
      targetStatus: view.value === "columns" ? task.value.status : undefined,
      position: "after",
    })

    if (!result) toasts.error("Failed to move task")
  }

  async function moveToTop() {
    if (!task.value || !canMoveToTop.value) return

    const firstTask = moveScope.value[0]
    if (!firstTask) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: task.value.id,
      mode: view.value === "columns" ? "column" : "list",
      targetTaskId: firstTask.id,
      targetStatus: view.value === "columns" ? task.value.status : undefined,
      position: "before",
    })

    if (!result) toasts.error("Failed to move task")
  }

  async function moveToBottom() {
    if (!task.value || !canMoveToBottom.value) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: task.value.id,
      mode: view.value === "columns" ? "column" : "list",
      targetTaskId: null,
      targetStatus: view.value === "columns" ? task.value.status : undefined,
      position: "after",
    })

    if (!result) toasts.error("Failed to move task")
  }

  return {
    startEdit,
    changeStatus,
    canMoveUp,
    canMoveDown,
    canMoveToTop,
    canMoveToBottom,
    moveUp,
    moveDown,
    moveToTop,
    moveToBottom,
    toggleMinimized,
    deleteTask,
    rescheduleTask,
    copyToClipboardTask,
    updateTaskTags,
  }
}
