// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {ToolExecutor} from "../../../../src/main/ai/tools/ToolExecutor"

vi.mock("@daily/core", async (importOriginal) => ({
  ...(await importOriginal()),
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

function makeFakeStorage(workStorage: Record<string, any>) {
  return {loadSettings: vi.fn(async () => ({})), workStorage} as any
}

describe("ToolExecutor (registry-backed)", () => {
  it("returns error for unknown tool", async () => {
    const exec = new ToolExecutor(makeFakeStorage({}))
    const r = await exec.execute("nonexistent_tool" as any, {}, "in-app")
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/unknown/i)
  })

  it("dispatches a shared tool's run over the host's WorkStorage", async () => {
    const getTagList = vi.fn(async () => [])
    const fakeStorage = makeFakeStorage({getTagList})
    const exec = new ToolExecutor(fakeStorage)
    const r = await exec.execute("list_tags" as any, {}, "in-app")
    expect(r).toHaveProperty("success")
    expect(r.success).toBe(true)
    expect(getTagList).toHaveBeenCalled()
  })

  it("normalizes a ToolError thrown from a shared tool's run into ToolResult, without logging it as an error", async () => {
    const {logger} = await import("@daily/core")
    const fakeStorage = makeFakeStorage({getTask: vi.fn(async () => null)})
    const exec = new ToolExecutor(fakeStorage)
    const r = await exec.execute("get_task" as any, {id: "nope"}, "in-app")
    expect(r.success).toBe(false)
    expect(r.error).toBe('No task "nope".')
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("logs an unexpected (non-ToolError) throw as an error, and still normalizes it into a ToolResult", async () => {
    const {logger} = await import("@daily/core")
    const fakeStorage = makeFakeStorage({
      getTagList: vi.fn(async () => {
        throw new Error("boom")
      }),
    })
    const exec = new ToolExecutor(fakeStorage)
    const r = await exec.execute("list_tags" as any, {}, "in-app")
    expect(r.success).toBe(false)
    expect(r.error).toBe("boom")
    expect(logger.error).toHaveBeenCalledOnce()
  })
})
