// @ts-nocheck
import {describe, expect, it} from "vitest"

import {isEqual, isNewer, isNewerOrEqual, isOlder, isOlderOrEqual} from "@shared/utils/date/validators"

const T1 = "2026-01-01T00:00:00.000Z"
const T2 = "2026-06-01T00:00:00.000Z"

describe("date validators", () => {
  describe("isNewer", () => {
    it("returns true when a is newer than b", () => {
      expect(isNewer(T2, T1)).toBe(true)
    })

    it("returns false when a is older than b", () => {
      expect(isNewer(T1, T2)).toBe(false)
    })

    it("returns false when timestamps are equal", () => {
      expect(isNewer(T1, T1)).toBe(false)
    })
  })

  describe("isOlder", () => {
    it("returns true when a is older than b", () => {
      expect(isOlder(T1, T2)).toBe(true)
    })

    it("returns false when a is newer than b", () => {
      expect(isOlder(T2, T1)).toBe(false)
    })

    it("returns false when equal", () => {
      expect(isOlder(T1, T1)).toBe(false)
    })
  })

  describe("isEqual", () => {
    it("returns true for same timestamp strings", () => {
      expect(isEqual(T1, T1)).toBe(true)
    })

    it("returns false for different timestamps", () => {
      expect(isEqual(T1, T2)).toBe(false)
    })
  })

  describe("isNewerOrEqual", () => {
    it("returns true when a is newer", () => {
      expect(isNewerOrEqual(T2, T1)).toBe(true)
    })

    it("returns true when equal", () => {
      expect(isNewerOrEqual(T1, T1)).toBe(true)
    })

    it("returns false when a is older", () => {
      expect(isNewerOrEqual(T1, T2)).toBe(false)
    })
  })

  describe("isOlderOrEqual", () => {
    it("returns true when a is older", () => {
      expect(isOlderOrEqual(T1, T2)).toBe(true)
    })

    it("returns true when equal", () => {
      expect(isOlderOrEqual(T1, T1)).toBe(true)
    })

    it("returns false when a is newer", () => {
      expect(isOlderOrEqual(T2, T1)).toBe(false)
    })
  })
})
