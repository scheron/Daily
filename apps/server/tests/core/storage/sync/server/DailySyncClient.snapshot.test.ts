import {channel} from "node:diagnostics_channel"
import {createServer} from "node:http"
import {finished} from "node:stream/promises"
import {gzipSync} from "node:zlib"
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest"

import {DailyServerRemoteAdapter} from "@core/storage/sync/adapters/DailyServerRemoteAdapter"
import {DailySyncClient} from "@core/storage/sync/server/DailySyncClient"

import type {IncomingMessage, ServerResponse} from "node:http"

describe("DailySyncClient snapshot transfers", () => {
  beforeAll(() => {
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms).unref()
      return controller.signal
    })
  })

  afterAll(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("keeps reading past 30 seconds while even undecodable gzip header bytes arrive", async () => {
    const wire = await openWire()
    const body = gzipSync(JSON.stringify({ok: true, data: {snapshot: null, revision: null}}))

    try {
      const transfer = wire.client.readSnapshot().catch((error) => error)
      const {res} = await wire.incoming
      res.writeHead(200, {"content-encoding": "gzip", "content-length": body.length})

      await writeChunk(res, body.subarray(0, 5))
      await vi.advanceTimersByTimeAsync(29_000)
      await writeChunk(res, body.subarray(5, 10))
      await vi.advanceTimersByTimeAsync(29_000)

      res.end(body.subarray(10))
      expect(await transfer).toEqual({snapshot: null, revision: null})
    } finally {
      await wire.close()
    }
  })

  it("times out when a snapshot response stops delivering bytes", async () => {
    const wire = await openWire()

    try {
      const transfer = expect(wire.client.readSnapshot()).rejects.toMatchObject({kind: "transient", message: expect.stringMatching(/idle/i)})
      const {res} = await wire.incoming
      await writeChunk(res, Buffer.from("{"))
      await vi.advanceTimersByTimeAsync(31_000)
      await transfer
    } finally {
      await wire.close()
    }
  })

  it("times out waiting for the download to start", async () => {
    const wire = await openWire()

    try {
      const transfer = expect(wire.client.readSnapshot()).rejects.toMatchObject({
        kind: "transient",
        message: expect.stringMatching(/start a snapshot response/),
      })
      await wire.incoming
      await vi.advanceTimersByTimeAsync(31_000)
      await transfer
    } finally {
      await wire.close()
    }
  })

  it("applies the 15-minute ceiling even while response bytes continue to arrive", async () => {
    const wire = await openWire()

    try {
      const transfer = expect(wire.client.readSnapshot()).rejects.toMatchObject({kind: "transient", message: expect.stringMatching(/15 min/)})
      const {res} = await wire.incoming
      await writeChunk(res, Buffer.from("{"))
      for (let i = 0; i < 31; i++) {
        await vi.advanceTimersByTimeAsync(29_000)
        if (res.destroyed) break
        await writeChunk(res, Buffer.from(" "))
      }
      await vi.advanceTimersByTimeAsync(1_000)
      await transfer
    } finally {
      await wire.close()
    }
  })

  it("allows an upload to wait longer than five minutes for response headers", async () => {
    const wire = await openWire()

    try {
      const transfer = wire.client.writeSnapshot({docs: {}}, null).catch((error) => error)
      const {req, res} = await wire.incoming
      req.resume()
      await vi.advanceTimersByTimeAsync(360_000)
      res.end(JSON.stringify({ok: true, data: {revision: "1"}}))
      expect(await transfer).toEqual({revision: "1"})
    } finally {
      await wire.close()
    }
  })

  it.each([
    {afterHeaders: false, status: 408, kind: "transient"},
    {afterHeaders: true, status: 200, kind: "ambiguous"},
  ])("classifies an upload response failure as $kind", async ({afterHeaders, status, kind}) => {
    const wire = await openWire()

    try {
      const transfer = expect(wire.client.writeSnapshot({docs: {}}, null)).rejects.toMatchObject({kind})
      const {req, res} = await wire.incoming
      await finished(req.resume())
      res.writeHead(status, {"content-length": afterHeaders ? 100 : 0, connection: "close"})
      if (afterHeaders) {
        await writeChunk(res, Buffer.from("{"))
        res.destroy()
      } else {
        res.end()
      }
      await transfer
      expect(wire.requestCount()).toBe(1)
    } finally {
      await wire.close()
    }
  })

  it("distinguishes a complete corrupt gzip stream from an interrupted HTTP response", async () => {
    const wire = await openWire()
    const body = gzipSync(JSON.stringify({ok: true, data: {snapshot: null, revision: null}})).subarray(0, -8)

    try {
      const transfer = expect(wire.client.readSnapshot()).rejects.toMatchObject({kind: "terminal"})
      const {res} = await wire.incoming
      res.writeHead(200, {"content-encoding": "gzip", "content-length": body.length})
      res.end(body)
      await transfer
    } finally {
      await wire.close()
    }
  })

  it("cancels a read already receiving a response", async () => {
    const wire = await openWire()
    const controller = new AbortController()

    try {
      const transfer = expect(wire.client.readSnapshot(controller.signal)).rejects.toMatchObject({kind: "cancelled"})
      const {res} = await wire.incoming
      await writeChunk(res, Buffer.from("{"))
      controller.abort()
      await transfer
    } finally {
      await wire.close()
    }
  })

  it("rejects a stored snapshot whose rows cannot be merged", async () => {
    const wire = await openWire()

    try {
      const transfer = expect(wire.adapter.loadSnapshotWithRevision()).rejects.toMatchObject({kind: "terminal"})
      const {res} = await wire.incoming
      const snapshot = {
        version: 16,
        meta: {hash: "broken", updatedAt: "2026-11-15T00:00:00.000Z"},
        docs: {tasks: [null], tags: [], branches: [], files: []},
      }
      res.end(JSON.stringify({ok: true, data: {snapshot, revision: "1"}}))
      await transfer
    } finally {
      await wire.close()
    }
  })

  it("does not treat an empty snapshot with a revision as an empty server", async () => {
    const wire = await openWire()

    try {
      const transfer = expect(wire.client.readSnapshot()).rejects.toMatchObject({kind: "terminal"})
      const {res} = await wire.incoming
      res.end(JSON.stringify({ok: true, data: {snapshot: null, revision: "1"}}))
      await transfer
    } finally {
      await wire.close()
    }
  })

  it("does not accept a write acknowledgement that repeats the expected revision", async () => {
    const wire = await openWire()

    try {
      const transfer = expect(wire.client.writeSnapshot({docs: {}}, "1")).rejects.toMatchObject({kind: "ambiguous"})
      const {req, res} = await wire.incoming
      await finished(req.resume())
      res.end(JSON.stringify({ok: true, data: {revision: "1"}}))
      await transfer
      expect(wire.requestCount()).toBe(1)
    } finally {
      await wire.close()
    }
  })
})

async function openWire() {
  let requestCount = 0
  const incoming = Promise.withResolvers<{req: IncomingMessage; res: ServerResponse}>()
  const server = createServer((req, res) => {
    requestCount++
    incoming.resolve({req, res})
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const {port} = server.address() as {port: number}
  const baseUrl = `http://127.0.0.1:${port}`
  const credential = {baseUrl, token: "token", fingerprint: null}

  return {
    client: new DailySyncClient(credential),
    adapter: new DailyServerRemoteAdapter({
      ...credential,
      serverId: "test",
      serverName: "Test",
      deviceId: "test-device",
      deviceName: "Test Device",
      insecure: true,
      boundAt: "2026-11-15T00:00:00.000Z",
    }),
    incoming: incoming.promise,
    requestCount: () => requestCount,
    async close() {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()))
      server.closeAllConnections()
      await closed
    },
  }
}

async function writeChunk(res: ServerResponse, chunk: Buffer): Promise<void> {
  const activity = channel("undici:request:bodyChunkReceived")
  const received = Promise.withResolvers<void>()
  activity.subscribe(received.resolve)
  try {
    res.write(chunk)
    await received.promise
  } finally {
    activity.unsubscribe(received.resolve)
  }
}
