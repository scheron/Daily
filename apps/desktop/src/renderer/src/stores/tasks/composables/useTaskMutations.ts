import {toRaw} from "vue"
import {toasts} from "vue-toasts-lite"
import {getActivePinia} from "pinia"

import {createEntityId, getPreviousTaskOrderIndex, planTaskCreate, planTaskMoveByOrder, planTaskUpdate} from "@daily/protocol"
import {getTime, getTimezone, getToday, notNull, notUndefined, objectFilter} from "@daily/std"

import {API} from "@/api"
import {applyChangeset} from "@/utils/storage/applyChangeset"
import {toRawDeep} from "@/utils/ui/toRawDeep"

import type {CreateTaskParams} from "@/api/types"
import type {Changeset} from "@daily/core"
import type {
  Branch,
  ISODate,
  Milestone,
  MoveTaskByOrderParams,
  MutationContext,
  Tag,
  Task,
  TaskMovePosition,
  TaskPatch,
  TaskScheduled,
  TaskStatus,
  TaskWritableFields,
} from "@daily/protocol"
import type {ComputedRef, Ref} from "vue"

type TaskMoveMeta = {
  taskId: Task["id"]
  fromStatus: TaskStatus
  toStatus: TaskStatus
  targetTaskId: Task["id"] | null
  position: TaskMovePosition
}

type TaskMutationsContext = {
  tasks: Ref<Task[]>
  activeDay: Ref<ISODate>
  activeBranchId: ComputedRef<Branch["id"] | undefined>
  dailyTasks: ComputedRef<Task[]>
  findTaskById: (taskId: Task["id"]) => Task | null
}

export function useTaskMutations(ctx: TaskMutationsContext) {
  const {tasks, activeDay, activeBranchId, dailyTasks, findTaskById} = ctx

  async function createTask(params: {
    content: string
    tags: Tag[]
    estimatedTime?: number
    date?: ISODate
    branchId?: Branch["id"]
    status?: TaskStatus
    milestoneId?: Task["milestoneId"]
  }): Promise<Task | null> {
    const isBacklog = params.status === "backlog"
    const id = createEntityId("task")
    const date = params.date ?? activeDay.value
    const time = getTime()
    const timezone = getTimezone()

    const request: CreateTaskParams = toRawDeep({
      id,
      date: isBacklog ? undefined : date,
      time,
      timezone,
      tags: params.tags,
      estimatedTime: params.estimatedTime ?? 0,
      orderIndex: getPreviousTaskOrderIndex(dailyTasks.value),
      branchId: params.branchId ?? activeBranchId.value,
      status: params.status,
      milestoneId: params.milestoneId,
    })

    const fields = planTaskCreate(mutationContext(), {
      content: params.content,
      status: request.status ?? "active",
      minimized: false,
      tags: request.tags ?? [],
      estimatedTime: request.estimatedTime ?? 0,
      spentTime: 0,
      orderIndex: request.orderIndex ?? 0,
      branchId: request.branchId,
      milestoneId: request.milestoneId ?? null,
      scheduled: isBacklog ? null : {date, time, timezone},
    })

    const now = new Date().toISOString()
    const created: Task = {...fields, id, createdAt: now, updatedAt: now, deletedAt: null}

    const isCreated = await predictAndWrite({tasks: {upserted: [created]}}, () => API.createTask(params.content, request), "Failed to create task")
    return isCreated ? findTaskById(created.id) : null
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
    const payload = toRawDeep(objectFilter(updates, (value) => notUndefined(value)))
    const patches = planTaskUpdate(mutationContext(), taskId, payload as Partial<TaskWritableFields>)

    return predictAndWrite(changesetFromPatches(patches), () => API.updateTask(taskId, payload), "Failed to update task")
  }

  async function deleteTask(taskId: Task["id"]) {
    if (!findTaskById(taskId)) return false

    return predictAndWrite({tasks: {removed: [taskId]}}, () => API.deleteTask(taskId), "Failed to delete task")
  }

  async function moveTask(taskId: Task["id"], targetDate: ISODate) {
    if (!findTaskById(taskId)) return false

    const patches = planTaskUpdate(mutationContext(), taskId, {scheduled: {date: targetDate} as TaskScheduled})

    return predictAndWrite(changesetFromPatches(patches), () => API.moveTask(taskId, targetDate), "Failed to move task")
  }

  async function moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]) {
    const task = findTaskById(taskId)
    if (!task) return false
    if (task.branchId === branchId) return true

    const patches = planTaskUpdate(mutationContext(), taskId, {branchId})

    return predictAndWrite(changesetFromPatches(patches), () => API.moveTaskToBranch(taskId, branchId), "Failed to move task")
  }

  async function moveTaskByOrder(params: {
    taskId: Task["id"]
    targetTaskId?: Task["id"] | null
    targetStatus?: TaskStatus
    position?: TaskMovePosition
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

    const moveParams: MoveTaskByOrderParams = toRawDeep({
      taskId: params.taskId,
      targetTaskId,
      targetStatus: params.targetStatus,
      position,
      activeDate: params.activeDate,
    })
    const patches = planTaskMoveByOrder(mutationContext(), moveParams)

    const isMoved = await predictAndWrite(changesetFromPatches(patches), () => API.moveTaskByOrder(moveParams), "Failed to move task")
    return isMoved ? meta : null
  }

  async function predictAndWrite(predicted: Changeset, write: () => Promise<Changeset>, failureMessage: string): Promise<boolean> {
    const rollback = rollbackOf(predicted)
    applyChangeset({tasks}, predicted)

    try {
      applyChangeset({tasks}, await write())
      return true
    } catch (error) {
      console.error(failureMessage, error)
      applyChangeset({tasks}, rollback)
      toasts.error(failureMessage)
      return false
    }
  }

  function mutationContext(): MutationContext {
    return {tasks: toRaw(tasks.value), milestones: liveMilestones(), today: getToday()}
  }

  function changesetFromPatches(patches: TaskPatch[]): Changeset {
    const updatedAt = new Date().toISOString()
    const taskById = new Map(toRaw(tasks.value).map((task) => [task.id, task]))

    const upserted = patches.flatMap(({id, ...fields}) => {
      const before = taskById.get(id)
      return before ? [{...before, ...fields, updatedAt}] : []
    })

    return upserted.length ? {tasks: {upserted}} : {}
  }

  function rollbackOf(predicted: Changeset): Changeset {
    const taskById = new Map(toRaw(tasks.value).map((task) => [task.id, task]))
    const touchedIds = [...(predicted.tasks?.upserted ?? []).map((task) => task.id), ...(predicted.tasks?.removed ?? [])]

    return {
      tasks: {
        upserted: touchedIds.flatMap((id) => taskById.get(id) ?? []),
        removed: touchedIds.filter((id) => !taskById.has(id)),
      },
    }
  }

  return {
    createTask,
    duplicateTask,
    updateTask,
    deleteTask,
    moveTask,
    moveTaskToBranch,
    moveTaskByOrder,
  }
}

function liveMilestones(): MutationContext["milestones"] {
  const state = getActivePinia()?.state.value.milestones as {milestones?: Milestone[]} | undefined
  return toRaw(state?.milestones) ?? []
}
