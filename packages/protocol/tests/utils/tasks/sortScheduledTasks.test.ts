// @ts-nocheck
import {describe, expect, it} from "vitest"

import {sortTasksByDateThenOrder} from "../../../src/utils/tasks/sortScheduledTasks"

describe("sortTasksByDateThenOrder", () => {
  it("orders_TC-3_tasks_by_day_earliest_first_breaking_a_ties_within_a_day_by_manual_order", () => {
    const sep14 = {id: "sep-14", scheduled: {date: "2026-09-14"}, orderIndex: 4096}
    const sep10OrderTwo = {id: "sep-10-order-2", scheduled: {date: "2026-09-10"}, orderIndex: 2}
    const sep10OrderOne = {id: "sep-10-order-1", scheduled: {date: "2026-09-10"}, orderIndex: 1}
    const sep12 = {id: "sep-12", scheduled: {date: "2026-09-12"}, orderIndex: 8192}

    const sorted = sortTasksByDateThenOrder([sep14, sep10OrderTwo, sep10OrderOne, sep12])

    expect(sorted.map((t) => t.id)).toEqual(["sep-10-order-1", "sep-10-order-2", "sep-12", "sep-14"])
  })
})
