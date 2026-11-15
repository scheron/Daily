import {readFileSync} from "node:fs"
import http from "node:http"
import https from "node:https"
import {gunzipSync} from "node:zlib"

import {RequestLogBuffer} from "@daily/core/utils/requestLog/RequestLogBuffer"
import {AGENT_ENDPOINT_PATH, ProtocolError, ProtocolErrorCode, SYNC_PROTOCOL_CONFIG, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {LegacyMcpSessions} from "../agents/mcp/LegacyMcpSessions"
import {McpJournal} from "../agents/mcp/McpJournal"
import {SearchRunner} from "../agents/search/SearchRunner"
import {findDeviceByTokenHash} from "../devices/DeviceStore"
import {hashToken} from "../devices/tokens"
import {readBearerToken} from "./readBearerToken"
import {isBodyStreamFailure, respondError, respondOk, RESPONSE_SENT} from "./respond"
import {routes} from "./routes"
import {HEALTH_PATH} from "./routes/health"

import type {IncomingMessage, Server, ServerResponse} from "node:http"
import type {ServerConfig} from "../config/resolveServerConfig"
import type {ServerStore} from "../store/instance"

type McpSearchRunner = Pick<SearchRunner, "submit" | "close">

export type RouteContext = {
  req: IncomingMessage
  res: ServerResponse
  store: ServerStore
  config: ServerConfig
  body: unknown
  requestLog: RequestLogBuffer
  searchRunner: McpSearchRunner
  legacyMcpSessions: LegacyMcpSessions
  mcpJournal: McpJournal
}
export type Route = {
  method: "GET" | "POST" | "PUT"
  path: string
  prefix?: true
  body?: "json" | "stream"
  bodyDeadlineMs?: number
  authorizeSnapshotUpload?: (store: ServerStore, req: IncomingMessage) => void
  handler: (ctx: RouteContext) => Promise<unknown>
}

const STREAM_FAILURE = "Server failed while sending the response body"

/**
 * Creates the Daily Sync Protocol HTTP(S) listener. It matches requests against the route
 * table, reads and caps a `POST` body under the matched route's own limit, dispatches to the
 * matched handler, and maps whatever comes back — a value, a thrown `ProtocolError`, or an
 * unexpected exception — onto the wire envelope. The listener is created but not started;
 * `commands/start.ts` binds it.
 */
export function createHttpServer(
  store: ServerStore,
  config: ServerConfig,
  searchRunner: McpSearchRunner = new SearchRunner(store),
  mcpJournal = new McpJournal(config.dataDir),
): Server {
  const requestLog = new RequestLogBuffer()
  const legacyMcpSessions = new LegacyMcpSessions()
  let activeSnapshotUploads = 0

  const listener = async (req: IncomingMessage, res: ServerResponse, expectContinue = false): Promise<void> => {
    let route: Route | undefined
    let failure: string | null = null
    let admittedSnapshotUpload = false
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

      const readsJson = route.body !== "stream" && route.method === "POST"
      const maxBodyBytes = route.authorizeSnapshotUpload ? config.maxSnapshotBodyBytes : SYNC_PROTOCOL_CONFIG.maxControlRequestBodyBytes
      if (route.authorizeSnapshotUpload) route.authorizeSnapshotUpload(store, req)
      if (readsJson && Number(req.headers["content-length"]) > maxBodyBytes) {
        refuseOversizedBody(req, res)
        return
      }

      if (route.authorizeSnapshotUpload) {
        if (activeSnapshotUploads >= 2) {
          closeAfterResponse(req, res)
          res.writeHead(429).end()
          return
        }
        activeSnapshotUploads++
        admittedSnapshotUpload = true
      }

      if (req.headers["transfer-encoding"] || Number(req.headers["content-length"]) > 0) {
        const bodyDeadlineMs = route.bodyDeadlineMs ?? (admittedSnapshotUpload ? 900_000 : 300_000)
        const timer = setTimeout(() => expireIncompleteRequest(req, res), bodyDeadlineMs)
        req.once("close", () => clearTimeout(timer))
      }
      if (expectContinue) res.writeContinue()
      const body = readsJson ? await readRequestBody(req, res, maxBodyBytes, admittedSnapshotUpload ? 30_000 : null) : undefined
      const data = await route.handler({req, res, store, config, body, requestLog, searchRunner, legacyMcpSessions, mcpJournal})
      if (data !== RESPONSE_SENT) respondOk(res, data, acceptsGzip(req))
    } catch (err) {
      if (err === RESPONSE_SENT || res.destroyed) return

      // Only a code: a message can quote an attachment name, a body value or a server path.
      failure = err instanceof ProtocolError ? err.code : "Unexpected server error"
      if (!req.complete) closeAfterResponse(req, res)

      if (err instanceof ProtocolError) {
        respondError(res, err)
        return
      }

      if (route?.path === AGENT_ENDPOINT_PATH) console.error("MCP request failed")
      else console.error(err)
      respondError(res, new ProtocolError(ProtocolErrorCode.INTERNAL, "Internal server error"))
    } finally {
      if (admittedSnapshotUpload) activeSnapshotUploads--
    }
  }

  // Node applies requestTimeout to the whole listener, so the body deadlines start after routing.
  const options = {requestTimeout: 0, headersTimeout: 60_000}
  const server = config.tls
    ? https.createServer({...options, cert: readFileSync(config.tls.certPath), key: readFileSync(config.tls.keyPath)}, listener)
    : http.createServer(options, listener)
  server.on("checkContinue", (req, res) => void listener(req, res, true))
  server.once("close", () => void searchRunner.close().then(() => mcpJournal.close()))
  return server
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

function acceptsGzip(req: IncomingMessage): boolean {
  const header = req.headers["accept-encoding"]
  return typeof header === "string" && header.includes("gzip")
}

function closeAfterResponse(req: IncomingMessage, res: ServerResponse): void {
  req.pause()
  res.setHeader("connection", "close")
}

function refuseOversizedBody(req: IncomingMessage, res: ServerResponse): void {
  if (!req.complete) closeAfterResponse(req, res)
  respondError(res, new ProtocolError(ProtocolErrorCode.PAYLOAD_TOO_LARGE, "Request body too large"))
}

function expireIncompleteRequest(req: IncomingMessage, res: ServerResponse): void {
  if (req.complete) return
  if (!res.socket || res.headersSent) {
    req.destroy()
    return
  }

  closeAfterResponse(req, res)
  res.writeHead(408).end()
}

function readRequestBody(req: IncomingMessage, res: ServerResponse, maxBytes: number, idleMs: number | null): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    let received = 0

    const idle = idleMs === null ? null : setTimeout(() => expireIncompleteRequest(req, res), idleMs)

    function cleanup(): void {
      if (idle) clearTimeout(idle)
      buffer = Buffer.alloc(0)
      req.off("data", onData).off("end", onEnd).off("error", onClose).off("close", onClose)
      res.off("finish", onClose)
    }

    function onData(chunk: Buffer): void {
      const nextSize = received + chunk.length
      if (nextSize > maxBytes) {
        cleanup()
        refuseOversizedBody(req, res)
        reject(RESPONSE_SENT)
        return
      }

      idle?.refresh()
      // Copy into bounded storage so tiny chunks cannot pin entire socket buffers.
      if (nextSize > buffer.length) {
        const grown = Buffer.allocUnsafe(Math.min(maxBytes, Math.max(16 * 1024, buffer.length * 2, nextSize)))
        buffer.copy(grown, 0, 0, received)
        buffer = grown
      }
      chunk.copy(buffer, received)
      received = nextSize
    }

    function onEnd(): void {
      const compressed = buffer.subarray(0, received)
      cleanup()
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
    }

    function onClose(): void {
      cleanup()
      reject(RESPONSE_SENT)
    }

    req.on("data", onData).once("end", onEnd).once("error", onClose).once("close", onClose)
    res.once("finish", onClose)
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
