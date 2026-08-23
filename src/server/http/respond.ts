import {pipeline} from "node:stream/promises"
import {gzipSync} from "node:zlib"

import {SYNC_PROTOCOL_CONFIG} from "@shared/config/syncProtocol"

import type {ProtocolError} from "@shared/errors/protocol/ProtocolError"
import type {ServerResponse} from "node:http"
import type {Readable} from "node:stream"

/** A handler returns this to signal it has already written its own response; `createHttpServer` skips `respondOk`. */
export const RESPONSE_SENT: unique symbol = Symbol("response-sent")

/**
 * Writes a successful Daily Sync Protocol response: `204` with no body when `data` is
 * `undefined`, `200` with `{ok: true, data}` otherwise. Gzips the body when `acceptsGzip` is
 * `true` and the serialized payload exceeds `gzipResponseThresholdBytes`.
 */
export function respondOk(res: ServerResponse, data: unknown, acceptsGzip = false): void {
  if (data === undefined) {
    res.writeHead(204)
    res.end()
    return
  }

  writeJson(res, 200, {ok: true, data}, acceptsGzip)
}

/** Writes a failed Daily Sync Protocol response at the error's own HTTP status. */
export function respondError(res: ServerResponse, error: ProtocolError): void {
  writeJson(res, error.status, {ok: false, error: {code: error.code, message: error.message}}, false)
}

/** Writes the head for a binary body and pipes `source` into the response, destroying it on a stream error. */
export function respondBytes(res: ServerResponse, source: Readable, meta: {size: number; sha256: string}): void {
  res.writeHead(200, {
    "content-type": "application/octet-stream",
    "content-length": String(meta.size),
    etag: `"${meta.sha256}"`,
  })

  pipeline(source, res).catch((err) => {
    console.error(err)
    res.destroy()
  })
}

function writeJson(res: ServerResponse, status: number, payload: unknown, acceptsGzip: boolean): void {
  const body = JSON.stringify(payload)

  if (acceptsGzip && Buffer.byteLength(body, "utf8") > SYNC_PROTOCOL_CONFIG.gzipResponseThresholdBytes) {
    res.writeHead(status, {"content-type": "application/json", "content-encoding": "gzip"})
    res.end(gzipSync(body))
    return
  }

  res.writeHead(status, {"content-type": "application/json"})
  res.end(body)
}
