// @ts-nocheck
import {describe, expect, it} from "vitest"

import {TurnBuilder} from "@main/ai/turns/TurnBuilder"

describe("TurnBuilder", () => {
  it("creates a turn with status 'running' and empty steps", () => {
    const b = new TurnBuilder("hi")
    const s = b.snapshot()
    expect(s.status).toBe("running")
    expect(s.userMessage).toBe("hi")
    expect(s.steps).toEqual([])
    expect(s.id).toBeTruthy()
    expect(s.startedAt).toBeGreaterThan(0)
  })

  it("appends typed steps with auto id and timestamp", () => {
    const b = new TurnBuilder("hi")
    b.appendStep({type: "respond", text: "Done."})
    const s = b.snapshot()
    expect(s.steps).toHaveLength(1)
    expect(s.steps[0]).toMatchObject({type: "respond", text: "Done."})
    expect(s.steps[0].id).toBeTruthy()
    expect(s.steps[0].createdAt).toBeGreaterThan(0)
  })

  it("sets finishedAt when transitioning to a terminal status", () => {
    const b = new TurnBuilder("hi")
    b.setStatus("completed")
    expect(b.snapshot().finishedAt).toBeGreaterThan(0)
  })

  it("does not set finishedAt for waiting_confirmation", () => {
    const b = new TurnBuilder("hi")
    b.setStatus("waiting_confirmation")
    expect(b.snapshot().finishedAt).toBeUndefined()
  })

  it("captures finalMessage and error fields independently", () => {
    const b = new TurnBuilder("hi")
    b.setFinalMessage("All done.")
    b.setError("Tool X failed")
    const s = b.snapshot()
    expect(s.finalMessage).toBe("All done.")
    expect(s.error).toBe("Tool X failed")
  })

  it("snapshot is a deep clone — mutating it does not affect the builder", () => {
    const b = new TurnBuilder("hi")
    b.appendStep({type: "respond", text: "ok"})
    const s = b.snapshot()
    s.steps.push({id: "x", type: "error", createdAt: 0, message: "tampered"} as any)
    expect(b.snapshot().steps).toHaveLength(1)
  })
})
