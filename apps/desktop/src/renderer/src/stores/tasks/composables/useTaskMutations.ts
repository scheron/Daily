import {getPreviousTaskOrderIndex} from "@daily/protocol"
import {getTime, getTimezone, notNull, notUndefined, objectFilter} from "@daily/std"

import {API} from "@/api"
import {updateDays} from "@/utils/tasks/updateDays"
import {toRawDeep} from "@/utils/ui/vue"

import type {TaskDropPosition, TaskMoveMeta, TaskMutationsContext} from "@/stores/tasks/types"
import type {Branch, Day, ISODate, Tag, Task, TaskSchedule, TaskStatus} from "@daily/protocol"

/**
 * Task write operations: create, duplicate, update, move, and delete. Each call
 * goes through the API and patches the shared `days` state in place.
 * @param ctx - Shared task state refs, active-day selectors, and day-refresh helpers
 */
export function useTaskMutations(ctx: TaskMutationsContext) {
  const {days, activeDay, activeBranchId, dailyTasks, backlogTasks, findTaskById, refreshDay, refreshDays, getBacklogList} = ctx
  const {refreshTrash, dropFromTrash, clearTrash} = ctx

  async function createTask(params: {
    content: string
    tags: Tag[]
    estimatedTime?: number
    date?: ISODate | null
    branchId?: Branch["id"]
    status?: TaskStatus
  }): Promise<Task | null> {
    const isBacklog = params.date === null
    const siblingTasks = isBacklog ? backlogTasks.value : dailyTasks.value
    const previousIds = new Set(siblingTasks.map((t) => t.id))

    const result = await API.createTask(
      params.content,
      toRawDeep({
        date: params.date === undefined ? activeDay.value : params.date,
        time: getTime(),
        timezone: getTimezone(),
        tags: params.tags,
        estimatedTime: params.estimatedTime ?? 0,
        orderIndex: getPreviousTaskOrderIndex(siblingTasks),
        branchId: params.branchId ?? activeBranchId.value,
        status: params.status,
      }),
    )

    if (!result) return null

    if (isDayResult(result)) {
      days.value = updateDays(days.value, result)
      return result.tasks.find((t) => !previousIds.has(t.id)) ?? null
    }

    backlogTasks.value = [result, ...backlogTasks.value]
    return result
  }

  async function duplicateTask(taskId: Task["id"]) {
    const task = findTaskById(taskId)
    if (!task) return false

    const created = await createTask({
      content: task.content,
      tags: task.tags,
      estimatedTime: task.estimatedTime,
      date: task.scheduled?.date ?? null,
      branchId: task.branchId,
      status: "active",
    })

    return notNull(created)
  }

  async function updateTask(taskId: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>) {
    const payload = objectFilter(updates, (value) => notUndefined(value))
    const before = findTaskById(taskId)

    const updated = await API.updateTask(taskId, toRawDeep(payload), activeDay.value)
    if (!updated) return false

    const beforeDate = before?.scheduled?.date ?? null
    const afterDate = updated.scheduled?.date ?? null

    if (!patchTaskInDay(updated, beforeDate, notUndefined(payload.tags))) {
      const affectedDates = new Set<ISODate>()
      if (beforeDate) affectedDates.add(beforeDate)
      if (afterDate) affectedDates.add(afterDate)

      if (affectedDates.size) await refreshDays([...affectedDates])
    }

    if (before?.status === "backlog" || updated.status === "backlog") await getBacklogList()

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

    const taskDate = task.scheduled?.date ?? null

    if (taskDate) {
      const day = days.value.find((d) => d.date === taskDate)
      if (day) days.value = updateDays(days.value, {...day, tasks: day.tasks.filter((t) => t.id !== taskId)})
    } else {
      backlogTasks.value = backlogTasks.value.filter((t) => t.id !== taskId)
    }

    await refreshTrash()

    return true
  }

  async function moveTaskInTrash(taskId: Task["id"], targetTaskId: Task["id"] | null, position: TaskDropPosition) {
    const moved = await API.moveTaskInTrash(taskId, targetTaskId, position)
    if (!moved) return false

    await refreshTrash()

    return true
  }

  async function restoreTask(taskId: Task["id"], landingDay?: ISODate): Promise<Task | null> {
    const restored = await API.restoreTask(taskId, landingDay ?? activeDay.value)
    if (!restored) return null

    dropFromTrash(taskId)

    if (restored.scheduled) await refreshDay(restored.scheduled.date)
    else await getBacklogList()

    return restored
  }

  async function permanentlyDeleteTask(taskId: Task["id"]) {
    const isSuccess = await API.permanentlyDeleteTask(taskId)
    if (!isSuccess) return false

    dropFromTrash(taskId)

    return true
  }

  async function emptyTrash() {
    const count = await API.permanentlyDeleteAllDeletedTasks()
    if (count > 0) clearTrash()

    return count
  }

  async function moveTask(taskId: Task["id"], targetDate: ISODate) {
    const task = findTaskById(taskId)
    if (!task || !task.scheduled) return false

    const sourceDate = task.scheduled.date

    const isSuccess = await API.moveTask(taskId, targetDate)
    if (!isSuccess) return false

    await refreshDays([sourceDate, targetDate])

    return true
  }

  async function scheduleTask(taskId: Task["id"], schedule: TaskSchedule) {
    const isSuccess = await API.scheduleTask(taskId, schedule)
    if (!isSuccess) return false

    backlogTasks.value = backlogTasks.value.filter((t) => t.id !== taskId)
    await refreshDay(schedule.date)

    return true
  }

  async function moveTaskToBacklog(taskId: Task["id"]) {
    const task = findTaskById(taskId)
    if (!task || !task.scheduled) return false

    const sourceDate = task.scheduled.date

    const updated = await API.moveTaskToBacklog(taskId)
    if (!updated) return false

    await refreshDay(sourceDate)
    backlogTasks.value = [updated, ...backlogTasks.value]

    return true
  }

  async function moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]) {
    const task = findTaskById(taskId)
    if (!task) return false
    if (task.branchId === branchId) return true
    if (!task.scheduled) return false

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
    activeDay?: ISODate
  }): Promise<TaskMoveMeta | null> {
    let sourceTask = findTaskById(params.taskId)

    if (!sourceTask) {
      const restored = await restoreTask(params.taskId, params.activeDay)
      if (!restored) return null

      sourceTask = findTaskById(params.taskId) ?? restored
    }

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
    const destinationDate = toStatus === "backlog" ? null : (params.activeDay ?? sourceDate ?? activeDay.value)
    const touchesBacklog = sourceTask.status === "backlog" || toStatus === "backlog"

    try {
      const updated = await API.moveTaskByOrder(
        toRawDeep({
          taskId: params.taskId,
          targetTaskId,
          targetStatus: params.targetStatus,
          position,
          activeDay: params.activeDay,
        }),
      )

      if (!updated) {
        if (sourceDate) await refreshDay(sourceDate)
        if (touchesBacklog) await getBacklogList()
        return null
      }
    } catch (error) {
      console.error("Failed to reorder tasks", error)
      if (sourceDate) await refreshDay(sourceDate)
      if (touchesBacklog) await getBacklogList()
      return null
    }

    const affectedDates = new Set<ISODate>()
    if (sourceDate) affectedDates.add(sourceDate)
    if (destinationDate) affectedDates.add(destinationDate)

    if (affectedDates.size) await refreshDays([...affectedDates])
    if (touchesBacklog) await getBacklogList()

    return meta
  }

  function patchTaskInDay(task: Task, previousDate: ISODate | null, tagsChanged: boolean): boolean {
    if (tagsChanged) return false
    if (!task.scheduled || task.scheduled.date !== previousDate) return false

    const day = days.value.find((d) => d.date === previousDate)
    if (!day) return false

    days.value = updateDays(days.value, {...day, tasks: day.tasks.map((t) => (t.id === task.id ? task : t))})

    return true
  }

  return {
    createTask,
    duplicateTask,
    updateTask,
    toggleTaskMinimized,
    deleteTask,
    moveTaskInTrash,
    restoreTask,
    permanentlyDeleteTask,
    emptyTrash,
    moveTask,
    scheduleTask,
    moveTaskToBacklog,
    moveTaskToBranch,
    moveTaskByOrder,
  }
}

function isDayResult(result: Day | Task): result is Day {
  return "tasks" in result
}
