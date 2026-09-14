// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {awaitRendererReady} from "../../../src/main/utils/windows/awaitRendererReady"

/**
 * TC-13 · US-7 · gate-b: N/A
 * given: the pure helper that decides when the splash closes
 * when: the readiness signal never arrives
 * then: it settles on the ceiling at about ten seconds, and reports that it timed out rather than
 * that it was signalled
 *
 * NOT-YET-RUNNABLE: `awaitRendererReady` is phase 7's new file and does not exist yet. Written now,
 * against the signature the plan's phase 7 "How" freezes —
 * `awaitRendererReady(signal: Promise<void>, ceilingMs: number): Promise<"signalled" | "timed-out">`
 * — so it starts running the moment that file lands.
 */

describe("awaitRendererReady", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("settles_TC-13_on_the_ten_second_ceiling_as_timed_out_when_the_signal_never_arrives", async () => {
    const neverSignals = new Promise<void>(() => {})

    let settled = false
    let outcome: string | undefined
    const race = awaitRendererReady(neverSignals, 10_000).then((result) => {
      settled = true
      outcome = result
      return result
    })

    await vi.advanceTimersByTimeAsync(9_999)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toBe(true)
    expect(outcome).toBe("timed-out")

    await expect(race).resolves.toBe("timed-out")
  })
})
