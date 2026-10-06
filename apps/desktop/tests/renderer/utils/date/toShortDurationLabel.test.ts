import {describe, expect, it} from "vitest"

import {toShortDurationLabel} from "../../../../src/renderer/src/utils/date/toShortDurationLabel"

describe("toShortDurationLabel", () => {
  it("returns_an_empty_label_for_no_duration", () => {
    expect(toShortDurationLabel(0)).toBe("")
    expect(toShortDurationLabel(-60)).toBe("")
  })

  it("joins_hours_and_minutes_dropping_the_zero_parts", () => {
    expect(toShortDurationLabel(2700)).toBe("45m")
    expect(toShortDurationLabel(4800)).toBe("1h 20m")
    expect(toShortDurationLabel(14400)).toBe("4h")
  })

  it("rounds_to_the_nearest_minute_and_carries_into_the_hour", () => {
    expect(toShortDurationLabel(3570)).toBe("1h")
    expect(toShortDurationLabel(7170)).toBe("2h")
    expect(toShortDurationLabel(89)).toBe("1m")
    expect(toShortDurationLabel(91)).toBe("2m")
  })

  it("shows_a_sub_minute_duration_as_one_minute", () => {
    expect(toShortDurationLabel(20)).toBe("1m")
  })

  it("splits_whole_days_off_at_24_hours", () => {
    expect(toShortDurationLabel(23 * 3600 + 59 * 60)).toBe("23h 59m")
    expect(toShortDurationLabel(24 * 3600)).toBe("1d")
    expect(toShortDurationLabel(26 * 3600 + 30 * 60)).toBe("1d 2h 30m")
  })
})
