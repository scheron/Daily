import {toRaw} from "vue"

import {MAIN_BRANCH_ID} from "@daily/protocol"
import {isArray, isObjectLike, isUndefined} from "@daily/std"

import type {Changeset} from "@daily/core"
import type {Branch, Milestone, Tag, Task} from "@daily/protocol"
import type {Ref} from "vue"

/** The in-memory collections one changeset is applied to. A collection left out is not touched. */
export type ChangesetTarget = {
  tasks: Ref<Task[]>
  milestones?: Ref<Milestone[]>
  tags?: Ref<Tag[]>
  branches?: Ref<Branch[]>
}

/**
 * Applies what changed, whichever side produced it: this window's prediction, main's reply,
 * another window's broadcast, or a sync pull. Rows are reconciled by value and never by
 * `updatedAt`, so a row whose fields already match stays the same object and a second
 * application of the same changeset changes nothing. A row upserted with `deletedAt` set leaves
 * its collection, which holds live rows only.
 *
 * Removals cascade as `LocalStorageAdapter` cascades them on a pull: a removed milestone leaves the
 * tasks that held it, a removed tag leaves every task carrying it, and a removed project takes its
 * milestones and tags with it and hands the tasks the changeset did not remove to `main`.
 * @param target - The collections to patch
 * @param changeset - What changed
 */
export function applyChangeset(target: ChangesetTarget, changeset: Changeset): void {
  const upserted = {
    tasks: upsertRows(rawRows(target.tasks), changeset.tasks?.upserted),
    milestones: upsertRows(rawRows(target.milestones), changeset.milestones?.upserted),
    tags: upsertRows(rawRows(target.tags), changeset.tags?.upserted),
    branches: upsertRows(rawRows(target.branches), changeset.branches?.upserted),
  }

  const removedProjects = new Set(changeset.branches?.removed)
  const removed: Removed = {
    tasks: new Set(changeset.tasks?.removed),
    milestones: new Set([...(changeset.milestones?.removed ?? []), ...idsInProjects(upserted.milestones, removedProjects)]),
    tags: new Set([...(changeset.tags?.removed ?? []), ...idsInProjects(upserted.tags, removedProjects)]),
    branches: removedProjects,
  }

  assignIfChanged(target.tasks, cascadeIntoTasks(withoutRows(upserted.tasks, removed.tasks), removed))
  assignIfChanged(target.milestones, withoutRows(upserted.milestones, removed.milestones))
  assignIfChanged(target.tags, withoutRows(upserted.tags, removed.tags))
  assignIfChanged(target.branches, withoutRows(upserted.branches, removed.branches))
}

function rawRows<Row>(collection: Ref<Row[]> | undefined): Row[] {
  return collection ? toRaw(collection.value) : []
}

function assignIfChanged<Row>(collection: Ref<Row[]> | undefined, next: Row[]): void {
  if (collection && next !== toRaw(collection.value)) collection.value = next
}

function upsertRows<Row extends Syncable>(rows: Row[], upserted: Row[] | undefined): Row[] {
  if (!upserted?.length) return rows

  let next = rows
  const writable = () => (next === rows ? (next = [...rows]) : next)
  const indexById = new Map(rows.map((row, index) => [row.id, index]))
  const tombstoned = new Set<Row["id"]>()

  for (const incoming of upserted) {
    const index = indexById.get(incoming.id)

    if (incoming.deletedAt) {
      tombstoned.add(incoming.id)
    } else if (isUndefined(index)) {
      indexById.set(incoming.id, writable().push(incoming) - 1)
    } else if (!isSameRow(next[index], incoming)) {
      writable()[index] = incoming
    }
  }

  return withoutRows(next, tombstoned)
}

function withoutRows<Row extends Syncable>(rows: Row[], ids: Set<Row["id"]>): Row[] {
  if (!ids.size || !rows.some((row) => ids.has(row.id))) return rows
  return rows.filter((row) => !ids.has(row.id))
}

function idsInProjects(rows: Array<{id: string; branchId: Branch["id"]}>, projectIds: Set<Branch["id"]>): string[] {
  if (!projectIds.size) return []
  return rows.filter((row) => projectIds.has(row.branchId)).map((row) => row.id)
}

function cascadeIntoTasks(tasks: Task[], removed: Removed): Task[] {
  if (!removed.milestones.size && !removed.tags.size && !removed.branches.size) return tasks

  let isChanged = false
  const next = tasks.map((task) => {
    const cascaded = cascadeIntoTask(task, removed)
    if (cascaded !== task) isChanged = true
    return cascaded
  })

  return isChanged ? next : tasks
}

function cascadeIntoTask(task: Task, removed: Removed): Task {
  const clearsMilestone = Boolean(task.milestoneId && removed.milestones.has(task.milestoneId))
  const dropsTags = task.tags.some((tag) => removed.tags.has(tag.id))
  const leavesProject = removed.branches.has(task.branchId)

  if (!clearsMilestone && !dropsTags && !leavesProject) return task

  return {
    ...task,
    ...(clearsMilestone && {milestoneId: null}),
    ...(dropsTags && {tags: task.tags.filter((tag) => !removed.tags.has(tag.id))}),
    ...(leavesProject && {branchId: MAIN_BRANCH_ID}),
  }
}

function isSameRow(current: object, incoming: object): boolean {
  const a = current as Fields
  const b = incoming as Fields
  return keysOf(a, b).every((key) => key === "updatedAt" || isSameValue(a[key], b[key]))
}

function isSameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true

  if (isArray(a) || isArray(b)) {
    return isArray(a) && isArray(b) && a.length === b.length && a.every((item, index) => isSameValue(item, b[index]))
  }

  if (isObjectLike(a) && isObjectLike(b)) {
    const left = a as Fields
    const right = b as Fields
    return keysOf(left, right).every((key) => isSameValue(left[key], right[key]))
  }

  return false
}

function keysOf(a: Fields, b: Fields): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
}

type Syncable = {id: string; deletedAt: string | null}

type Removed = {
  tasks: Set<Task["id"]>
  milestones: Set<Milestone["id"]>
  tags: Set<Tag["id"]>
  branches: Set<Branch["id"]>
}

type Fields = Record<string, unknown>
