import {createServer} from "node:http"
import {afterEach, describe, expect, it} from "vitest"

import {SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {getDefaultSettings} from "@core/storage/models/_rowMappers"
import {ServerProviderService} from "@core/storage/sync/server/ServerProviderService"
import {RequestLogBuffer} from "@core/utils/requestLog/RequestLogBuffer"
import {bootSyncServer, claimFirstDevice} from "@server-tests/helpers/syncServer"

import type {RequestLogEntry, ServerSyncBinding, Settings} from "@daily/protocol"
import type {Server} from "node:http"

const macEntry = (at: string): RequestLogEntry => ({
  at,
  firstAt: at,
  level: "error",
  source: "mac",
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.agentRevoke,
  status: null,
  durationMs: 8003,
  device: null,
  error: "UNREACHABLE: The request timed out",
})

function makeService(binding: ServerSyncBinding | null, requestLog: RequestLogBuffer): ServerProviderService {
  const settings: Settings = {...getDefaultSettings(), sync: {iCloud: {enabled: false}, server: {enabled: binding !== null, binding}}}
  return new ServerProviderService({requestLog, loadSettings: async () => structuredClone(settings)} as never)
}

function bind(baseUrl: string, token: string): ServerSyncBinding {
  return {
    baseUrl,
    serverId: "srv-1",
    serverName: "Home Server",
    deviceId: "dev-1",
    deviceName: "MacBook Air",
    token,
    fingerprint: null,
    insecure: true,
    boundAt: "2026-08-10T00:00:00.000Z",
    role: null,
    approvedBy: null,
    acceptsAgents: null,
  }
}

describe("ServerProviderService.getLogs", () => {
  let oldServer: Server | null = null

  afterEach(() => {
    oldServer?.close()
    oldServer = null
  })

  it("merges the server's entries with the Mac's, oldest first, with no issue", async () => {
    const server = await bootSyncServer()
    try {
      const credential = await claimFirstDevice(server, "MacBook Air")
      const requestLog = new RequestLogBuffer()
      requestLog.add(macEntry("2000-01-01T00:00:00.000Z"))

      const view = await makeService(bind(server.baseUrl, credential.token), requestLog).getLogs()

      expect(view.serverIssue).toBeNull()
      expect(view.entries[0]).toMatchObject({source: "mac", path: SYNC_PROTOCOL_PATHS.agentRevoke})
      expect(view.entries.some((entry) => entry.source === "server" && entry.path === SYNC_PROTOCOL_PATHS.claim)).toBe(true)
      expect(view.entries.map((entry) => entry.at)).toEqual(view.entries.map((entry) => entry.at).sort())
      expect(requestLog.list()).toHaveLength(1)
    } finally {
      await server.close()
    }
  })

  it("reports an old server as outdated and keeps the Mac's entries, with its own refusal among them", async () => {
    oldServer = createServer((_req, res) => {
      res.writeHead(404, {"content-type": "application/json"})
      res.end(JSON.stringify({ok: false, error: {code: "UNKNOWN_ROUTE", message: "No such route"}}))
    })
    await new Promise<void>((resolve) => oldServer!.listen(0, "127.0.0.1", resolve))
    const {port} = oldServer.address() as {port: number}

    const requestLog = new RequestLogBuffer()
    requestLog.add(macEntry("2000-01-01T00:00:00.000Z"))
    const view = await makeService(bind(`http://127.0.0.1:${port}`, "t"), requestLog).getLogs()

    expect(view.serverIssue).toEqual({kind: "outdated"})
    expect(view.entries.map((entry) => [entry.source, entry.path, entry.level])).toEqual([
      ["mac", SYNC_PROTOCOL_PATHS.agentRevoke, "error"],
      ["mac", SYNC_PROTOCOL_PATHS.logs, "warn"],
    ])
  })

  it("reports an unreachable server as failed with its message and keeps the Mac's entries", async () => {
    const server = await bootSyncServer()
    const baseUrl = server.baseUrl
    await server.close()

    const requestLog = new RequestLogBuffer()
    requestLog.add(macEntry("2000-01-01T00:00:00.000Z"))
    const view = await makeService(bind(baseUrl, "t"), requestLog).getLogs()

    expect(view.serverIssue).toMatchObject({kind: "failed", message: expect.stringContaining("Could not reach the server")})
    // The refused connection is retried once: a WARN for the first attempt, then the final ERROR.
    expect(view.entries).toHaveLength(3)
    expect(view.entries.map((e) => e.level)).toEqual(expect.arrayContaining(["warn", "error"]))
    expect(view.entries.at(-1)).toMatchObject({source: "mac", path: SYNC_PROTOCOL_PATHS.logs, level: "error"})
  })
})
