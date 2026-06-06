// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {McpToolDispatcher} from "@main/mcp/tools/dispatcher"
import {buildMcpToolRegistry} from "@main/mcp/tools/registry"

vi.mock("@main/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    CONTEXT: {MCP: "MCP"},
  },
}))

function makeExecutor(impl: (name: string, params: any) => any) {
  return {execute: vi.fn(async (name: string, params: any) => impl(name, params))}
}

describe("McpToolDispatcher", () => {
  it("delegates to ToolExecutor for an allowed tool", async () => {
    const executor = makeExecutor(() => ({success: true, data: {ok: 1}}))
    const d = new McpToolDispatcher(buildMcpToolRegistry(), executor as any)

    const r = await d.call("list_tasks", {})
    expect(executor.execute).toHaveBeenCalledWith("list_tasks", {}, "mcp")
    expect(r).toEqual({success: true, data: {ok: 1}})
  })

  it("rejects a blocked tool without calling executor", async () => {
    const executor = makeExecutor(() => ({success: true}))
    const d = new McpToolDispatcher(buildMcpToolRegistry(), executor as any)

    const r = await d.call("permanently_delete_task", {task_id: "x"})
    expect(executor.execute).not.toHaveBeenCalled()
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/not exposed/i)
  })

  it("rejects an unknown tool without calling executor", async () => {
    const executor = makeExecutor(() => ({success: true}))
    const d = new McpToolDispatcher(buildMcpToolRegistry(), executor as any)

    const r = await d.call("imaginary_tool", {})
    expect(executor.execute).not.toHaveBeenCalled()
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/unknown/i)
  })

  it("normalizes thrown errors from executor into ToolResult", async () => {
    const executor = makeExecutor(() => {
      throw new Error("boom")
    })
    const d = new McpToolDispatcher(buildMcpToolRegistry(), executor as any)

    const r = await d.call("list_tasks", {})
    expect(r.success).toBe(false)
    expect(r.error).toBe("boom")
  })

  it("passes 'mcp' as the caller to ToolExecutor", async () => {
    const executor = makeExecutor(() => ({success: true}))
    const d = new McpToolDispatcher(buildMcpToolRegistry(), executor as any)

    await d.call("list_tasks", {})
    expect(executor.execute).toHaveBeenCalledWith("list_tasks", {}, "mcp")
  })
})
