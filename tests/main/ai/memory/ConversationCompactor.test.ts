// @ts-nocheck
import {describe, expect, it} from "vitest"

import {ConversationCompactor} from "@main/ai/memory/ConversationCompactor"

function msgs(count: number) {
  return Array.from({length: count}, (_, i) => ({role: i % 2 === 0 ? "user" : "assistant", content: `m${i}`}))
}

describe("ConversationCompactor", () => {
  it("hook returns messages unchanged when no summary cached", () => {
    const c = new ConversationCompactor()
    const hook = c.makeHook({threshold: 4, keepLastMessages: 2})
    const input = msgs(10)
    expect(hook(input)).toBe(input)
  })

  it("hook returns messages unchanged when count is below threshold", () => {
    const c = new ConversationCompactor()
    c.refresh([{id: "t1", userMessage: "x", status: "completed", finalMessage: "ok", startedAt: 0, finishedAt: 1, steps: []}])
    const hook = c.makeHook({threshold: 100, keepLastMessages: 5})
    const input = msgs(10)
    expect(hook(input)).toBe(input)
  })

  it("hook keeps system prefix, splices summary, and trims body to keepLast", () => {
    const c = new ConversationCompactor()
    c.refresh([{id: "t1", userMessage: "first", status: "completed", finalMessage: "Done.", startedAt: 0, finishedAt: 1, steps: []}])
    const hook = c.makeHook({threshold: 4, keepLastMessages: 3})
    const sys = [{role: "system", content: "main-prompt"}]
    const body = msgs(10)
    const out = hook([...sys, ...body])
    // 1 main system + 1 summary system + last 3 body messages
    expect(out).toHaveLength(5)
    expect(out[0].role).toBe("system")
    expect(out[0].content).toBe("main-prompt")
    expect(out[1].role).toBe("system")
    expect(out[1].content).toMatch(/Session memory summary/)
    expect(out[2].content).toBe("m7")
    expect(out[3].content).toBe("m8")
    expect(out[4].content).toBe("m9")
  })

  it("handles no leading system messages gracefully", () => {
    const c = new ConversationCompactor()
    c.refresh([{id: "t1", userMessage: "x", status: "completed", finalMessage: "ok", startedAt: 0, finishedAt: 1, steps: []}])
    const hook = c.makeHook({threshold: 2, keepLastMessages: 2})
    const out = hook(msgs(6))
    // No prefix, summary, last 2 body messages
    expect(out).toHaveLength(3)
    expect(out[0].role).toBe("system")
    expect(out[0].content).toMatch(/Session memory summary/)
  })
})
