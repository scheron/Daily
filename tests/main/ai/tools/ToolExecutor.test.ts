// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {ToolExecutor} from "@main/ai/tools/ToolExecutor"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

describe("ToolExecutor (registry-backed)", () => {
  it("returns error for unknown tool", async () => {
    const exec = new ToolExecutor({} as any)
    const r = await exec.execute("nonexistent_tool" as any, {}, "in-app")
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/unknown/i)
  })

  it("dispatches to a registered tool's execute", async () => {
    const fakeStorage = {
      getTagList: vi.fn(async () => []),
    } as any
    const exec = new ToolExecutor(fakeStorage)
    const r = await exec.execute("list_tags" as any, {}, "in-app")
    expect(r).toHaveProperty("success")
    expect(r.success).toBe(true)
    expect(fakeStorage.getTagList).toHaveBeenCalled()
  })

  it("normalizes thrown errors from tool.execute into ToolResult", async () => {
    const fakeStorage = {
      getTagList: vi.fn(async () => {
        throw new Error("boom")
      }),
    } as any
    const exec = new ToolExecutor(fakeStorage)
    const r = await exec.execute("list_tags" as any, {}, "in-app")
    expect(r.success).toBe(false)
    expect(r.error).toBe("boom")
  })
})
