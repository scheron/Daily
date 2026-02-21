import {toTs} from "../date/formatters"

import type {Task} from "../../types/storage"

export const ORDER_INDEX_START = 1024
export const ORDER_INDEX_STEP = 1024

export function getTaskOrderValue(task: Pick<Task, "orderIndex" | "createdAt">): number {
  if (Number.isFinite(task.orderIndex)) return task.orderIndex
  return toTs(task.createdAt)
}

export function getOrderIndexBetween(prev: number | null, next: number | null, options: {start?: number; step?: number} = {}): number | null {
  const {start = ORDER_INDEX_START, step = ORDER_INDEX_STEP} = options

  if (prev === null && next === null) return start
  if (prev === null) return Math.floor(next! - step)
  if (next === null) return Math.floor(prev + step)

  const candidate = Math.floor((prev + next) / 2)
  if (candidate <= prev || candidate >= next) return null

  return candidate
}

export function sortTasksByOrderIndex<T extends Pick<Task, "id" | "orderIndex" | "createdAt">>(tasks: T[]): T[] {
  return tasks.toSorted((a, b) => {
    const orderDiff = getTaskOrderValue(a) - getTaskOrderValue(b)
    if (orderDiff !== 0) return orderDiff

    const createdAtDiff = toTs(a.createdAt) - toTs(b.createdAt)
    if (createdAtDiff !== 0) return createdAtDiff

    return a.id.localeCompare(b.id)
  })
}

export function getNextTaskOrderIndex(tasks: Pick<Task, "orderIndex" | "createdAt">[], step = ORDER_INDEX_STEP): number {
  if (!tasks.length) return ORDER_INDEX_START

  const maxOrder = tasks.reduce((max, task) => Math.max(max, getTaskOrderValue(task)), Number.NEGATIVE_INFINITY)
  return maxOrder + step
}

export function getPreviousTaskOrderIndex(tasks: Pick<Task, "orderIndex" | "createdAt">[], step = ORDER_INDEX_STEP): number {
  if (!tasks.length) return ORDER_INDEX_START

  const minOrder = tasks.reduce((min, task) => Math.min(min, getTaskOrderValue(task)), Number.POSITIVE_INFINITY)
  return minOrder - step
}

export function normalizeTaskOrderIndexes<T extends Pick<Task, "id" | "orderIndex" | "createdAt">>(
  tasks: T[],
  options: {start?: number; step?: number} = {},
) {
  const {start = ORDER_INDEX_START, step = ORDER_INDEX_STEP} = options
  const sorted = sortTasksByOrderIndex(tasks)

  return sorted.map((task, index) => ({
    id: task.id,
    orderIndex: start + index * step,
  }))
}
