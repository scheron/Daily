import {Settings} from "luxon"
import {afterEach, describe, expect, it} from "vitest"

import {getToday} from "@shared/utils/date/getToday"

describe("getToday", () => {
  const realNow = Settings.now
  const realZone = Settings.defaultZone

  afterEach(() => {
    Settings.now = realNow
    Settings.defaultZone = realZone
  })

  it("returns the local calendar date, not the UTC date", () => {
    Settings.defaultZone = "Asia/Tokyo"
    Settings.now = () => Date.UTC(2026, 5, 30, 23, 30)

    expect(getToday()).toBe("2026-07-01")
  })

  it("returns an ISO date in YYYY-MM-DD form", () => {
    expect(getToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
