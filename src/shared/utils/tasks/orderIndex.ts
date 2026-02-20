import {toTs} from "../date/formatters"

import type {Task} from "../../types/storage"

export const ORDER_INDEX_STEP = 1024

function toOrderValue(task: Pick<Task, "orderIndex" | "createdAt">): number {
  if (Number.isFinite(task.orderIndex)) return task.orderIndex
  return toTs(task.createdAt)
}

export function sortTasksByOrderIndex<T extends Pick<Task, "id" | "orderIndex" | "createdAt">>(tasks: T[]): T[] {
  return tasks.toSorted((a, b) => {
    const orderDiff = toOrderValue(a) - toOrderValue(b)
    if (orderDiff !== 0) return orderDiff

    const createdAtDiff = toTs(a.createdAt) - toTs(b.createdAt)
    if (createdAtDiff !== 0) return createdAtDiff

    return a.id.localeCompare(b.id)
  })
}

export function getNextTaskOrderIndex(tasks: Pick<Task, "orderIndex" | "createdAt">[], step = ORDER_INDEX_STEP): number {
  if (!tasks.length) return step

  const maxOrder = tasks.reduce((max, task) => Math.max(max, toOrderValue(task)), Number.NEGATIVE_INFINITY)
  return maxOrder + step
}

export function normalizeTaskOrderIndexes<T extends Pick<Task, "id" | "orderIndex" | "createdAt">>(
  tasks: T[],
  options: {start?: number; step?: number} = {},
) {
  const {start = ORDER_INDEX_STEP, step = ORDER_INDEX_STEP} = options
  const sorted = sortTasksByOrderIndex(tasks)

  return sorted.map((task, index) => ({
    id: task.id,
    orderIndex: start + index * step,
  }))
}
