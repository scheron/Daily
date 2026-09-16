import type {Task, TaskRelation} from "../../types/storage"

/** Everything a rule may read: every task and every relation the caller knows of, live or not. */
export type RelationContext = {
  tasks: Pick<Task, "id" | "branchId" | "deletedAt">[]
  relations: Pick<TaskRelation, "id" | "blockerId" | "blockedId" | "deletedAt">[]
}

/** The ids a task wants on each side, in the order they should be considered. */
export type TaskRelationSets = {blockedBy: Task["id"][]; blocks: Task["id"][]}

export type TaskRelationLink = Pick<TaskRelation, "id" | "blockerId" | "blockedId">

/** The links to write and the relation ids to remove for one task. */
export type TaskRelationPlan = {linked: TaskRelationLink[]; unlinked: TaskRelation["id"][]}

/** The pair's id, order-independent: linking A to B or B to A always touches the same row. */
export function toTaskRelationId(a: Task["id"], b: Task["id"]): TaskRelation["id"] {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

/**
 * True when `blockerId` may block `blockedId`: the two ids differ, both tasks are live in the
 * same project, no live relation already links this pair, and linking would not close a cycle.
 */
export function canLinkTasks(ctx: RelationContext, blockerId: Task["id"], blockedId: Task["id"]): boolean {
  if (blockerId === blockedId) return false

  const blocker = findLiveTask(ctx, blockerId)
  const blocked = findLiveTask(ctx, blockedId)
  if (!blocker || !blocked || blocker.branchId !== blocked.branchId) return false

  const relationId = toTaskRelationId(blockerId, blockedId)
  if (ctx.relations.some((relation) => relation.id === relationId && relation.deletedAt === null)) return false

  return !isReachable(ctx, blockedId, blockerId)
}

/**
 * The links to write and the relations to remove so that `taskId`'s links become `next`. Ids that
 * cannot be linked — the task itself, duplicates, or anything `canLinkTasks` rejects — are skipped.
 */
export function planTaskRelations(ctx: RelationContext, taskId: Task["id"], next: TaskRelationSets): TaskRelationPlan {
  if (!findLiveTask(ctx, taskId)) return {linked: [], unlinked: []}

  const wanted = buildWantedLinks(taskId, next)
  const wantedIds = new Set(wanted.map((link) => otherTaskId(link, taskId)))

  const liveRelations = ctx.relations.filter((relation) => relation.deletedAt === null)
  const touchingTaskId = liveRelations.filter((relation) => relation.blockerId === taskId || relation.blockedId === taskId)
  const unlinked = touchingTaskId.filter((relation) => !wantedIds.has(otherTaskId(relation, taskId))).map((relation) => relation.id)

  const linked: TaskRelationLink[] = []

  for (const link of wanted) {
    const existing = liveRelations.find((relation) => relation.id === link.id)
    if (existing && existing.blockerId === link.blockerId && existing.blockedId === link.blockedId) continue

    const workingRelations = liveRelations
      .filter((relation) => !unlinked.includes(relation.id) && relation.id !== link.id)
      .concat(linked.map((accepted) => ({...accepted, deletedAt: null})))

    if (canLinkTasks({tasks: ctx.tasks, relations: workingRelations}, link.blockerId, link.blockedId)) {
      linked.push(link)
    }
  }

  return {linked, unlinked}
}

function buildWantedLinks(taskId: Task["id"], next: TaskRelationSets): TaskRelationLink[] {
  const seen = new Set<Task["id"]>([taskId])
  const wanted: TaskRelationLink[] = []

  for (const blockerId of next.blockedBy) {
    if (seen.has(blockerId)) continue
    seen.add(blockerId)
    wanted.push({id: toTaskRelationId(blockerId, taskId), blockerId, blockedId: taskId})
  }

  for (const blockedId of next.blocks) {
    if (seen.has(blockedId)) continue
    seen.add(blockedId)
    wanted.push({id: toTaskRelationId(taskId, blockedId), blockerId: taskId, blockedId})
  }

  return wanted
}

function otherTaskId(relation: Pick<TaskRelation, "blockerId" | "blockedId">, taskId: Task["id"]): Task["id"] {
  return relation.blockerId === taskId ? relation.blockedId : relation.blockerId
}

function findLiveTask(ctx: RelationContext, id: Task["id"]): Pick<Task, "id" | "branchId" | "deletedAt"> | null {
  return ctx.tasks.find((task) => task.id === id && task.deletedAt === null) ?? null
}

function isReachable(ctx: RelationContext, fromId: Task["id"], toId: Task["id"]): boolean {
  const adjacency = buildAdjacency(ctx)
  const visited = new Set<Task["id"]>()
  const stack = [fromId]

  while (stack.length > 0) {
    const current = stack.pop() as Task["id"]
    if (current === toId) return true
    if (visited.has(current)) continue
    visited.add(current)

    for (const next of adjacency.get(current) ?? []) stack.push(next)
  }

  return false
}

function buildAdjacency(ctx: RelationContext): Map<Task["id"], Task["id"][]> {
  const adjacency = new Map<Task["id"], Task["id"][]>()

  for (const relation of ctx.relations) {
    if (relation.deletedAt !== null) continue

    const neighbors = adjacency.get(relation.blockerId) ?? []
    neighbors.push(relation.blockedId)
    adjacency.set(relation.blockerId, neighbors)
  }

  return adjacency
}
