import {computed, toValue} from "vue"

import {boardColumnForStatus, groupTasksForBoard} from "@daily/protocol"

import {useCopyToClipboard} from "@/composables/useCopyToClipboard"
import {useSettingValue} from "@/composables/useSettingValue"
import {toasts} from "@/composables/useToasts"
import {useBranchesStore} from "@/stores/branches"
import {useFilterStore} from "@/stores/filter"
import {useProjectScopeStore} from "@/stores/project-scope"
import {useTaskRelationsStore} from "@/stores/task-relations"
import {useTasksStore} from "@/stores/tasks"
import {getProjectName} from "@/utils/projects/getProjectName"

import type {BoardMode, Branch, ISODate, Milestone, Tag, Task, TaskPriority, TaskRelationSets, TaskStatus} from "@daily/protocol"
import type {MaybeRefOrGetter} from "vue"

export function useTaskModel(task: MaybeRefOrGetter<Task>) {
  const tasksStore = useTasksStore()
  const branchesStore = useBranchesStore()
  const projectScopeStore = useProjectScopeStore()
  const taskRelationsStore = useTaskRelationsStore()
  const filterStore = useFilterStore()

  const boardMode = useSettingValue<"appearance.boardMode", BoardMode>("appearance.boardMode", "normal")

  const moveScope = computed(() => {
    if (filterStore.frame === "milestone") return []
    const tasks = Object.values(tasksStore.dailyTasksByStatus).flat()
    return groupTasksForBoard(tasks, boardMode.value)[boardColumnForStatus(toValue(task).status, boardMode.value)]
  })
  const moveIndex = computed(() => moveScope.value.findIndex((item) => item.id === toValue(task).id))
  const canMoveUp = computed(() => moveIndex.value > 0)
  const canMoveDown = computed(() => moveIndex.value > -1 && moveIndex.value < moveScope.value.length - 1)
  const canMoveToTop = computed(() => canMoveUp.value)
  const canMoveToBottom = computed(() => canMoveDown.value)

  const {copyToClipboard: copyTaskId} = useCopyToClipboard({onSuccess: () => toasts.success("Task ID copied to clipboard")})
  const {copyToClipboard: copyTaskContent} = useCopyToClipboard({onSuccess: () => toasts.success("Task content copied to clipboard")})

  async function changeStatus(status: TaskStatus) {
    if (toValue(task).status === status) return

    if (!toValue(task).scheduled) {
      await tasksStore.moveTaskByOrder({
        taskId: toValue(task).id,
        targetStatus: status,
        activeDate: tasksStore.activeDay,
      })
      return
    }

    await tasksStore.updateTask(toValue(task).id, {status})
  }

  async function deleteTask() {
    const isDeleted = await tasksStore.deleteTask(toValue(task).id)
    if (!isDeleted) return false
    toasts.success("Task deleted")
    return true
  }

  async function rescheduleTask(targetDate: ISODate) {
    if (!targetDate) return
    if (targetDate === toValue(task).scheduled?.date) return

    const isMoved = await tasksStore.moveTask(toValue(task).id, targetDate)

    if (isMoved) toasts.success("Task moved successfully")
    else toasts.error("Failed to move task")
  }

  async function duplicateTask() {
    const isDuplicated = await tasksStore.duplicateTask(toValue(task).id)

    if (isDuplicated) toasts.success("Task duplicated")
    else toasts.error("Failed to duplicate task")
  }

  async function copyTaskIdToClipboard() {
    await copyTaskId(toValue(task).id)
  }

  async function copyTaskContentToClipboard() {
    await copyTaskContent(toValue(task).content)
  }

  async function updateTaskTags(tags: Tag[]) {
    const isUpdated = await tasksStore.updateTask(toValue(task).id, {tags})
    if (!isUpdated) toasts.error("Failed to update tags")
  }

  async function updateTaskMilestone(milestoneId: Milestone["id"] | null) {
    const isUpdated = await tasksStore.updateTask(toValue(task).id, {milestoneId})
    if (!isUpdated) toasts.error("Failed to update milestone")
  }

  async function updateTaskPriority(priority: TaskPriority) {
    if (priority === toValue(task).priority) return

    const isUpdated = await tasksStore.updateTask(toValue(task).id, {priority})
    if (!isUpdated) toasts.error("Failed to update priority")
  }

  async function linkTask(side: keyof TaskRelationSets, otherTaskId: Task["id"]): Promise<boolean> {
    const related = taskRelationsStore.relatedTasksByTaskId.get(toValue(task).id)
    const blockedByIds = (related?.blockedBy ?? []).map((t) => t.id)
    const blocksIds = (related?.blocks ?? []).map((t) => t.id)

    const next: TaskRelationSets = {
      blockedBy: side === "blockedBy" ? [...blockedByIds, otherTaskId] : blockedByIds.filter((id) => id !== otherTaskId),
      blocks: side === "blocks" ? [...blocksIds, otherTaskId] : blocksIds.filter((id) => id !== otherTaskId),
    }

    return taskRelationsStore.setTaskRelations(toValue(task).id, next)
  }

  async function moveTaskToBranch(branchId: Branch["id"]) {
    if (toValue(task).branchId === branchId) return true

    const isMoved = await tasksStore.moveTaskToBranch(toValue(task).id, branchId)
    if (!isMoved) {
      toasts.error("Failed to move task")
      return false
    }

    toasts.success(`Task moved to "${getProjectName(branchesStore.branchesMap.get(branchId))}"`)
    return true
  }

  async function moveUp() {
    if (!canMoveUp.value) return

    const previousTask = moveScope.value[moveIndex.value - 1]
    if (!previousTask) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: toValue(task).id,
      targetTaskId: previousTask.id,
      boardMode: boardMode.value,
      position: "before",
      activeDate: tasksStore.activeDay,
      acrossProjects: projectScopeStore.isAllProjectsMode,
    })

    if (!result) toasts.error("Failed to move task")
  }

  async function moveDown() {
    if (!canMoveDown.value) return

    const nextTask = moveScope.value[moveIndex.value + 1]
    if (!nextTask) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: toValue(task).id,
      targetTaskId: nextTask.id,
      boardMode: boardMode.value,
      position: "after",
      activeDate: tasksStore.activeDay,
      acrossProjects: projectScopeStore.isAllProjectsMode,
    })

    if (!result) toasts.error("Failed to move task")
  }

  async function moveToTop() {
    if (!canMoveToTop.value) return

    const firstTask = moveScope.value[0]
    if (!firstTask) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: toValue(task).id,
      targetTaskId: firstTask.id,
      boardMode: boardMode.value,
      position: "before",
      activeDate: tasksStore.activeDay,
      acrossProjects: projectScopeStore.isAllProjectsMode,
    })

    if (!result) toasts.error("Failed to move task")
  }

  async function moveToBottom() {
    if (!canMoveToBottom.value) return

    const result = await tasksStore.moveTaskByOrder({
      taskId: toValue(task).id,
      targetTaskId: null,
      boardMode: boardMode.value,
      position: "after",
      activeDate: tasksStore.activeDay,
      acrossProjects: projectScopeStore.isAllProjectsMode,
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
    updateTaskPriority,
    moveTaskToBranch,
    linkTask,
  }
}
