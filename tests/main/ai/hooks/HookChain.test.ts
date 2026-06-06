// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {HookChain} from "@main/ai/hooks/HookChain"

const ctx = {turnId: "t1", userMessage: "hi", startedAt: 0, messages: []} as any

describe("HookChain", () => {
  it("runBeforeToolCall returns pass when no hooks registered", async () => {
    const chain = new HookChain()
    const r = await chain.runBeforeToolCall(ctx, {} as any)
    expect(r).toEqual({action: "pass"})
  })

  it("runBeforeToolCall calls hooks in registration order until one skips", async () => {
    const chain = new HookChain()
    const h1 = vi.fn(async () => ({action: "pass"}))
    const h2 = vi.fn(async () => ({action: "skip", reason: "blocked"}))
    const h3 = vi.fn(async () => ({action: "pass"}))
    chain.registerBeforeToolCall(h1)
    chain.registerBeforeToolCall(h2)
    chain.registerBeforeToolCall(h3)

    const r = await chain.runBeforeToolCall(ctx, {} as any)
    expect(r).toEqual({action: "skip", reason: "blocked"})
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
    expect(h3).not.toHaveBeenCalled()
  })

  it("runAfterToolCall calls every registered hook", async () => {
    const chain = new HookChain()
    const h1 = vi.fn(async () => {})
    const h2 = vi.fn(async () => {})
    chain.registerAfterToolCall(h1)
    chain.registerAfterToolCall(h2)

    await chain.runAfterToolCall(ctx, {} as any, {success: true})
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it("runTransformContext threads result through all hooks", () => {
    const chain = new HookChain()
    chain.registerTransformContext((msgs) => [...msgs, {role: "system", content: "h1"} as any])
    chain.registerTransformContext((msgs) => [...msgs, {role: "system", content: "h2"} as any])

    const out = chain.runTransformContext([{role: "user", content: "hi"}] as any)
    expect(out).toHaveLength(3)
    expect((out[1] as any).content).toBe("h1")
    expect((out[2] as any).content).toBe("h2")
  })

  it("runTransformContext returns messages unchanged with no hooks", () => {
    const chain = new HookChain()
    const input = [{role: "user", content: "hi"}] as any
    expect(chain.runTransformContext(input)).toBe(input)
  })
})
