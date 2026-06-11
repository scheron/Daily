import {describe, expect, it} from "vitest"

import {
  buildWeek,
  buildWeekRange,
  dateAtViewportCenter,
  dayOfMonth,
  getDayDotStatus,
  LATTICE_EPOCH,
  monthKey,
  ROW_HEIGHT,
  scrollTopForDate,
  weekIndexForDate,
} from "@renderer/ui/views/Main/{fragments}/Sidebar/weekLattice"

describe("week math", () => {
  it("anchors week 0 at the epoch Monday", () => {
    expect(weekIndexForDate(LATTICE_EPOCH)).toBe(0)
    expect(buildWeek(0).days[0]).toBe("2001-01-01")
    expect(buildWeek(0).days[6]).toBe("2001-01-07")
  })

  it("handles dates before the epoch", () => {
    expect(weekIndexForDate("2000-12-31")).toBe(-1)
    expect(buildWeek(-1).days[6]).toBe("2000-12-31")
  })

  it("keeps a month boundary inside a single row", () => {
    // June→July 2026: the row must read Mon Jun 29 .. Sun Jul 5
    const week = buildWeek(weekIndexForDate("2026-06-29"))
    expect(week.days[0]).toBe("2026-06-29")
    expect(week.days[6]).toBe("2026-07-05")
  })

  it("renders every date exactly once and gaplessly across a range", () => {
    const weeks = buildWeekRange("2025-12-15", "2026-07-15")
    const all = weeks.flatMap((week) => week.days)
    expect(new Set(all).size).toBe(all.length)
    expect(all).toHaveLength(weeks.length * 7)
    expect(all).toContain("2025-12-15")
    expect(all).toContain("2026-07-15")
  })
})

describe("viewport math", () => {
  it("returns the Thursday of the centered row", () => {
    const first = weekIndexForDate("2026-06-11")
    const date = dateAtViewportCenter({scrollTop: 0, clientHeight: ROW_HEIGHT, firstWeekIndex: first})
    expect(date).toBe(buildWeek(first).days[3])
  })

  it("scrollTopForDate centers the row containing the date", () => {
    const first = 100
    const target = buildWeek(108).days[3]
    const scrollTop = scrollTopForDate({date: target, firstWeekIndex: first, clientHeight: ROW_HEIGHT * 11})
    expect(dateAtViewportCenter({scrollTop, clientHeight: ROW_HEIGHT * 11, firstWeekIndex: first})).toBe(target)
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
