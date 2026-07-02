// @ts-nocheck
import {describe, expect, it} from "vitest"

import {redactToolParamsForLog} from "@main/ai/utils/logs/redactToolParamsForLog"

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
