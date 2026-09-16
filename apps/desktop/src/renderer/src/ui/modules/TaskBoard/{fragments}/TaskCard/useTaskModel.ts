import {computed} from "vue"
import {toasts} from "vue-toasts-lite"

import {useCopyToClipboard} from "@/composables/useCopyToClipboard"
import {useBranchesStore} from "@/stores/branches.store"
import {useTaskRelationsStore} from "@/stores/taskRelations.store"
import {useTasksStore} from "@/stores/tasks"

import type {Branch, ISODate, Milestone, Tag, Task, TaskRelationSets, TaskStatus} from "@daily/protocol"
import type {Ref} from "vue"

export function useTaskModel(task: Readonly<Ref<Task>>) {
  const tasksStore = useTasksStore()
  const branchesStore = useBranchesStore()
  const taskRelationsStore = useTaskRelationsStore()

  const taskStatus = computed(() => task.value.status)
  const moveScope = computed(() => tasksStore.dailyTasksByStatus[taskStatus.value] ?? [])
  const moveIndex = computed(() => tasksStore.dailyTaskIndexMapByStatus[taskStatus.value]?.get(task.value.id) ?? -1)
  const canMoveUp = computed(() => moveIndex.value > 0)
  const canMoveDown = computed(() => moveIndex.value > -1 && moveIndex.value < moveScope.value.length - 1)
  const canMoveToTop = computed(() => canMoveUp.value)
  const canMoveToBottom = computed(() => canMoveDown.value)

  const {copyToClipboard: copyTaskId} = useCopyToClipboard({onSuccess: () => toasts.success("Task ID copied to clipboard")})
  const {copyToClipboard: copyTaskContent} = useCopyToClipboard({onSuccess: () => toasts.success("Task content copied to clipboard")})

  async function changeStatus(status: TaskStatus) {
    if (task.value.status === status) return

    if (task.value.status === "backlog") {
      tasksStore.moveTaskByOrder({
        taskId: task.value.id,
        targetStatus: status,
        activeDate: tasksStore.activeDay,
      })
      return
    }

    await tasksStore.updateTask(task.value.id, {status})
  }

  async function deleteTask() {
    const isDeleted = await tasksStore.deleteTask(task.value.id)
    if (!isDeleted) return false
    toasts.success("Task deleted")
    return true
  }

  async function rescheduleTask(targetDate: ISODate) {
    if (!targetDate) return
    if (targetDate === task.value.scheduled?.date) return

    const isMoved = await tasksStore.moveTask(task.value.id, targetDate)

    if (isMoved) toasts.success("Task moved successfully")
    else toasts.error("Failed to move task")
  }

  async function duplicateTask() {
    const isDuplicated = await tasksStore.duplicateTask(task.value.id)

    if (isDuplicated) toasts.success("Task duplicated")
    else toasts.error("Failed to duplicate task")
  }

  async function copyTaskIdToClipboard() {
    await copyTaskId(task.value.id)
  }

  async function copyTaskContentToClipboard() {
    await copyTaskContent(task.value.content)
  }

  async function updateTaskTags(tags: Tag[]) {
    const isUpdated = await tasksStore.updateTask(task.value.id, {tags})
    if (!isUpdated) toasts.error("Failed to update tags")
  }

  async function updateTaskMilestone(milestoneId: Milestone["id"] | null) {
    const isUpdated = await tasksStore.updateTask(task.value.id, {milestoneId})
    if (!isUpdated) toasts.error("Failed to update milestone")
  }

  async function linkTask(side: keyof TaskRelationSets, otherTaskId: Task["id"]): Promise<boolean> {
    const related = taskRelationsStore.relatedTasksByTaskId.get(task.value.id)
    const blockedByIds = (related?.blockedBy ?? []).map((t) => t.id)
    const blocksIds = (related?.blocks ?? []).map((t) => t.id)

    const next: TaskRelationSets = {
      blockedBy: side === "blockedBy" ? [...blockedByIds, otherTaskId] : blockedByIds.filter((id) => id !== otherTaskId),
      blocks: side === "blocks" ? [...blocksIds, otherTaskId] : blocksIds.filter((id) => id !== otherTaskId),
    }

    return taskRelationsStore.setTaskRelations(task.value.id, next)
  }

  async function moveTaskToBranch(branchId: Branch["id"]) {
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
    if (!canMoveUp.value) return

    const previousTask = moveScope.value[moveIndex.value - 1]
    if (!previousTask) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: task.value.id,
      targetTaskId: previousTask.id,
      targetStatus: task.value.status,
      position: "before",
      activeDate: tasksStore.activeDay,
    })

    if (!result) toasts.error("Failed to move task")
  }

  async function moveDown() {
    if (!canMoveDown.value) return

    const nextTask = moveScope.value[moveIndex.value + 1]
    if (!nextTask) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: task.value.id,
      targetTaskId: nextTask.id,
      targetStatus: task.value.status,
      position: "after",
      activeDate: tasksStore.activeDay,
    })

    if (!result) toasts.error("Failed to move task")
  }

  async function moveToTop() {
    if (!canMoveToTop.value) return

    const firstTask = moveScope.value[0]
    if (!firstTask) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: task.value.id,
      targetTaskId: firstTask.id,
      targetStatus: task.value.status,
      position: "before",
      activeDate: tasksStore.activeDay,
    })

    if (!result) toasts.error("Failed to move task")
  }

  async function moveToBottom() {
    if (!canMoveToBottom.value) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: task.value.id,
      targetTaskId: null,
      targetStatus: task.value.status,
      position: "after",
      activeDate: tasksStore.activeDay,
    })

    if (!result) toasts.error("Failed to move task")
  }

  return {
    changeStatus,
    canMoveUp,
    canMoveDown,
    canMoveToTop,
    canMoveToBottom,
    moveUp,
    moveDown,
    moveToTop,
    moveToBottom,
    deleteTask,
    rescheduleTask,
    duplicateTask,
    copyTaskIdToClipboard,
    copyTaskContentToClipboard,
    updateTaskTags,
    updateTaskMilestone,
    moveTaskToBranch,
    linkTask,
  }
}
