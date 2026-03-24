// @ts-nocheck
import {describe, expect, it} from "vitest"

import {
  toDay,
  toDurationLabel,
  toFullDate,
  toISODate,
  toISODateTime,
  toLocaleDateRange,
  toLocaleDateTime,
  toLocaleTime,
  toMonthYear,
  toTs,
} from "@shared/utils/date/formatters"

describe("date formatters", () => {
  describe("toTs", () => {
    it("converts ISO datetime string to millisecond timestamp", () => {
      const ts = toTs("2026-01-01T00:00:00.000Z")
      expect(ts).toBe(Date.parse("2026-01-01T00:00:00.000Z"))
    })

    it("returns 0 for undefined", () => {
      expect(toTs(undefined)).toBe(0)
    })

    it("returns 0 for invalid date string", () => {
      expect(toTs("not-a-date")).toBe(0)
    })
  })

  describe("toISODateTime", () => {
    it("converts timestamp to ISO datetime string", () => {
      const ts = Date.parse("2026-01-01T00:00:00.000Z")
      expect(toISODateTime(ts)).toBe("2026-01-01T00:00:00.000Z")
    })
  })

  describe("toISODate", () => {
    it("converts timestamp to YYYY-MM-DD string", () => {
      const ts = Date.parse("2026-01-15T00:00:00.000Z")
      const result = toISODate(ts)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it("converts Date object to YYYY-MM-DD string", () => {
      const date = new Date("2026-06-15T00:00:00.000Z")
      const result = toISODate(date)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it("returns string as-is when passed a string", () => {
      expect(toISODate("2026-03-24")).toBe("2026-03-24")
    })
  })

  describe("toDay", () => {
    it("returns numeric day from ISO date", () => {
      expect(toDay("2026-03-24")).toBe(24)
      expect(toDay("2026-01-01")).toBe(1)
    })
  })

  describe("toFullDate", () => {
    it("returns a non-empty string for a valid date", () => {
      const result = toFullDate("2026-01-01")
      expect(typeof result).toBe("string")
      expect(result.length).toBeGreaterThan(0)
    })

    it("respects short option (no weekday)", () => {
      const full = toFullDate("2026-01-01", {short: false})
      const short = toFullDate("2026-01-01", {short: true})
      expect(full.length).toBeGreaterThanOrEqual(short.length)
    })
  })

  describe("toMonthYear", () => {
    it("returns a string containing year", () => {
      const result = toMonthYear("2026-03-24")
      expect(result).toContain("2026")
    })
  })

  describe("toDurationLabel", () => {
    it("returns '<1 min.' for 0 seconds", () => {
      expect(toDurationLabel(0)).toBe("<1 min.")
    })

    it("returns minutes for small durations", () => {
      expect(toDurationLabel(90)).toBe("2 min.")
    })

    it("returns hours and minutes", () => {
      expect(toDurationLabel(3660)).toBe("1 h. 1 min.")
    })

    it("returns days and hours for large durations", () => {
      expect(toDurationLabel(90000)).toBe("1 d. 1 h.")
    })

    it("returns only minutes when exactly 30 seconds rounds up", () => {
      expect(toDurationLabel(30)).toBe("1 min.")
    })
  })

  describe("toLocaleDateTime", () => {
    it("returns a formatted datetime string", () => {
      const result = toLocaleDateTime(new Date("2026-01-15T10:30:45.000Z"))
      expect(typeof result).toBe("string")
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe("toLocaleTime", () => {
    it("returns HH:mm:ss formatted string", () => {
      const result = toLocaleTime(new Date("2026-01-15T10:30:45.000Z"))
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    })
  })

  describe("toLocaleDateRange", () => {
    it("returns empty string for null range", () => {
      expect(toLocaleDateRange(null)).toBe("")
    })

    it("returns single date when end is null", () => {
      const result = toLocaleDateRange([new Date("2026-01-01"), null])
      expect(typeof result).toBe("string")
      expect(result.length).toBeGreaterThan(0)
    })

    it("returns range with dash when both dates provided", () => {
      const result = toLocaleDateRange([new Date("2026-01-01"), new Date("2026-01-15")])
      expect(result).toContain("—")
    })
  })
})
