import {computed, ref, shallowRef, toRaw} from "vue"
import {toasts} from "vue-toasts-lite"
import {defineStore} from "pinia"

import {canLinkTasks, planTaskRelations, toTaskRelationId} from "@daily/protocol"

import {API} from "@/api"
import {useTasksStore} from "@/stores/tasks"
import {applyChangeset} from "@/utils/storage/applyChangeset"

import type {Changeset} from "@daily/core"
import type {RelationContext, Task, TaskRelation, TaskRelationSets} from "@daily/protocol"

export type TaskRelationChip = {kind: "blocked-by" | "blocks" | "linked"; count: number}

/**
 * Every live relation, held in memory from startup — every view of what blocks what is a selector
 * over this collection (ADR 0003). `setTaskRelations` writes optimistically: it remembers the rows
 * these ids held before, applies the prediction, and on a throw restores exactly those rows rather
 * than inverting the prediction, since an upsert here can replace an existing row instead of adding one.
 */
export const useTaskRelationsStore = defineStore("taskRelations", () => {
  const tasksStore = useTasksStore()

  const relations = shallowRef<TaskRelation[]>([])
  const isLoaded = ref(false)

  const relatedTasksByTaskId = computed(() => {
    const map = new Map<Task["id"], {blockedBy: Task[]; blocks: Task[]}>()
    const taskById = new Map(tasksStore.tasks.map((task) => [task.id, task]))

    for (const relation of relations.value) {
      const blocker = taskById.get(relation.blockerId)
      const blocked = taskById.get(relation.blockedId)
      if (!blocker || !blocked || blocker.branchId !== blocked.branchId) continue

      entryFor(map, relation.blockedId).blockedBy.push(blocker)
      entryFor(map, relation.blockerId).blocks.push(blocked)
    }

    return map
  })

  const chipByTaskId = computed(() => {
    const map = new Map<Task["id"], TaskRelationChip>()

    for (const [taskId, related] of relatedTasksByTaskId.value) {
      const task = tasksStore.findTaskById(taskId)
      if (!task || (task.status !== "active" && task.status !== "backlog")) continue

      const blockedByCount = related.blockedBy.filter((blocker) => blocker.status === "active" || blocker.status === "backlog").length
      const blocksCount = related.blocks.filter((blocked) => blocked.status === "active" || blocked.status === "backlog").length

      if (blockedByCount > 0 && blocksCount > 0) map.set(taskId, {kind: "linked", count: blockedByCount + blocksCount})
      else if (blockedByCount > 0) map.set(taskId, {kind: "blocked-by", count: blockedByCount})
      else if (blocksCount > 0) map.set(taskId, {kind: "blocks", count: blocksCount})
    }

    return map
  })

  async function loadRelations(): Promise<void> {
    isLoaded.value = false
    try {
      relations.value = await API.getAllTaskRelations()
    } catch (error) {
      console.error("Failed to load task relations:", error)
      throw error
    } finally {
      isLoaded.value = true
    }
  }

  function linkCandidates(params: {task: Pick<Task, "id" | "branchId">; current: TaskRelationSets; side: keyof TaskRelationSets}): Task[] {
    const {task, current, side} = params

    const rawTasks = toRaw(tasksStore.tasks)
    const contextTasks: RelationContext["tasks"] = rawTasks.some((candidate) => candidate.id === task.id)
      ? rawTasks
      : [...rawTasks, {id: task.id, branchId: task.branchId, deletedAt: null}]

    const rawRelations = toRaw(relations.value)
    const contextRelations: RelationContext["relations"] = [
      ...rawRelations.filter((relation) => relation.blockerId !== task.id && relation.blockedId !== task.id),
      ...current.blockedBy.map((id) => ({id: toTaskRelationId(id, task.id), blockerId: id, blockedId: task.id, deletedAt: null})),
      ...current.blocks.map((id) => ({id: toTaskRelationId(task.id, id), blockerId: task.id, blockedId: id, deletedAt: null})),
    ]

    const context: RelationContext = {tasks: contextTasks, relations: contextRelations}
    const excludedIds = new Set([task.id, ...current.blockedBy, ...current.blocks])

    return rawTasks
      .filter((candidate) => candidate.branchId === task.branchId && !excludedIds.has(candidate.id))
      .filter((candidate) => (side === "blockedBy" ? canLinkTasks(context, candidate.id, task.id) : canLinkTasks(context, task.id, candidate.id)))
      .sort((a, b) => {
        const isAUnresolved = a.status === "active" || a.status === "backlog"
        const isBUnresolved = b.status === "active" || b.status === "backlog"
        if (isAUnresolved !== isBUnresolved) return isAUnresolved ? -1 : 1
        return b.updatedAt.localeCompare(a.updatedAt)
      })
  }

  async function setTaskRelations(taskId: Task["id"], next: TaskRelationSets): Promise<boolean> {
    const plainNext: TaskRelationSets = {blockedBy: [...next.blockedBy], blocks: [...next.blocks]}

    if (namesOnlyItself(taskId, plainNext)) return true

    const plan = planTaskRelations({tasks: toRaw(tasksStore.tasks), relations: toRaw(relations.value)}, taskId, plainNext)
    if (!plan.linked.length && !plan.unlinked.length) return true

    const now = new Date().toISOString()
    const relationById = new Map(toRaw(relations.value).map((relation) => [relation.id, relation]))
    const touchedIds = [...plan.linked.map((link) => link.id), ...plan.unlinked]
    const before = new Map(touchedIds.map((id) => [id, relationById.get(id) ?? null]))

    const predicted: Changeset = {
      relations: {
        upserted: plan.linked.map((link) => ({...link, createdAt: relationById.get(link.id)?.createdAt ?? now, updatedAt: now, deletedAt: null})),
        removed: plan.unlinked,
      },
    }

    applyChangeset({relations}, predicted)

    try {
      applyChangeset({relations}, await API.setTaskRelations(taskId, plainNext))
      return true
    } catch (error) {
      console.error("Failed to update task links", error)
      applyChangeset({relations}, rollbackOf(before))
      toasts.error("Failed to update task links")
      return false
    }
  }

  return {
    relations,
    isLoaded,
    relatedTasksByTaskId,
    chipByTaskId,
    loadRelations,
    linkCandidates,
    setTaskRelations,
  }
})

function entryFor(map: Map<Task["id"], {blockedBy: Task[]; blocks: Task[]}>, taskId: Task["id"]): {blockedBy: Task[]; blocks: Task[]} {
  let entry = map.get(taskId)
  if (!entry) {
    entry = {blockedBy: [], blocks: []}
    map.set(taskId, entry)
  }
  return entry
}

function namesOnlyItself(taskId: Task["id"], next: TaskRelationSets): boolean {
  const ids = [...next.blockedBy, ...next.blocks]
  return ids.length > 0 && ids.every((id) => id === taskId)
}

function rollbackOf(before: Map<TaskRelation["id"], TaskRelation | null>): Changeset {
  const upserted: TaskRelation[] = []
  const removed: TaskRelation["id"][] = []

  for (const [id, row] of before) {
    if (row) upserted.push(row)
    else removed.push(id)
  }

  return {relations: {upserted, removed}}
}
