// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {BearerAuth} from "@main/mcp/auth/bearerAuth"
import {HttpTransport} from "@main/mcp/transport/HttpTransport"

vi.mock("@main/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    CONTEXT: {MCP: "MCP"},
  },
}))

describe("HttpTransport", () => {
  let transport: HttpTransport
  let handler: any

  beforeEach(async () => {
    handler = vi.fn(async (body) => ({jsonrpc: "2.0", id: body.id, result: {echo: body}}))
    transport = new HttpTransport({
      host: "127.0.0.1",
      port: 0, // OS assigns
      auth: new BearerAuth("good-token"),
      handleJsonRpc: handler,
      appVersion: "test",
    })
    await transport.start()
  })

  afterEach(async () => {
    await transport.stop()
  })

  it("GET /mcp/health returns 200 without auth", async () => {
    const res = await fetch(`http://127.0.0.1:${transport.port}/mcp/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("ok")
  })

  it("POST /mcp without Authorization returns 401", async () => {
    const res = await fetch(`http://127.0.0.1:${transport.port}/mcp`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/list"}),
    })
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("POST /mcp with wrong token returns 401", async () => {
    const res = await fetch(`http://127.0.0.1:${transport.port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer nope",
      },
      body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/list"}),
    })
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("POST /mcp with correct token forwards body to handler and returns its response", async () => {
    const res = await fetch(`http://127.0.0.1:${transport.port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer good-token",
      },
      body: JSON.stringify({jsonrpc: "2.0", id: 42, method: "tools/list"}),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({jsonrpc: "2.0", id: 42, result: {echo: {jsonrpc: "2.0", id: 42, method: "tools/list"}}})
    expect(handler).toHaveBeenCalledOnce()
  })

  it("POST /mcp with malformed JSON returns 400", async () => {
    const res = await fetch(`http://127.0.0.1:${transport.port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer good-token",
      },
      body: "not json",
    })
    expect(res.status).toBe(400)
  })

  it("GET /mcp returns 405", async () => {
    const res = await fetch(`http://127.0.0.1:${transport.port}/mcp`)
    expect(res.status).toBe(405)
  })

  it("port-in-use start rejects with a descriptive error", async () => {
    const occupied = new HttpTransport({
      host: "127.0.0.1",
      port: transport.port,
      auth: new BearerAuth("x"),
      handleJsonRpc: handler,
      appVersion: "test",
    })
    await expect(occupied.start()).rejects.toThrow(/EADDRINUSE|in use/i)
  })
})
