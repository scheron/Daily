// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {McpServer} from "@main/mcp/McpServer"
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

function makeExecutor(impl?: (name: string, params: any) => any) {
  return {
    execute: vi.fn(async (name: string, params: any) => (impl ? impl(name, params) : {success: true, data: {name, params}})),
  }
}

async function rpc(port: number, token: string, method: string, params?: any) {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params}),
  })
  return {status: res.status, body: await res.json()}
}

describe("McpServer (integration)", () => {
  let server: McpServer

  afterEach(async () => {
    if (server) await server.stop()
  })

  it("starts, reports running status with bound port, and stops cleanly", async () => {
    server = new McpServer({
      executor: makeExecutor() as any,
      appVersion: "test",
    })
    await server.start({enabled: true, host: "127.0.0.1", port: 0, token: "t"})
    const status = server.status()
    expect(status.state).toBe("running")
    if (status.state === "running") {
      expect(status.host).toBe("127.0.0.1")
      expect(status.port).toBeGreaterThan(0)
    }
    await server.stop()
    expect(server.status().state).toBe("stopped")
  })

  it("tools/list returns the registry tool count and excludes blocked ones", async () => {
    server = new McpServer({executor: makeExecutor() as any, appVersion: "test"})
    await server.start({enabled: true, host: "127.0.0.1", port: 0, token: "t"})
    const port = (server.status() as any).port

    const expectedCount = buildMcpToolRegistry().list().length
    const {status, body} = await rpc(port, "t", "tools/list")
    expect(status).toBe(200)
    expect(body.result.tools.length).toBe(expectedCount)
    const names = body.result.tools.map((t: any) => t.name)
    expect(names).not.toContain("permanently_delete_task")
    expect(names).toContain("create_task")
  })

  it("tools/call dispatches to executor and returns its result", async () => {
    const executor = makeExecutor((name, params) => ({
      success: true,
      data: {echoedName: name, echoedParams: params},
    }))
    server = new McpServer({executor: executor as any, appVersion: "test"})
    await server.start({enabled: true, host: "127.0.0.1", port: 0, token: "t"})
    const port = (server.status() as any).port

    const {status, body} = await rpc(port, "t", "tools/call", {
      name: "create_task",
      arguments: {content: "buy milk"},
    })
    expect(status).toBe(200)
    expect(executor.execute).toHaveBeenCalledWith("create_task", {content: "buy milk"})
    expect(body.result).toBeDefined()
  })

  it("tools/call refuses a blocked tool without invoking executor", async () => {
    const executor = makeExecutor()
    server = new McpServer({executor: executor as any, appVersion: "test"})
    await server.start({enabled: true, host: "127.0.0.1", port: 0, token: "t"})
    const port = (server.status() as any).port

    const {body} = await rpc(port, "t", "tools/call", {
      name: "permanently_delete_task",
      arguments: {task_id: "x"},
    })
    expect(executor.execute).not.toHaveBeenCalled()
    expect(JSON.stringify(body)).toMatch(/not exposed/i)
  })

  it("rotateToken invalidates existing token immediately", async () => {
    server = new McpServer({executor: makeExecutor() as any, appVersion: "test"})
    await server.start({enabled: true, host: "127.0.0.1", port: 0, token: "first"})
    const port = (server.status() as any).port

    server.rotateToken("second")
    const r1 = await rpc(port, "first", "tools/list")
    expect(r1.status).toBe(401)
    const r2 = await rpc(port, "second", "tools/list")
    expect(r2.status).toBe(200)
  })

  it("start on busy port transitions to error status", async () => {
    const blocker = new McpServer({executor: makeExecutor() as any, appVersion: "test"})
    await blocker.start({enabled: true, host: "127.0.0.1", port: 0, token: "t"})
    const port = (blocker.status() as any).port

    server = new McpServer({executor: makeExecutor() as any, appVersion: "test"})
    await server.start({enabled: true, host: "127.0.0.1", port, token: "t"})
    expect(server.status().state).toBe("error")

    await blocker.stop()
  })
})
