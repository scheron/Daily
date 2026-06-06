// @ts-nocheck
import {describe, expect, it} from "vitest"

import {redactAiMessagesForLog, redactToolParamsForLog} from "@main/ai/utils/redact"

describe("redactAiMessagesForLog", () => {
  it("returns counts and shape without content text", () => {
    const out = redactAiMessagesForLog([
      {role: "system", content: "secret prompt"},
      {role: "user", content: "user task"},
    ])
    expect(out.count).toBe(2)
    expect(out.roles[0].role).toBe("system")
    expect(out.roles[0].contentLength).toBe("secret prompt".length)
    expect(JSON.stringify(out)).not.toContain("secret prompt")
  })

  it("captures tool call names without their arguments", () => {
    const out = redactAiMessagesForLog([
      {
        role: "assistant",
        content: null,
        tool_calls: [{id: "c1", type: "function", function: {name: "delete_task", arguments: {task_id: "secret"}}}],
      } as any,
    ])
    expect(out.roles[0].toolCallNames).toEqual(["delete_task"])
    expect(JSON.stringify(out)).not.toContain("secret")
  })
})

describe("redactToolParamsForLog", () => {
  it("keeps tool name and param keys but no values", () => {
    const out = redactToolParamsForLog("create_task", {content: "buy milk", date: "2026-03-25"})
    expect(out).toEqual({toolName: "create_task", paramKeys: ["content", "date"]})
  })

  it("parses string JSON params", () => {
    const out = redactToolParamsForLog("create_task", '{"content":"x","date":"y"}')
    expect(out.paramKeys).toEqual(["content", "date"])
  })

  it("returns empty keys for non-object params", () => {
    expect(redactToolParamsForLog("x", null).paramKeys).toEqual([])
    expect(redactToolParamsForLog("x", undefined).paramKeys).toEqual([])
    expect(redactToolParamsForLog("x", "not-json").paramKeys).toEqual([])
  })
})
