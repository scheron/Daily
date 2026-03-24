// @ts-nocheck
import {describe, expect, it} from "vitest"

import {secondsToTime} from "@shared/utils/date/secondsToTime"

describe("secondsToTime", () => {
  it("returns 00:00:00 for zero seconds", () => {
    const {HH, mm, ss} = secondsToTime(0)
    expect(`${HH}:${mm}:${ss}`).toBe("00:00:00")
  })

  it("correctly converts 3661 seconds to 01:01:01", () => {
    const {HH, mm, ss} = secondsToTime(3661)
    expect(`${HH}:${mm}:${ss}`).toBe("01:01:01")
  })

  it("zero-pads single-digit components", () => {
    const {HH, mm, ss} = secondsToTime(90)
    expect(`${HH}:${mm}:${ss}`).toBe("00:01:30")
  })
})
