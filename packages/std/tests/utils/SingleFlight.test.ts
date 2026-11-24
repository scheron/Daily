import {describe, expect, it, vi} from "vitest"

import {withResolvers} from "../../src/utils/common/withResolvers"
import {SingleFlight} from "../../src/utils/SingleFlight"

describe("SingleFlight", () => {
  it("shares one in-flight execution across concurrent callers for the same key", async () => {
    const flight = new SingleFlight<string>()
    const deferred = withResolvers<string>()
    const work = vi.fn(() => deferred.promise)

    const first = flight.run("task-1", work)
    const second = flight.run("task-1", work)

    expect(work).toHaveBeenCalledTimes(1)
    expect(flight.has("task-1")).toBe(true)
    expect(flight.size).toBe(1)

    deferred.resolve("ok")
    await expect(Promise.all([first, second])).resolves.toEqual(["ok", "ok"])
    expect(flight.has("task-1")).toBe(false)
    expect(flight.size).toBe(0)
  })

  it("runs different keys concurrently without sharing promises", async () => {
    const flight = new SingleFlight<string>()
    const a = withResolvers<number>()
    const b = withResolvers<number>()

    const first = flight.run("a", () => a.promise)
    const second = flight.run("b", () => b.promise)

    expect(flight.size).toBe(2)

    b.resolve(2)
    a.resolve(1)
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2])
  })

  it("propagates rejection to all waiting callers and clears the key for retry", async () => {
    const flight = new SingleFlight<string>()
    const deferred = withResolvers<string>()
    const work = vi.fn().mockReturnValueOnce(deferred.promise).mockResolvedValueOnce("recovered")

    const first = flight.run("task-1", work)
    const second = flight.run("task-1", work)

    deferred.reject(new Error("boom"))
    await expect(first).rejects.toThrow("boom")
    await expect(second).rejects.toThrow("boom")
    expect(flight.has("task-1")).toBe(false)

    await expect(flight.run("task-1", work)).resolves.toBe("recovered")
    expect(work).toHaveBeenCalledTimes(2)
  })

  it("turns a synchronous throw into a rejection without leaving the key stuck", async () => {
    const flight = new SingleFlight<string>()

    await expect(
      flight.run("task-1", () => {
        throw new Error("sync failure")
      }),
    ).rejects.toThrow("sync failure")
    expect(flight.has("task-1")).toBe(false)
  })

  it("does not let a cleared old flight delete a newer flight for the same key", async () => {
    const flight = new SingleFlight<string>()
    const stale = withResolvers<string>()
    const fresh = withResolvers<string>()

    const first = flight.run("task-1", () => stale.promise)
    flight.clear()
    const second = flight.run("task-1", () => fresh.promise)

    stale.resolve("old")
    await expect(first).resolves.toBe("old")
    expect(flight.has("task-1")).toBe(true)

    const third = flight.run("task-1", () => Promise.resolve("unexpected"))
    fresh.resolve("new")
    await expect(Promise.all([second, third])).resolves.toEqual(["new", "new"])
    expect(flight.has("task-1")).toBe(false)
  })
})
