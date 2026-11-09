import {toRaw, toValue} from "vue"
import {getActivePinia} from "pinia"

import {createEntityId, getPreviousTaskOrderIndex, planTaskCreate, planTaskMoveByOrder, planTaskUpdate} from "@daily/protocol"
import {getTime, getTimezone, getToday, notNull, notUndefined, objectFilter} from "@daily/std"

import {Storage} from "@/api"
import {toasts} from "@/composables/useToasts"
import {applyChangeset} from "@/utils/storage/applyChangeset"
import {toRawDeep} from "@/utils/ui/toRawDeep"

import type {CreateTaskParams} from "@/api/types"
import type {Changeset} from "@daily/core"
import type {
  BoardMode,
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
import type {MaybeRefOrGetter, Ref} from "vue"

type TaskMoveMeta = {
  taskId: Task["id"]
  fromStatus: TaskStatus
  toStatus: TaskStatus
  targetTaskId: Task["id"] | null
  position: TaskMovePosition
}

type TaskMutationsContext = {
  tasks: Ref<Task[]>
  activeDay: MaybeRefOrGetter<ISODate>
  activeBranchId: MaybeRefOrGetter<Branch["id"] | undefined>
  dailyTasks: MaybeRefOrGetter<Task[]>
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
    priority?: Task["priority"]
    milestoneId?: Task["milestoneId"]
  }): Promise<Task | null> {
    const isUndated = params.status === "backlog" || (params.status === "ready_for_agent" && !params.date)
    const id = createEntityId("task")
    const date = params.date ?? toValue(activeDay)
    const time = getTime()
    const timezone = getTimezone()

    const request: CreateTaskParams = toRawDeep({
      id,
      date: isUndated ? undefined : date,
      time,
      timezone,
      tags: params.tags,
      estimatedTime: params.estimatedTime ?? 0,
      orderIndex: getPreviousTaskOrderIndex(toValue(dailyTasks)),
      branchId: params.branchId ?? toValue(activeBranchId),
      status: params.status,
      priority: params.priority,
      milestoneId: params.milestoneId,
    })

    const fields = planTaskCreate(mutationContext(), {
      content: params.content,
      status: request.status ?? "todo",
      minimized: false,
      priority: request.priority ?? "none",
      tags: request.tags ?? [],
      estimatedTime: request.estimatedTime ?? 0,
      spentTime: 0,
      orderIndex: request.orderIndex ?? 0,
      branchId: request.branchId,
      milestoneId: request.milestoneId ?? null,
      scheduled: isUndated ? null : {date, time, timezone},
    })

    const now = new Date().toISOString()
    const created: Task = {...fields, id, createdAt: now, updatedAt: now, deletedAt: null}

    const isCreated = await predictAndWrite(
      {tasks: {upserted: [created]}},
      () => Storage.createTask(params.content, request),
      "Failed to create task",
    )
    return isCreated ? findTaskById(created.id) : null
  }

  async function duplicateTask(taskId: Task["id"]) {
    const task = findTaskById(taskId)
    if (!task) return false

    const status = task.status === "done" || task.status === "cancelled" ? "todo" : task.status

    const created = await createTask({
      content: task.content,
      tags: task.tags,
      estimatedTime: task.estimatedTime,
      date: task.scheduled?.date,
      branchId: task.branchId,
      status,
      priority: task.priority,
    })

    return notNull(created)
  }

  async function updateTask(
    taskId: Task["id"],
    updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>,
    ...spentTimeAdjustment: [spentTimeDelta?: number]
  ) {
    const payload = toRawDeep(objectFilter(updates, (value) => notUndefined(value)))
    const [spentTimeDelta] = spentTimeAdjustment
    const task = spentTimeDelta === undefined ? null : findTaskById(taskId)
    const prediction = task && spentTimeDelta !== undefined ? {...payload, spentTime: Math.max(0, task.spentTime + spentTimeDelta)} : payload
    const patches = planTaskUpdate(mutationContext(), taskId, prediction as Partial<TaskWritableFields>)

    return predictAndWrite(changesetFromPatches(patches), () => Storage.updateTask(taskId, payload, ...spentTimeAdjustment), "Failed to update task")
  }

  async function deleteTask(taskId: Task["id"]) {
    if (!findTaskById(taskId)) return false

    return predictAndWrite({tasks: {removed: [taskId]}}, () => Storage.deleteTask(taskId), "Failed to delete task")
  }

  async function moveTask(taskId: Task["id"], targetDate: ISODate) {
    if (!findTaskById(taskId)) return false

    const patches = planTaskUpdate(mutationContext(), taskId, {scheduled: {date: targetDate} as TaskScheduled})

    return predictAndWrite(changesetFromPatches(patches), () => Storage.moveTask(taskId, targetDate), "Failed to move task")
  }

  async function moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]) {
    const task = findTaskById(taskId)
    if (!task) return false
    if (task.branchId === branchId) return true

    const patches = planTaskUpdate(mutationContext(), taskId, {branchId})

    return predictAndWrite(changesetFromPatches(patches), () => Storage.moveTaskToBranch(taskId, branchId), "Failed to move task")
  }

  async function moveTaskByOrder(params: {
    taskId: Task["id"]
    targetTaskId?: Task["id"] | null
    targetStatus?: TaskStatus
    position?: TaskMovePosition
    activeDate: ISODate
    acrossProjects?: boolean
    boardMode?: BoardMode
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
      acrossProjects: params.acrossProjects,
      boardMode: params.boardMode,
    })
    const patches = planTaskMoveByOrder(mutationContext(), moveParams)

    const isMoved = await predictAndWrite(changesetFromPatches(patches), () => Storage.moveTaskByOrder(moveParams), "Failed to move task")
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
