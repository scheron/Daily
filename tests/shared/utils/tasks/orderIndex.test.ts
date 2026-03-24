// @ts-nocheck
import {describe, expect, it} from "vitest"

import {
  getNextTaskOrderIndex,
  getOrderIndexBetween,
  getTaskOrderValue,
  normalizeTaskOrderIndexes,
  ORDER_INDEX_START,
  ORDER_INDEX_STEP,
  sortTasksByOrderIndex,
} from "@shared/utils/tasks/orderIndex"

function makeTask(overrides: {id?: string; orderIndex?: number; createdAt?: string} = {}) {
  return {
    id: overrides.id ?? "task-1",
    orderIndex: overrides.orderIndex ?? 1024,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  }
}

describe("getTaskOrderValue", () => {
  it("returns orderIndex when finite", () => {
    expect(getTaskOrderValue(makeTask({orderIndex: 500}))).toBe(500)
  })

  it("falls back to createdAt timestamp when orderIndex is not finite", () => {
    const task = makeTask({orderIndex: NaN, createdAt: "2026-03-24T12:00:00.000Z"})

    expect(getTaskOrderValue(task)).toBe(Date.parse("2026-03-24T12:00:00.000Z"))
  })
})

describe("getOrderIndexBetween", () => {
  it("returns start when both prev and next are null", () => {
    expect(getOrderIndexBetween(null, null)).toBe(ORDER_INDEX_START)
  })

  it("returns next - step when prev is null", () => {
    expect(getOrderIndexBetween(null, 2048)).toBe(2048 - ORDER_INDEX_STEP)
  })

  it("returns prev + step when next is null", () => {
    expect(getOrderIndexBetween(1024, null)).toBe(1024 + ORDER_INDEX_STEP)
  })

  it("returns midpoint between prev and next", () => {
    expect(getOrderIndexBetween(1000, 2000)).toBe(1500)
  })

  it("returns null when there is no room between prev and next", () => {
    expect(getOrderIndexBetween(100, 101)).toBeNull()
  })

  it("floors the midpoint result", () => {
    expect(getOrderIndexBetween(100, 103)).toBe(101)
  })

  it("respects custom start and step", () => {
    expect(getOrderIndexBetween(null, null, {start: 500})).toBe(500)
    expect(getOrderIndexBetween(100, null, {step: 10})).toBe(110)
  })
})

describe("sortTasksByOrderIndex", () => {
  it("sorts by orderIndex ascending", () => {
    const tasks = [makeTask({id: "c", orderIndex: 3000}), makeTask({id: "a", orderIndex: 1000}), makeTask({id: "b", orderIndex: 2000})]

    expect(sortTasksByOrderIndex(tasks).map((t) => t.id)).toEqual(["a", "b", "c"])
  })

  it("falls back to createdAt then id when orderIndex is equal", () => {
    const tasks = [
      makeTask({id: "b", orderIndex: 1000, createdAt: "2026-01-02T00:00:00.000Z"}),
      makeTask({id: "a", orderIndex: 1000, createdAt: "2026-01-01T00:00:00.000Z"}),
    ]

    expect(sortTasksByOrderIndex(tasks).map((t) => t.id)).toEqual(["a", "b"])
  })
})

describe("getNextTaskOrderIndex", () => {
  it("returns start for empty array", () => {
    expect(getNextTaskOrderIndex([])).toBe(ORDER_INDEX_START)
  })

  it("returns max orderIndex + step", () => {
    const tasks = [makeTask({orderIndex: 1000}), makeTask({orderIndex: 3000})]

    expect(getNextTaskOrderIndex(tasks)).toBe(3000 + ORDER_INDEX_STEP)
  })
})

describe("normalizeTaskOrderIndexes", () => {
  it("sorts and reassigns order indexes with even spacing", () => {
    const tasks = [makeTask({id: "c", orderIndex: 3}), makeTask({id: "a", orderIndex: 1}), makeTask({id: "b", orderIndex: 2})]
    const result = normalizeTaskOrderIndexes(tasks)

    expect(result).toEqual([
      {id: "a", orderIndex: ORDER_INDEX_START},
      {id: "b", orderIndex: ORDER_INDEX_START + ORDER_INDEX_STEP},
      {id: "c", orderIndex: ORDER_INDEX_START + 2 * ORDER_INDEX_STEP},
    ])
  })

  it("respects custom start and step", () => {
    const tasks = [makeTask({id: "a", orderIndex: 1}), makeTask({id: "b", orderIndex: 2})]

    expect(normalizeTaskOrderIndexes(tasks, {start: 100, step: 50})).toEqual([
      {id: "a", orderIndex: 100},
      {id: "b", orderIndex: 150},
    ])
  })
})
