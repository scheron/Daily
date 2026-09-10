import {getPreviousTaskOrderIndex} from "@daily/protocol"
import {getTime, getTimezone, notNull, notUndefined, objectFilter} from "@daily/std"

import {API} from "@/api"
import {updateDays} from "@/utils/tasks/updateDays"
import {toRawDeep} from "@/utils/ui/vue"

import type {TaskDropPosition, TaskMoveMeta, TaskMutationsContext} from "@/stores/tasks/types"
import type {Branch, ISODate, Tag, Task, TaskStatus} from "@daily/protocol"

export function isBacklogStatus(status: TaskStatus): boolean {
  return status === "backlog"
}

export function crossesBacklog(fromStatus: TaskStatus, toStatus: TaskStatus): boolean {
  return isBacklogStatus(fromStatus) !== isBacklogStatus(toStatus)
}

/**
 * Task write operations: create, duplicate, update, move, and delete. Each call
 * goes through the API and patches the shared `days` state in place.
 * @param ctx - Shared task state refs, active-day selectors, and day-refresh helpers
 */
export function useTaskMutations(ctx: TaskMutationsContext) {
  const {days, activeDay, activeBranchId, dailyTasks, backlogTasks, findTaskById, refreshDay, refreshDays, refreshBacklog} = ctx

  async function createTask(params: {
    content: string
    tags: Tag[]
    estimatedTime?: number
    date?: ISODate
    branchId?: Branch["id"]
    status?: TaskStatus
  }): Promise<Task | null> {
    const isBacklog = params.status === "backlog"

    const previousDailyIds = new Set(dailyTasks.value.map((t) => t.id))
    const previousBacklogIds = new Set(backlogTasks.value.map((t) => t.id))

    const updatedDay = await API.createTask(
      params.content,
      toRawDeep({
        date: isBacklog ? undefined : (params.date ?? activeDay.value),
        time: getTime(),
        timezone: getTimezone(),
        tags: params.tags,
        estimatedTime: params.estimatedTime ?? 0,
        orderIndex: getPreviousTaskOrderIndex(dailyTasks.value),
        branchId: params.branchId ?? activeBranchId.value,
        status: params.status,
      }),
    )

    if (isBacklog) {
      await refreshBacklog()
      return backlogTasks.value.find((t) => !previousBacklogIds.has(t.id)) ?? null
    }

    if (!updatedDay) return null

    days.value = updateDays(days.value, updatedDay)
    return updatedDay.tasks.find((t) => !previousDailyIds.has(t.id)) ?? null
  }

  async function duplicateTask(taskId: Task["id"]) {
    const task = findTaskById(taskId)
    if (!task) return false

    const isBacklog = task.status === "backlog"

    const created = await createTask({
      content: task.content,
      tags: task.tags,
      estimatedTime: task.estimatedTime,
      date: task.scheduled?.date,
      branchId: task.branchId,
      status: isBacklog ? "backlog" : "active",
    })

    return notNull(created)
  }

  async function updateTask(taskId: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>) {
    const sourceDate = findTaskById(taskId)?.scheduled?.date ?? null

    const payload = objectFilter(updates, (value) => notUndefined(value))
    const result = await API.updateTask(taskId, toRawDeep(payload))

    if (!result.success) return false

    if (!result.day) {
      if (sourceDate) await refreshDay(sourceDate)
      await refreshBacklog()
      return true
    }

    days.value = updateDays(days.value, result.day)
    if (sourceDate && sourceDate !== result.day.date) await refreshDay(sourceDate)

    return true
  }

  async function toggleTaskMinimized(taskId: Task["id"], minimized: boolean) {
    const result = await API.toggleTaskMinimized(taskId, minimized)
    if (!result.success) return false

    if (!result.day) {
      await refreshBacklog()
      return true
    }

    days.value = updateDays(days.value, result.day)
    return true
  }

  async function deleteTask(taskId: Task["id"]) {
    const task = findTaskById(taskId)
    if (!task) return false

    const isSuccess = await API.deleteTask(taskId)
    if (!isSuccess) return false

    if (!task.scheduled) {
      backlogTasks.value = backlogTasks.value.filter((t) => t.id !== taskId)
      return true
    }

    const taskDate = task.scheduled.date
    const day = days.value.find((d) => d.date === taskDate)
    if (!day) return false

    const dayWithRemovedTask = {...day, tasks: day.tasks.filter((t) => t.id !== taskId)}
    days.value = updateDays(days.value, dayWithRemovedTask)

    return true
  }

  async function moveTask(taskId: Task["id"], targetDate: ISODate) {
    const task = findTaskById(taskId)
    if (!task) return false
    if (!task.scheduled) return true

    const sourceDate = task.scheduled.date

    const isSuccess = await API.moveTask(taskId, targetDate)
    if (!isSuccess) return false

    await refreshDays([sourceDate, targetDate])

    return true
  }

  async function moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]) {
    const task = findTaskById(taskId)
    if (!task) return false
    if (task.branchId === branchId) return true

    const isSuccess = await API.moveTaskToBranch(taskId, branchId)
    if (!isSuccess) return false

    if (task.scheduled) await refreshDay(task.scheduled.date)
    else await refreshBacklog()

    return true
  }

  async function moveTaskByOrder(params: {
    taskId: Task["id"]
    targetTaskId?: Task["id"] | null
    targetStatus?: TaskStatus
    position?: TaskDropPosition
    activeDate: ISODate
  }): Promise<TaskMoveMeta | null> {
    const sourceTask = findTaskById(params.taskId)
    if (!sourceTask) return null

    const targetTaskId = params.targetTaskId ?? null
    const position = params.position ?? "before"
    const toStatus = params.targetStatus ?? sourceTask.status

    const meta: TaskMoveMeta = {
      taskId: params.taskId,
      fromStatus: sourceTask.status,
      toStatus,
      targetTaskId,
      position,
    }

    if (targetTaskId === params.taskId && toStatus === sourceTask.status) {
      return meta
    }

    const sourceDate = sourceTask.scheduled?.date ?? null
    const touchesBacklog = isBacklogStatus(sourceTask.status) || isBacklogStatus(toStatus)

    try {
      const nextDay = await API.moveTaskByOrder(
        toRawDeep({
          taskId: params.taskId,
          targetTaskId,
          targetStatus: params.targetStatus,
          position,
          activeDate: params.activeDate,
        }),
      )

      if (touchesBacklog) await refreshBacklog()

      if (nextDay) {
        days.value = updateDays(days.value, nextDay)
      } else if (touchesBacklog) {
        if (sourceDate) await refreshDay(sourceDate)
      } else {
        await refreshDay(activeDay.value)
        return null
      }
    } catch (error) {
      console.error("Failed to reorder tasks", error)
      if (touchesBacklog) await refreshBacklog()
      await refreshDay(sourceDate ?? activeDay.value)
      return null
    }

    return meta
  }

  return {
    createTask,
    duplicateTask,
    updateTask,
    toggleTaskMinimized,
    deleteTask,
    moveTask,
    moveTaskToBranch,
    moveTaskByOrder,
  }
}
