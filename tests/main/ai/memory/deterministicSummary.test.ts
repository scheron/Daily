// @ts-nocheck
import {describe, expect, it} from "vitest"

import {summarizeTurns} from "@main/ai/memory/deterministicSummary"

function turn(overrides: any = {}) {
  return {
    id: overrides.id ?? "t1",
    userMessage: overrides.userMessage ?? "do thing",
    status: overrides.status ?? "completed",
    finalMessage: "finalMessage" in overrides ? overrides.finalMessage : "Done.",
    error: overrides.error,
    startedAt: 0,
    finishedAt: 1,
    steps: overrides.steps ?? [],
  }
}

describe("summarizeTurns", () => {
  it("returns empty string for empty input", () => {
    expect(summarizeTurns([])).toBe("")
  })

  it("lists each user message in order", () => {
    const out = summarizeTurns([turn({userMessage: "first"}), turn({userMessage: "second"})])
    expect(out).toContain("1. user: first")
    expect(out).toContain("2. user: second")
  })

  it("includes the assistant finalMessage", () => {
    const out = summarizeTurns([turn({finalMessage: "Created task X."})])
    expect(out).toContain("assistant: Created task X.")
  })

  it("groups changed entities by (action, type)", () => {
    const steps = [
      {
        id: "s1",
        type: "tool_result",
        createdAt: 0,
        toolCallId: "c1",
        toolName: "create_task",
        result: {success: true, changedEntities: [{type: "task", id: "a", action: "created"}]},
      },
      {
        id: "s2",
        type: "tool_result",
        createdAt: 0,
        toolCallId: "c2",
        toolName: "create_task",
        result: {success: true, changedEntities: [{type: "task", id: "b", action: "created"}]},
      },
      {
        id: "s3",
        type: "tool_result",
        createdAt: 0,
        toolCallId: "c3",
        toolName: "delete_task",
        result: {success: true, changedEntities: [{type: "task", id: "c", action: "deleted"}]},
      },
    ]
    const out = summarizeTurns([turn({steps})])
    expect(out).toContain("actions:")
    expect(out).toContain("2x created task")
    expect(out).toContain("1x deleted task")
  })

  it("notes failed/cancelled turns explicitly", () => {
    const failed = turn({status: "failed", finalMessage: undefined, error: "boom"})
    const cancelled = turn({status: "cancelled", finalMessage: undefined})
    const out = summarizeTurns([failed, cancelled])
    expect(out).toContain("(failed: boom)")
    expect(out).toContain("(cancelled)")
  })

  it("truncates long user/assistant text with an ellipsis", () => {
    const longText = "x".repeat(300)
    const out = summarizeTurns([turn({userMessage: longText, finalMessage: longText})])
    expect(out).toMatch(/user: x+…/)
    expect(out).toMatch(/assistant: x+…/)
  })
})
