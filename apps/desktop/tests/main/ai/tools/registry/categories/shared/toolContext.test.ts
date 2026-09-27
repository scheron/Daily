// @ts-nocheck
import {DateTime} from "luxon"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {getTimezone} from "@daily/std"

import {buildToolContext} from "../../../../../../../src/main/ai/tools/registry/categories/shared/toolContext"

function fakeStorage(workStorage = {resolveAssetPath: async () => null}) {
  return {workStorage}
}

describe("buildToolContext", () => {
  it("attributes every shared tool call as the Assistant's own — {kind: 'agent'} — never an MCP agent's", () => {
    const ctx = buildToolContext(fakeStorage())
    expect(ctx.source).toEqual({kind: "agent"})
  })

  it("gives the tool this Mac's own WorkStorage, unwrapped", () => {
    const workStorage = {marker: "this-is-the-real-one"}
    const ctx = buildToolContext(fakeStorage(workStorage))
    expect(ctx.workStorage).toBe(workStorage)
  })

  describe("the clock", () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-03-24T10:15:30Z"))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("reads this Mac's own local time zone, not a fixed or UTC one", () => {
      const ctx = buildToolContext(fakeStorage())
      const now = DateTime.now().setZone(getTimezone())

      expect(ctx.clock.timeZone).toBe(getTimezone())
      expect(ctx.clock.today()).toBe(now.toISODate())
      expect(ctx.clock.scheduledNow()).toEqual({date: now.toISODate(), time: now.toFormat("HH:mm:ss"), timezone: getTimezone()})
      expect(ctx.clock.dayStart(now.toISODate())).toBe(DateTime.fromISO(now.toISODate(), {zone: getTimezone()}).startOf("day").toUTC().toISO())
    })

    it("reads the clock fresh on every call, not one frozen at construction time", () => {
      const ctx = buildToolContext(fakeStorage())
      const firstDate = DateTime.now().setZone(getTimezone()).toISODate()
      expect(ctx.clock.today()).toBe(firstDate)

      vi.setSystemTime(new Date("2026-04-25T10:15:30Z"))
      const secondDate = DateTime.now().setZone(getTimezone()).toISODate()

      expect(secondDate).not.toBe(firstDate)
      expect(ctx.clock.today()).toBe(secondDate)
    })
  })

  describe("the local files port", () => {
    it("awaits afterSave's effect before resolving, and propagates a failed write", async () => {
      const ctx = buildToolContext(fakeStorage())

      let effectRan = false
      await ctx.files.afterSave({id: "f1"}, async () => {
        effectRan = true
      })
      expect(effectRan).toBe(true)

      await expect(
        ctx.files.afterSave({id: "f2"}, async () => {
          throw new Error("disk is full")
        }),
      ).rejects.toThrow("disk is full")
    })
  })
})
