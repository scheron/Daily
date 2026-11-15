import {once} from "node:events"
import {request as requestHttp} from "node:http"
import {request as requestHttps} from "node:https"
import {gzipSync} from "node:zlib"
import {afterEach, describe, expect, it, vi} from "vitest"

import {SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {findAsset} from "../src/assets/AssetStore"
import {revokeDevice} from "../src/devices/DeviceStore"
import {claimServer} from "../src/http/routes/claim"
import {ensureClaimCode} from "../src/identity/ServerIdentityStore"
import {readRevision} from "../src/snapshot/SnapshotStore"
import {bootHttpsSyncServer, bootSyncServer, claimFirstDevice, enrollSecondDevice} from "./helpers/syncServer"

import type {ClientRequest, IncomingMessage} from "node:http"
import type {BootedSyncServer} from "./helpers/syncServer"

describe("snapshot uploads", () => {
  let server: BootedSyncServer
  const requests: ClientRequest[] = []
  const body = JSON.stringify({
    expectedRevision: null,
    snapshot: {version: 4, meta: {updatedAt: "2026-11-15T12:00:00.000Z", hash: "hash"}, docs: {tasks: {}}},
  })

  afterEach(async () => {
    vi.useRealTimers()
    requests.splice(0).forEach((req) => req.destroy())
    await server?.close()
  })

  it("rejects an unauthenticated upload before inviting the client to send its body", async () => {
    server = await bootSyncServer()
    await claimFirstDevice(server)

    const upload = begin(SYNC_PROTOCOL_PATHS.snapshot, "unrecognized")

    expect(await upload.admission).toBe(401)
    expect(readRevision(server.store)).toBeNull()
  })

  it.each([
    ["HTTP", bootSyncServer],
    ["HTTPS", bootHttpsSyncServer],
  ])("accepts an authenticated %s upload making steady progress beyond five minutes", async (_scheme, boot) => {
    server = await boot()
    const code = ensureClaimCode(server.store)
    if (!code) throw new Error("Expected an unclaimed test server")
    const {token} = claimServer(server.store, code, "Test device")
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})

    const upload = await beginProgressingUpload(token, 16)

    if (server.baseUrl.startsWith("http:")) {
      const probe = await fetch(new URL(SYNC_PROTOCOL_PATHS.revision, server.baseUrl), {headers: {authorization: `Bearer ${token}`}})
      expect(probe.status).toBe(200)
    }

    upload.req.end(body.slice(16))
    expect(await upload.status).toBe(200)
    expect(readRevision(server.store)).toBe("1")
  })

  it("closes an idle upload and allows another upload without advancing the revision", async () => {
    server = await bootSyncServer()
    const {token} = await claimFirstDevice(server)
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})

    const idle = begin(SYNC_PROTOCOL_PATHS.snapshot, token)
    expect(await idle.admission).toBe("continue")
    await vi.advanceTimersByTimeAsync(15_000)
    const busy = begin(SYNC_PROTOCOL_PATHS.snapshot, token)
    expect(await busy.admission).toBe("continue")
    await vi.advanceTimersByTimeAsync(15_000)

    expect(await idle.status).toBe(408)
    expect(readRevision(server.store)).toBeNull()
    const retry = begin(SYNC_PROTOCOL_PATHS.snapshot, token)
    expect(await retry.admission).toBe("continue")
    retry.req.end(body)
    expect(await retry.status).toBe(200)
  })

  it("ends a progressing upload at the absolute ceiling without committing it", async () => {
    server = await bootSyncServer()
    const {token} = await claimFirstDevice(server)
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})

    const upload = await beginProgressingUpload(token, 45)

    expect(await upload.status).toBe(408)
    expect(readRevision(server.store)).toBeNull()
  })

  it("closes an incomplete control request at its shorter absolute ceiling", async () => {
    server = await bootSyncServer()
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})

    const control = begin(SYNC_PROTOCOL_PATHS.claim, "unused")
    expect(await control.admission).toBe("continue")
    await vi.advanceTimersByTimeAsync(300_000)

    expect(await control.status).toBe(408)
  })

  it("closes an incomplete streamed asset upload at the ordinary ceiling", async () => {
    server = await bootSyncServer()
    const {token} = await claimFirstDevice(server)
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})

    const asset = begin(`${SYNC_PROTOCOL_PATHS.assetItem}partial.png`, token, {}, "PUT")
    expect(await asset.admission).toBe("continue")
    asset.req.write("unfinished")
    await vi.advanceTimersByTimeAsync(300_000)

    expect(await asset.status).toBe(408)
    expect(findAsset(server.store, "partial.png")).toBeNull()
  })

  it("refuses excess concurrent uploads and frees capacity after the sender disconnects", async () => {
    server = await bootSyncServer()
    const {token} = await claimFirstDevice(server)
    const first = begin(SYNC_PROTOCOL_PATHS.snapshot, token)
    const second = begin(SYNC_PROTOCOL_PATHS.snapshot, token)
    expect(await first.admission).toBe("continue")
    expect(await second.admission).toBe("continue")

    expect(await begin(SYNC_PROTOCOL_PATHS.snapshot, token).admission).toBe(429)
    first.req.destroy()
    await expect
      .poll(async () => {
        const retry = begin(SYNC_PROTOCOL_PATHS.snapshot, token)
        const admission = await retry.admission
        retry.req.destroy()
        return admission
      })
      .toBe("continue")
    expect(readRevision(server.store)).toBeNull()
  })

  it("rechecks the device credential after an upload before committing it", async () => {
    server = await bootSyncServer()
    await claimFirstDevice(server)
    const {device, token} = await enrollSecondDevice(server, "Second test device")
    const upload = begin(SYNC_PROTOCOL_PATHS.snapshot, token)
    expect(await upload.admission).toBe("continue")

    revokeDevice(server.store, device.id)
    upload.req.end(body)

    expect(await upload.status).toBe(403)
    expect(readRevision(server.store)).toBeNull()
  })

  it("refuses the stale write when another upload commits while it is still receiving bytes", async () => {
    server = await bootSyncServer()
    const first = await claimFirstDevice(server)
    const second = await enrollSecondDevice(server, "Second test device")
    const slow = begin(SYNC_PROTOCOL_PATHS.snapshot, first.token)
    expect(await slow.admission).toBe("continue")
    slow.req.write(body.slice(0, 1))

    const fast = begin(SYNC_PROTOCOL_PATHS.snapshot, second.token)
    expect(await fast.admission).toBe("continue")
    fast.req.end(body)
    expect(await fast.status).toBe(200)

    slow.req.end(body.slice(1))
    expect(await slow.status).toBe(409)
    expect(readRevision(server.store)).toBe("1")
  })

  it.each([
    ["encoded", () => Buffer.alloc(2048), {}],
    ["decoded", () => gzipSync(Buffer.alloc(2048)), {"content-encoding": "gzip"}],
  ])("enforces the %s cap for a chunked upload", async (_limit, payload, headers) => {
    server = await bootSyncServer({maxSnapshotBodyBytes: 1024})
    const {token} = await claimFirstDevice(server)
    const upload = begin(SYNC_PROTOCOL_PATHS.snapshot, token, headers)
    expect(await upload.admission).toBe("continue")

    upload.req.end(payload())

    expect(await upload.status).toBe(413)
    expect(readRevision(server.store)).toBeNull()
  })

  function begin(path: string, token: string, headers: Record<string, string> = {}, method: "POST" | "PUT" = "POST") {
    const url = new URL(path, server.baseUrl)
    const request = url.protocol === "https:" ? requestHttps : requestHttp
    const req = request(url, {
      method,
      rejectUnauthorized: false,
      headers: {...headers, authorization: `Bearer ${token}`, expect: "100-continue", "transfer-encoding": "chunked"},
    })
    requests.push(req)
    const status = new Promise<number | null>((resolve) => {
      req.on("error", () => resolve(null))
      req.once("response", (response) => {
        response.resume()
        resolve(response.statusCode ?? null)
      })
    })
    const admission = Promise.race([status, new Promise<"continue">((resolve) => req.once("continue", () => resolve("continue")))])
    req.flushHeaders()
    return {req, admission, status}
  }

  async function beginProgressingUpload(token: string, count: number) {
    const serverRequest = new Promise<IncomingMessage>((resolve) => server.httpServer.once("checkContinue", resolve))
    const upload = begin(SYNC_PROTOCOL_PATHS.snapshot, token)
    expect(await upload.admission).toBe("continue")
    const incoming = await serverRequest

    for (let offset = 0; offset < count; offset++) {
      const received = once(incoming, "data")
      upload.req.write(body.slice(offset, offset + 1))
      await received
      await vi.advanceTimersByTimeAsync(20_000)
    }

    return upload
  }
})
