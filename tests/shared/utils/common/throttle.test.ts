// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {throttle} from "@shared/utils/common/throttle"

describe("throttle", () => {
  it("coalesces rapid calls into a single trailing run", () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const throttled = throttle(fn, 200)

    throttled("a")
    throttled("b")
    throttled("c")

    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith("a")
    vi.useRealTimers()
  })

  it("keeps flushing during a continuous stream (throttle, not debounce)", () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const throttled = throttle(fn, 200)

    throttled()
    vi.advanceTimersByTime(100)
    throttled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)

    throttled()
    vi.advanceTimersByTime(100)
    throttled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it("clear() cancels a pending run", () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const throttled = throttle(fn, 200)

    throttled("x")
    throttled.clear()
    vi.advanceTimersByTime(300)

    expect(fn).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("immediate() runs synchronously and cancels any pending run", () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const throttled = throttle(fn, 200)

    throttled("pending")
    throttled.immediate("now")

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith("now")

    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
