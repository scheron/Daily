// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {forEachConcurrent} from "@shared/utils/arrays/forEachConcurrent"

describe("forEachConcurrent", () => {
  it("executes the callback for every item in the array", async () => {
    const results: number[] = []
    await forEachConcurrent(
      [1, 2, 3, 4],
      async (item) => {
        results.push(item)
      },
      2,
    )
    expect(results.sort()).toEqual([1, 2, 3, 4])
  })

  it("collects all errors into an AggregateError instead of short-circuiting", async () => {
    const cb = vi.fn(async (item: number) => {
      if (item % 2 === 0) throw new Error(`fail ${item}`)
    })

    await expect(forEachConcurrent([1, 2, 3, 4], cb, 2)).rejects.toBeInstanceOf(AggregateError)

    try {
      await forEachConcurrent([1, 2, 3, 4], cb, 2)
    } catch (err) {
      expect(err.errors).toHaveLength(2)
    }
  })

  it("processes all items when limit >= array length (behaves like Promise.all)", async () => {
    const processed: number[] = []
    await forEachConcurrent(
      [10, 20, 30],
      async (item) => {
        processed.push(item)
      },
      10,
    )
    expect(processed.sort((a, b) => a - b)).toEqual([10, 20, 30])
  })
})
