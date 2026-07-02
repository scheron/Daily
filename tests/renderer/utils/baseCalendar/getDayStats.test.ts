import {describe, expect, it} from "vitest"

import {getDayStats} from "@renderer/utils/days/getDayStats"

describe("getDayStats", () => {
  const task = {id: "t"} as never

  it("returns zeros for null/undefined", () => {
    expect(getDayStats(null)).toEqual({active: 0, discarded: 0, done: 0})
    expect(getDayStats(undefined)).toEqual({active: 0, discarded: 0, done: 0})
  })

  it("derives discarded as total minus active minus done", () => {
    const day = {date: "2026-06-18", tasks: [task, task, task], countActive: 1, countDone: 1} as never
    expect(getDayStats(day)).toEqual({active: 1, discarded: 1, done: 1})
  })

  it("handles all-active and empty days", () => {
    expect(getDayStats({date: "x", tasks: [task, task], countActive: 2, countDone: 0} as never)).toEqual({active: 2, discarded: 0, done: 0})
    expect(getDayStats({date: "x", tasks: [], countActive: 0, countDone: 0} as never)).toEqual({active: 0, discarded: 0, done: 0})
  })
})
