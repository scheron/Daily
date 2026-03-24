// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {debounce} from "@shared/utils/common/debounce"

describe("debounce", () => {
  it("only executes the last call after the delay when called rapidly", () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced("a")
    debounced("b")
    debounced("c")

    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith("c")
    vi.useRealTimers()
  })

  it("clear() cancels a pending call", () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced("x")
    debounced.clear()
    vi.advanceTimersByTime(300)

    expect(fn).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("immediate() executes synchronously and cancels any pending call", () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced("pending")
    debounced.immediate("now")

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith("now")

    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
