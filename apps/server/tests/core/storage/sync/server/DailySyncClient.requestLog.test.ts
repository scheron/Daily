import {describe, expect, it} from "vitest"

import {SYNC_PROTOCOL_PATHS, SyncServerErrorCode} from "@daily/protocol"

import {DailySyncClient} from "@core/storage/sync/server/DailySyncClient"
import {RequestLogBuffer} from "@core/utils/requestLog/RequestLogBuffer"

function envelope(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {status})
}

function makeClient(fetch: typeof globalThis.fetch) {
  const requestLog = new RequestLogBuffer()
  const client = new DailySyncClient({baseUrl: "http://server.test", token: "secret-token", fingerprint: null, fetch, requestLog})
  return {client, requestLog}
}

describe("DailySyncClient request log", () => {
  it("logs a success as INFO with the path stripped of its query and no token", async () => {
    const {client, requestLog} = makeClient(async () => envelope(200, {ok: true, data: {revision: "r1"}}))

    await client.probeRevision(null, undefined, "Europe/Berlin")

    const [entry] = requestLog.list()
    expect(entry).toMatchObject({level: "info", source: "mac", method: "GET", path: "/v1/revision", status: 200, error: null, device: null})
    expect(JSON.stringify(entry)).not.toContain("secret-token")
    expect(JSON.stringify(entry)).not.toContain("Europe")
  })

  it("logs a refusal as WARN with the server's code, and a network failure as ERROR with the cause chain", async () => {
    const refused = makeClient(async () => envelope(403, {ok: false, error: {code: "NOT_AGENT_OWNER", message: "Not yours"}}))
    await expect(refused.client.revokeAgent("a1")).rejects.toThrow()
    expect(refused.requestLog.list()[0]).toMatchObject({level: "warn", status: 403, error: "NOT_AGENT_OWNER: Not yours"})

    const down = makeClient(async () => {
      throw new TypeError("fetch failed", {cause: Object.assign(new Error("Connect Timeout Error"), {code: "UND_ERR_CONNECT_TIMEOUT"})})
    })
    await expect(down.client.revokeAgent("a1")).rejects.toMatchObject({code: SyncServerErrorCode.UNREACHABLE})
    expect(down.requestLog.list()[0]).toMatchObject({level: "error", status: null, method: "POST", path: "/v1/agents/revoke"})
    expect(down.requestLog.list()[0].error).toBe(
      "UNREACHABLE: Could not reach the server at http://server.test Cause: TypeError: fetch failed Cause: UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error",
    )
  })

  it("names a timeout while reading the body a timeout, not invalid JSON", async () => {
    const {client, requestLog} = makeClient(async () => {
      const response = envelope(200, {})
      response.json = () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"))
      return response
    })

    await expect(client.listAgents()).rejects.toThrow("The request timed out")
    expect(requestLog.list()[0]).toMatchObject({level: "error", status: 200})
    expect(requestLog.list()[0].error).toContain("UNREACHABLE: The request timed out Cause: TimeoutError")
  })

  it("does not log a request the caller cancelled", async () => {
    const controller = new AbortController()
    const {client, requestLog} = makeClient(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
        }),
    )

    const pending = client.probeRevision("r1", controller.signal)
    controller.abort()

    await expect(pending).rejects.toThrow()
    expect(requestLog.list()).toEqual([])
  })

  it("logs an asset by its route, never its name, in the entry and in the error text", async () => {
    const ok = makeClient(async () => new Response(new Uint8Array([1]), {status: 200}))
    await ok.client.downloadAsset("holiday photo.png")
    await ok.client.uploadAsset("holiday photo.png", Buffer.from([1])).catch(() => {})

    const down = makeClient(async () => {
      throw new TypeError(`fetch failed for http://server.test${SYNC_PROTOCOL_PATHS.assetItem}holiday%20photo.png`)
    })
    await expect(down.client.downloadAsset("holiday photo.png")).rejects.toThrow()

    const refused = makeClient(async () =>
      envelope(404, {ok: false, error: {code: "ASSET_NOT_FOUND", message: 'No asset named "holiday photo.png"'}}),
    )
    await expect(refused.client.downloadAsset("holiday photo.png")).rejects.toThrow()
    expect(refused.requestLog.list()[0].error).toBe('ASSET_NOT_FOUND: No asset named "<asset>"')

    for (const entry of [...ok.requestLog.list(), ...down.requestLog.list(), ...refused.requestLog.list()]) {
      expect(entry.path).toBe(SYNC_PROTOCOL_PATHS.assetItem)
      expect(JSON.stringify(entry)).not.toContain("holiday")
    }
  })

  it("does not write a successful read of the server log, but writes a failed one", async () => {
    const ok = makeClient(async () => envelope(200, {ok: true, data: {entries: []}}))
    await expect(ok.client.readLogs()).resolves.toEqual([])
    expect(ok.requestLog.list()).toEqual([])

    const old = makeClient(async () => envelope(404, {ok: false, error: {code: "UNKNOWN_ROUTE", message: "No such route"}}))
    await expect(old.client.readLogs()).rejects.toThrow()
    expect(old.requestLog.list()[0]).toMatchObject({level: "warn", status: 404, path: "/v1/logs", error: "UNKNOWN_ROUTE: No such route"})
  })
})
