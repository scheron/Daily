import {notNull, notUndefined} from "@shared/utils/common/validators"
import {getTime} from "@shared/utils/date/getTime"
import {getTimezone} from "@shared/utils/date/getTimezone"
import {objectFilter} from "@shared/utils/objects/objectFilter"
import {getPreviousTaskOrderIndex} from "@shared/utils/tasks/orderIndex"
import {updateDays} from "@/utils/tasks/updateDays"
import {toRawDeep} from "@/utils/ui/vue"

import {API} from "@/api"

import type {ISODate} from "@shared/types/common"
import type {Branch, Tag, Task, TaskStatus} from "@shared/types/storage"
import type {TaskDropPosition, TaskMoveMeta, TaskMutationsContext} from "../types"

/**
 * Task write operations: create, duplicate, update, move, and delete. Each call
 * goes through the API and patches the shared `days` state in place.
 * @param ctx - Shared task state refs, active-day selectors, and day-refresh helpers
 */
export function useTaskMutations(ctx: TaskMutationsContext) {
  const {days, activeDay, activeBranchId, activeDayData, dailyTasks, findTaskById, refreshDay, refreshDays} = ctx

  async function createTask(params: {
    content: string
    tags: Tag[]
    estimatedTime?: number
    date?: ISODate
    branchId?: Branch["id"]
    status?: TaskStatus
  }): Promise<Task | null> {
    const previousIds = new Set(dailyTasks.value.map((t) => t.id))
    const updatedDay = await API.createTask(
      params.content,
      toRawDeep({
        date: params.date ?? activeDay.value,
        time: getTime(),
        timezone: getTimezone(),
        tags: params.tags,
        estimatedTime: params.estimatedTime ?? 0,
        orderIndex: getPreviousTaskOrderIndex(dailyTasks.value),
        branchId: params.branchId ?? activeBranchId.value,
        status: params.status,
      }),
    )

    if (!updatedDay) return null

    days.value = updateDays(days.value, updatedDay)
    return updatedDay.tasks.find((t) => !previousIds.has(t.id)) ?? null
  }

  async function duplicateTask(taskId: Task["id"]) {
    const task = findTaskById(taskId)
    if (!task) return false

    const created = await createTask({
      content: task.content,
      tags: task.tags,
      estimatedTime: task.estimatedTime,
      date: task.scheduled.date,
      branchId: task.branchId,
      status: "active",
    })

    return notNull(created)
  }

  async function updateTask(taskId: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>) {
    const payload = objectFilter(updates, (value) => notUndefined(value))
    const updatedDay = await API.updateTask(taskId, toRawDeep(payload))
    if (!updatedDay) return false

    days.value = updateDays(days.value, updatedDay)
    return true
  }

  async function toggleTaskMinimized(taskId: Task["id"], minimized: boolean) {
    const updatedDay = await API.toggleTaskMinimized(taskId, minimized)
    if (!updatedDay) return false

    days.value = updateDays(days.value, updatedDay)
    return true
  }

  async function deleteTask(taskId: Task["id"]) {
    const task = findTaskById(taskId)
    if (!task) return false

    const isSuccess = await API.deleteTask(taskId)
    if (!isSuccess) return false

    const day = days.value.find((d) => d.date === task.scheduled.date)
    if (!day) return false

    const dayWithRemovedTask = {...day, tasks: day.tasks.filter((t) => t.id !== taskId)}
    days.value = updateDays(days.value, dayWithRemovedTask)

    return true
  }

  async function moveTask(taskId: Task["id"], targetDate: ISODate) {
    const task = findTaskById(taskId)
    if (!task) return false

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

    const taskDate = task.scheduled.date

    const isSuccess = await API.moveTaskToBranch(taskId, branchId)
    if (!isSuccess) return false

    await refreshDay(taskDate)
    return true
  }

  async function moveTaskByOrder(params: {
    taskId: Task["id"]
    targetTaskId?: Task["id"] | null
    targetStatus?: TaskStatus
    position?: TaskDropPosition
  }): Promise<TaskMoveMeta | null> {
    const day = activeDayData.value
    if (!day) return null

    const sourceTask = day.tasks.find((task) => task.id === params.taskId)
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

    try {
      const nextDay = await API.moveTaskByOrder(
        toRawDeep({
          taskId: params.taskId,
          targetTaskId,
          targetStatus: params.targetStatus,
          position,
        }),
      )
      if (!nextDay) {
        await refreshDay(activeDay.value)
        return null
      }

      days.value = updateDays(days.value, nextDay)
    } catch (error) {
      console.error("Failed to reorder tasks", error)
      await refreshDay(activeDay.value)
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
