import {describe, expect, it} from "vitest"

import {buildMonthCounts, buildMonthSections, dayOfMonth, getDayDotStatus, monthKey} from "@renderer/ui/views/Main/{fragments}/Sidebar/monthSections"

describe("buildMonthSections", () => {
  it("covers every month of the range inclusively", () => {
    const sections = buildMonthSections("2025-12-15", "2026-07-02")
    expect(sections.map((section) => section.key)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"])
  })

  it("renders every date of a month exactly once", () => {
    const sections = buildMonthSections("2026-01-10", "2026-03-10")
    const all = sections.flatMap((section) => section.days)
    expect(new Set(all).size).toBe(all.length)
    expect(all).toContain("2026-01-01")
    expect(all).toContain("2026-02-28")
    expect(all).toContain("2026-03-31")
  })

  it("computes leading blanks for a Monday-first grid", () => {
    const [june] = buildMonthSections("2026-06-01", "2026-06-30")
    expect(june.firstDay).toBe("2026-06-01") // Monday
    expect(june.leadingBlanks).toBe(0)
    expect(june.days).toHaveLength(30)

    const [february] = buildMonthSections("2026-02-01", "2026-02-28")
    expect(february.firstDay).toBe("2026-02-01") // Sunday
    expect(february.leadingBlanks).toBe(6)
    expect(february.days).toHaveLength(28)

    const [july] = buildMonthSections("2026-07-05", "2026-07-05")
    expect(july.firstDay).toBe("2026-07-01") // Wednesday
    expect(july.leadingBlanks).toBe(2)
    expect(july.days).toHaveLength(31)
  })
})

describe("buildMonthCounts", () => {
  const task = {id: "t"} as never

  it("aggregates active, discarded, and done per month", () => {
    const counts = buildMonthCounts([
      {date: "2026-06-01", tasks: [task, task, task], countActive: 1, countDone: 1} as never, // 1 discarded
      {date: "2026-06-20", tasks: [task, task], countActive: 2, countDone: 0} as never,
      {date: "2026-07-01", tasks: [task], countActive: 0, countDone: 1} as never,
      {date: "2026-07-02", tasks: [], countActive: 0, countDone: 0} as never,
    ])

    expect(counts.get("2026-06")).toEqual({active: 3, discarded: 1, done: 1})
    expect(counts.get("2026-07")).toEqual({active: 0, discarded: 0, done: 1})
  })

  it("omits months without tasks", () => {
    const counts = buildMonthCounts([{date: "2026-08-01", tasks: [], countActive: 0, countDone: 0} as never])
    expect(counts.has("2026-08")).toBe(false)
  })
})

describe("day helpers", () => {
  const task = {id: "t1"} as never

  it("getDayDotStatus returns null without tasks", () => {
    expect(getDayDotStatus(null)).toBeNull()
    expect(getDayDotStatus(undefined)).toBeNull()
    expect(getDayDotStatus({tasks: [], countActive: 0} as never)).toBeNull()
  })

  it("getDayDotStatus returns 'active' when active tasks remain", () => {
    expect(getDayDotStatus({tasks: [task], countActive: 1} as never)).toBe("active")
  })

  it("getDayDotStatus returns 'done' when tasks exist and none are active", () => {
    expect(getDayDotStatus({tasks: [task], countActive: 0} as never)).toBe("done")
  })

  it("dayOfMonth and monthKey slice ISO dates", () => {
    expect(dayOfMonth("2026-06-09")).toBe(9)
    expect(monthKey("2026-06-09")).toBe("2026-06")
  })
})
