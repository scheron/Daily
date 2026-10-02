import {describe, expect, it} from "vitest"

import {parseDayMonth} from "../../../../src/renderer/src/ui/common/misc/MarkdownEditor/utils/parseDayMonth"

describe("parseDayMonth", () => {
  it("reads dd.mm as the next such day, rolling into next year once it has passed", () => {
    expect(parseDayMonth("05.10", "2026-10-02")).toBe("2026-10-05")
    expect(parseDayMonth("02.10", "2026-10-02")).toBe("2026-10-02")
    expect(parseDayMonth("1.3", "2026-10-02")).toBe("2027-03-01")
  })

  it("finds the next 29 Feb even when it is years away", () => {
    expect(parseDayMonth("29.02", "2026-10-02")).toBe("2028-02-29")
    expect(parseDayMonth("29.02", "2096-10-02")).toBe("2104-02-29")
    expect(parseDayMonth("29.02", "2028-02-29")).toBe("2028-02-29")
  })

  it("rejects text that is not a real calendar day", () => {
    expect(parseDayMonth("31.02", "2026-10-02")).toBeNull()
    expect(parseDayMonth("tomorrow", "2026-10-02")).toBeNull()
  })
})
