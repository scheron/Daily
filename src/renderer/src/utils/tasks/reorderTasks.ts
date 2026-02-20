import {ORDER_INDEX_STEP, sortTasksByOrderIndex} from "@shared/utils/tasks/orderIndex"

import type {Task, TaskStatus} from "@shared/types/storage"

export type TaskDropMode = "list" | "column"
export type TaskDropPosition = "before" | "after"

export type TaskMoveMeta = {
  taskId: Task["id"]
  mode: TaskDropMode
  fromStatus: TaskStatus
  toStatus: TaskStatus
  targetTaskId: Task["id"] | null
  position: TaskDropPosition
}

export type TaskReorderPatch = {
  id: Task["id"]
  orderIndex: number
  status?: TaskStatus
}

type BuildTaskMovePatchesParams = {
  tasks: Task[]
  taskId: Task["id"]
  mode: TaskDropMode
  targetTaskId?: Task["id"] | null
  targetStatus?: TaskStatus
  position?: TaskDropPosition
}

export type BuildTaskMovePatchesResult = {
  patches: TaskReorderPatch[]
  meta: TaskMoveMeta
}

export function buildTaskMovePatches(params: BuildTaskMovePatchesParams): BuildTaskMovePatchesResult | null {
  const {tasks, taskId, mode} = params
  const position = params.position ?? "before"
  const targetTaskId = params.targetTaskId ?? null

  const sourceTask = tasks.find((task) => task.id === taskId)
  if (!sourceTask) return null

  const fromStatus = sourceTask.status
  const toStatus = params.targetStatus ?? fromStatus
  if (targetTaskId === taskId && toStatus === fromStatus) {
    return {
      patches: [],
      meta: {
        taskId,
        mode,
        fromStatus,
        toStatus,
        targetTaskId,
        position,
      },
    }
  }

  const movedTask: Task = {...sourceTask, status: toStatus}

  const patches = mode === "list" ? buildListModePatches(tasks, movedTask, targetTaskId, position) : buildColumnModePatches(tasks, movedTask, targetTaskId, position)

  return {
    patches,
    meta: {
      taskId,
      mode,
      fromStatus,
      toStatus,
      targetTaskId,
      position,
    },
  }
}

function buildListModePatches(tasks: Task[], movedTask: Task, targetTaskId: Task["id"] | null, position: TaskDropPosition): TaskReorderPatch[] {
  const originalById = new Map(tasks.map((task) => [task.id, task]))
  const nextTasks = sortTasksByOrderIndex(tasks.filter((task) => task.id !== movedTask.id))
  const insertAt = resolveInsertIndex(nextTasks, targetTaskId, position)

  nextTasks.splice(insertAt, 0, movedTask)

  const nextOrderMap = createOrderMapFromSequence(nextTasks)

  return nextTasks
    .map((task) => {
      const previous = originalById.get(task.id)
      const nextOrderIndex = nextOrderMap.get(task.id)
      if (!previous || nextOrderIndex === undefined) return null

      const isStatusChanged = previous.status !== task.status
      const isOrderChanged = previous.orderIndex !== nextOrderIndex
      if (!isStatusChanged && !isOrderChanged) return null

      return {
        id: task.id,
        orderIndex: nextOrderIndex,
        status: isStatusChanged ? task.status : undefined,
      }
    })
    .filter(Boolean) as TaskReorderPatch[]
}

function buildColumnModePatches(tasks: Task[], movedTask: Task, targetTaskId: Task["id"] | null, position: TaskDropPosition): TaskReorderPatch[] {
  const originalById = new Map(tasks.map((task) => [task.id, task]))
  const groups = {
    active: sortTasksByOrderIndex(tasks.filter((task) => task.status === "active" && task.id !== movedTask.id)),
    discarded: sortTasksByOrderIndex(tasks.filter((task) => task.status === "discarded" && task.id !== movedTask.id)),
    done: sortTasksByOrderIndex(tasks.filter((task) => task.status === "done" && task.id !== movedTask.id)),
  } as Record<TaskStatus, Task[]>

  const targetGroup = groups[movedTask.status]
  const insertAt = resolveInsertIndex(targetGroup, targetTaskId, position)
  targetGroup.splice(insertAt, 0, movedTask)

  const affectedStatuses = new Set<TaskStatus>([movedTask.status])
  const sourceStatus = originalById.get(movedTask.id)?.status
  if (sourceStatus) affectedStatuses.add(sourceStatus)

  const patches: TaskReorderPatch[] = []

  for (const status of affectedStatuses) {
    const nextGroup = groups[status]
    const nextOrderMap = createOrderMapFromSequence(nextGroup)

    for (const task of nextGroup) {
      const previous = originalById.get(task.id)
      const nextOrderIndex = nextOrderMap.get(task.id)
      if (!previous || nextOrderIndex === undefined) continue

      const isStatusChanged = previous.status !== task.status
      const isOrderChanged = previous.orderIndex !== nextOrderIndex
      if (!isStatusChanged && !isOrderChanged) continue

      patches.push({
        id: task.id,
        orderIndex: nextOrderIndex,
        status: isStatusChanged ? task.status : undefined,
      })
    }
  }

  return patches
}

function resolveInsertIndex(tasks: Task[], targetTaskId: Task["id"] | null, position: TaskDropPosition): number {
  if (!targetTaskId) return tasks.length

  const targetIndex = tasks.findIndex((task) => task.id === targetTaskId)
  if (targetIndex === -1) return tasks.length

  return position === "after" ? targetIndex + 1 : targetIndex
}

function createOrderMapFromSequence(tasks: Task[], start = ORDER_INDEX_STEP, step = ORDER_INDEX_STEP) {
  return new Map(tasks.map((task, index) => [task.id, start + index * step]))
}
