import {describe, expect, it} from "vitest"

import {
  buildChunk,
  buildChunkRange,
  CHUNK_WIDTH,
  chunkIndexForDate,
  dateAtViewportCenter,
  dayOfMonth,
  DAYS_PER_CHUNK,
  getDayDotStatus,
  LATTICE_EPOCH,
  monthKey,
  scrollLeftForDate,
} from "@renderer/ui/views/Main/{fragments}/Footer/lattice"

describe("lattice chunk math", () => {
  it("anchors chunk 0 at the epoch Monday", () => {
    expect(chunkIndexForDate(LATTICE_EPOCH)).toBe(0)
    expect(buildChunk(0).startDate).toBe("2001-01-01")
  })

  it("puts day 35 into the next chunk", () => {
    expect(chunkIndexForDate("2001-02-04")).toBe(0) // day 34, last of chunk 0
    expect(chunkIndexForDate("2001-02-05")).toBe(1) // day 35, first of chunk 1
  })

  it("handles dates before the epoch", () => {
    expect(chunkIndexForDate("2000-12-31")).toBe(-1)
    expect(buildChunk(-1).weeks[4][6]).toBe("2000-12-31")
  })

  it("builds a 5×7 grid of consecutive dates with the label-defining middle day", () => {
    const chunk = buildChunk(0)
    expect(chunk.weeks).toHaveLength(5)
    chunk.weeks.forEach((week) => expect(week).toHaveLength(7))
    expect(chunk.weeks[0][0]).toBe("2001-01-01")
    expect(chunk.weeks[4][6]).toBe("2001-02-04")
    expect(chunk.middleDate).toBe("2001-01-18")
  })

  it("keeps a month boundary inside a single row", () => {
    // June→July 2026: a row must read Mon Jun 29 .. Sun Jul 5
    const chunk = buildChunk(chunkIndexForDate("2026-06-29"))
    const row = chunk.weeks.find((week) => week[0] === "2026-06-29")
    expect(row).toBeDefined()
    expect(row![6]).toBe("2026-07-05")
  })

  it("renders every date exactly once and gaplessly across a chunk range", () => {
    const chunks = buildChunkRange("2025-12-15", "2026-07-15")
    const all = chunks.flatMap((chunk) => chunk.weeks.flat())
    expect(new Set(all).size).toBe(all.length)
    expect(all).toHaveLength(chunks.length * DAYS_PER_CHUNK)
    expect(all).toContain("2025-12-15")
    expect(all).toContain("2026-07-15")
  })
})

describe("viewport math", () => {
  it("returns the chunk middle date when a chunk fills the viewport", () => {
    const first = chunkIndexForDate("2026-06-11")
    const date = dateAtViewportCenter({scrollLeft: 0, clientWidth: CHUNK_WIDTH, firstChunkIndex: first})
    expect(date).toBe(buildChunk(first).middleDate)
  })

  it("scrollLeftForDate centers the chunk containing the date", () => {
    const first = 100
    const target = buildChunk(103).middleDate
    const scrollLeft = scrollLeftForDate({date: target, firstChunkIndex: first, clientWidth: CHUNK_WIDTH * 3})
    expect(dateAtViewportCenter({scrollLeft, clientWidth: CHUNK_WIDTH * 3, firstChunkIndex: first})).toBe(target)
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
