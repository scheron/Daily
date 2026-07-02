import {computed, toValue} from "vue"
import {toasts} from "vue-toasts-lite"

import {useBranchesStore} from "@/stores/branches.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"
import {useCopyToClipboard} from "@/composables/useCopyToClipboard"

import type {ISODate} from "@shared/types/common"
import type {Branch, Tag, Task, TaskStatus} from "@shared/types/storage"
import type {MaybeRefOrGetter} from "vue"

type TaskModelProps = {task: Task}

export function useTaskModel(rawProps: MaybeRefOrGetter<TaskModelProps>) {
  const tasksStore = useTasksStore()
  const taskEditorStore = useTaskEditorStore()
  const branchesStore = useBranchesStore()

  const {copyToClipboard: copyTaskId} = useCopyToClipboard({onSuccess: () => toasts.success("Task ID copied to clipboard")})
  const {copyToClipboard: copyTaskContent} = useCopyToClipboard({onSuccess: () => toasts.success("Task content copied to clipboard")})

  const task = computed(() => toValue(rawProps).task)
  const taskStatus = computed(() => task.value?.status ?? "active")
  const moveScope = computed(() => {
    if (!task.value) return []
    return tasksStore.dailyTasksByStatus[taskStatus.value] ?? []
  })
  const moveIndex = computed(() => {
    if (!task.value) return -1
    return tasksStore.dailyTaskIndexMapByStatus[taskStatus.value]?.get(task.value.id) ?? -1
  })
  const canMoveUp = computed(() => moveIndex.value > 0)
  const canMoveDown = computed(() => moveIndex.value > -1 && moveIndex.value < moveScope.value.length - 1)
  const canMoveToTop = computed(() => canMoveUp.value)
  const canMoveToBottom = computed(() => canMoveDown.value)

  function startEdit() {
    if (!task.value) return
    taskEditorStore.open(task.value.id)
  }

  function changeStatus(status: TaskStatus) {
    if (task.value?.status === status || !task.value) return
    tasksStore.updateTask(task.value!.id, {status})
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

  async function duplicateTask() {
    if (!task.value) return

    const isDuplicated = await tasksStore.duplicateTask(task.value.id)

    if (isDuplicated) toasts.success("Task duplicated")
    else toasts.error("Failed to duplicate task")
  }

  async function copyTaskIdToClipboard() {
    if (!task.value) return
    await copyTaskId(task.value.id)
  }

  async function copyTaskContentToClipboard() {
    if (!task.value) return
    await copyTaskContent(task.value.content)
  }

  async function updateTaskTags(tags: Tag[]) {
    const isUpdated = await tasksStore.updateTask(task.value.id, {tags})
    if (!isUpdated) toasts.error("Failed to update tags")
  }

  async function moveTaskToBranch(branchId: Branch["id"]) {
    if (!task.value) return false
    if (task.value.branchId === branchId) return true

    const isMoved = await tasksStore.moveTaskToBranch(task.value.id, branchId)
    if (!isMoved) {
      toasts.error("Failed to move task")
      return false
    }

    const branch = branchesStore.branchesMap.get(branchId)
    toasts.success(`Task moved to "${branch?.name}"`)
    return true
  }

  async function moveUp() {
    if (!task.value || !canMoveUp.value) return

    const previousTask = moveScope.value[moveIndex.value - 1]
    if (!previousTask) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: task.value.id,
      targetTaskId: previousTask.id,
      targetStatus: task.value.status,
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
      targetTaskId: nextTask.id,
      targetStatus: task.value.status,
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
      targetTaskId: firstTask.id,
      targetStatus: task.value.status,
      position: "before",
    })

    if (!result) toasts.error("Failed to move task")
  }

  async function moveToBottom() {
    if (!task.value || !canMoveToBottom.value) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: task.value.id,
      targetTaskId: null,
      targetStatus: task.value.status,
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
    duplicateTask,
    copyTaskIdToClipboard,
    copyTaskContentToClipboard,
    updateTaskTags,
    moveTaskToBranch,
  }
}
