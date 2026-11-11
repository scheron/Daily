import {readFileSync} from "node:fs"
import http from "node:http"
import https from "node:https"
import {gunzipSync} from "node:zlib"

import {RequestLogBuffer} from "@daily/core/utils/requestLog/RequestLogBuffer"
import {ProtocolError, ProtocolErrorCode, SYNC_PROTOCOL_CONFIG, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {findDeviceByTokenHash} from "../devices/DeviceStore"
import {hashToken} from "../devices/tokens"
import {readBearerToken} from "./readBearerToken"
import {isBodyStreamFailure, respondError, respondOk, RESPONSE_SENT} from "./respond"
import {routes} from "./routes"
import {HEALTH_PATH} from "./routes/health"

import type {IncomingMessage, Server, ServerResponse} from "node:http"
import type {ServerConfig} from "../config/resolveServerConfig"
import type {ServerStore} from "../store/instance"

export type RouteContext = {
  req: IncomingMessage
  res: ServerResponse
  store: ServerStore
  config: ServerConfig
  body: unknown
  requestLog: RequestLogBuffer
}
export type Route = {
  method: "GET" | "POST" | "PUT"
  path: string
  prefix?: true
  body?: "json" | "stream"
  bodyLimit?: "control" | "snapshot"
  handler: (ctx: RouteContext) => Promise<unknown>
}

const RESPONSE_ALREADY_SENT = Symbol("response-already-sent")
const STREAM_FAILURE = "Server failed while sending the response body"

/**
 * Creates the Daily Sync Protocol HTTP(S) listener. It matches requests against the route
 * table, reads and caps a `POST` body under the matched route's own limit, dispatches to the
 * matched handler, and maps whatever comes back — a value, a thrown `ProtocolError`, or an
 * unexpected exception — onto the wire envelope. The listener is created but not started;
 * `commands/start.ts` binds it.
 */
export function createHttpServer(store: ServerStore, config: ServerConfig): Server {
  const requestLog = new RequestLogBuffer()

  const listener = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let route: Route | undefined
    let failure: string | null = null
    const startedAt = Date.now()

    // Recorded at close, not at dispatch, so a client that drops the connection is logged too.
    res.once("close", () => {
      if (!route || route.path === HEALTH_PATH || route.path === SYNC_PROTOCOL_PATHS.logs) return

      const answered = res.writableFinished
      // The app cancels its own held poll, which looks the same here as a network failure; the Mac logs a real one.
      if (!answered && route.path === SYNC_PROTOCOL_PATHS.revision) return

      const status = answered ? res.statusCode : null
      const at = new Date().toISOString()

      requestLog.add({
        at,
        firstAt: at,
        level: status === null || status >= 500 ? "error" : status >= 400 ? "warn" : "info",
        source: "server",
        method: req.method ?? "",
        path: route.path,
        status,
        durationMs: Date.now() - startedAt,
        device: findRequestDevice(store, req),
        error: answered ? (failure ?? refusalFallback(res)) : isBodyStreamFailure(res) ? STREAM_FAILURE : "connection closed by client",
      })
    })

    try {
      const pathname = new URL(req.url ?? "/", "http://placeholder").pathname
      route = matchRoute(req.method ?? "", pathname)

      const body =
        route.body === "stream" ? undefined : req.method === "POST" ? await readRequestBody(req, res, resolveBodyLimit(route, config)) : undefined

      const data = await route.handler({req, res, store, config, body, requestLog})
      if (data !== RESPONSE_SENT) respondOk(res, data, acceptsGzip(req))
    } catch (err) {
      if (err === RESPONSE_ALREADY_SENT) return

      // Only a code: a message can quote an attachment name, a body value or a server path.
      failure = err instanceof ProtocolError ? err.code : "Unexpected server error"

      if (err instanceof ProtocolError) {
        respondError(res, err)
        return
      }

      console.error(err)
      respondError(res, new ProtocolError(ProtocolErrorCode.INTERNAL, "Internal server error"))
    }
  }

  if (config.tls) {
    return https.createServer({cert: readFileSync(config.tls.certPath), key: readFileSync(config.tls.keyPath)}, listener)
  }

  return http.createServer(listener)
}

/** A response the handler wrote itself (an oversized body, an MCP refusal) leaves no failure: the status is the reason. */
function refusalFallback(res: ServerResponse): string | null {
  return res.statusCode >= 400 ? `HTTP ${res.statusCode}` : null
}

function findRequestDevice(store: ServerStore, req: IncomingMessage): string | null {
  const token = readBearerToken(req)
  if (token === null) return null

  try {
    return findDeviceByTokenHash(store, hashToken(token))?.name ?? null
  } catch {
    // A response can close after the store has: the entry is still worth keeping without a name.
    return null
  }
}

function matchRoute(method: string, pathname: string): Route {
  const exact = routes.filter((route) => !route.prefix && route.path === pathname)
  const atPath = exact.length > 0 ? exact : routes.filter((route) => route.prefix && pathname.startsWith(route.path))
  if (atPath.length === 0) throw new ProtocolError(ProtocolErrorCode.UNKNOWN_ROUTE, `No route for ${pathname}`)

  const route = atPath.find((candidate) => candidate.method === method)
  if (!route) throw new ProtocolError(ProtocolErrorCode.METHOD_NOT_ALLOWED, `${method} not allowed on ${pathname}`)

  return route
}

function resolveBodyLimit(route: Route, config: ServerConfig): number {
  return route.bodyLimit === "snapshot" ? config.maxSnapshotBodyBytes : SYNC_PROTOCOL_CONFIG.maxControlRequestBodyBytes
}

function acceptsGzip(req: IncomingMessage): boolean {
  const header = req.headers["accept-encoding"]
  return typeof header === "string" && header.includes("gzip")
}

function readRequestBody(req: IncomingMessage, res: ServerResponse, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let received = 0
    let settled = false

    req.on("data", (chunk: Buffer) => {
      if (settled) return

      received += chunk.length
      if (received > maxBytes) {
        settled = true
        respondError(res, new ProtocolError(ProtocolErrorCode.PAYLOAD_TOO_LARGE, "Request body too large"))
        req.destroy()
        reject(RESPONSE_ALREADY_SENT)
        return
      }

      chunks.push(chunk)
    })

    req.on("end", () => {
      if (settled) return
      settled = true

      const compressed = Buffer.concat(chunks)
      if (compressed.length === 0) {
        resolve(undefined)
        return
      }

      try {
        const raw = decodeBody(compressed, req.headers["content-encoding"], maxBytes)
        resolve(JSON.parse(raw.toString("utf8")))
      } catch (err) {
        reject(err instanceof ProtocolError ? err : new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "Request body is not valid JSON"))
      }
    })

    req.on("error", (err) => {
      if (settled) return
      settled = true
      reject(err)
    })
  })
}

function decodeBody(compressed: Buffer, contentEncoding: string | undefined, maxBytes: number): Buffer {
  if (contentEncoding === undefined) return compressed
  if (contentEncoding !== "gzip") throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, `Unsupported content-encoding: ${contentEncoding}`)

  try {
    return gunzipSync(compressed, {maxOutputLength: maxBytes})
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
      throw new ProtocolError(ProtocolErrorCode.PAYLOAD_TOO_LARGE, "Decompressed request body too large")
    }

    throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "Request body is not valid gzip")
  }
}
