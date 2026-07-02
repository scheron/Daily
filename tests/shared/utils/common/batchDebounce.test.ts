// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {batchDebounce} from "@shared/utils/common/batchDebounce"

const sumReduce = (acc: number, item: number) => acc + item
const concatReduce = (acc: string, item: string) => acc + item

describe("batchDebounce", () => {
  it("coalesces rapid calls into a single flush with the accumulated batch", () => {
    vi.useFakeTimers()
    const flush = vi.fn()
    const schedule = batchDebounce<number>(flush, 200, sumReduce, 0)

    schedule(1)
    schedule(2)
    schedule(3)

    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(flush).toHaveBeenCalledOnce()
    expect(flush).toHaveBeenCalledWith(6)
    vi.useRealTimers()
  })

  it("resets the batch after each flush", () => {
    vi.useFakeTimers()
    const flush = vi.fn()
    const schedule = batchDebounce<string>(flush, 100, concatReduce, "")

    schedule("a")
    schedule("b")
    vi.advanceTimersByTime(100)
    expect(flush).toHaveBeenLastCalledWith("ab")

    schedule("c")
    vi.advanceTimersByTime(100)
    expect(flush).toHaveBeenLastCalledWith("c")
    expect(flush).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it("clear() cancels the pending flush and drops the batch", () => {
    vi.useFakeTimers()
    const flush = vi.fn()
    const schedule = batchDebounce<number>(flush, 200, sumReduce, 0)

    schedule(10)
    schedule(20)
    schedule.clear()
    vi.advanceTimersByTime(300)

    expect(flush).not.toHaveBeenCalled()

    schedule(5)
    vi.advanceTimersByTime(200)
    expect(flush).toHaveBeenCalledWith(5)
    vi.useRealTimers()
  })

  it("immediate() fires the accumulated batch synchronously and resets", () => {
    vi.useFakeTimers()
    const flush = vi.fn()
    const schedule = batchDebounce<number>(flush, 200, sumReduce, 0)

    schedule(7)
    schedule(3)
    schedule.immediate()

    expect(flush).toHaveBeenCalledOnce()
    expect(flush).toHaveBeenCalledWith(10)

    vi.advanceTimersByTime(300)
    expect(flush).toHaveBeenCalledOnce()

    schedule(1)
    vi.advanceTimersByTime(200)
    expect(flush).toHaveBeenLastCalledWith(1)
    vi.useRealTimers()
  })

  it("immediate() on empty batch flushes with the initial value", () => {
    vi.useFakeTimers()
    const flush = vi.fn()
    const schedule = batchDebounce<number>(flush, 200, sumReduce, 0)

    schedule.immediate()

    expect(flush).toHaveBeenCalledOnce()
    expect(flush).toHaveBeenCalledWith(0)
    vi.useRealTimers()
  })
})
