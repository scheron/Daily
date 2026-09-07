import {readFileSync} from "node:fs"
import http from "node:http"
import https from "node:https"
import {gunzipSync} from "node:zlib"

import {ProtocolError, ProtocolErrorCode, SYNC_PROTOCOL_CONFIG} from "@daily/protocol"

import {respondError, respondOk, RESPONSE_SENT} from "./respond"
import {routes} from "./routes"

import type {IncomingMessage, Server, ServerResponse} from "node:http"
import type {ServerConfig} from "../config/resolveServerConfig"
import type {ServerStore} from "../store/instance"

export type RouteContext = {
  req: IncomingMessage
  res: ServerResponse
  store: ServerStore
  config: ServerConfig
  body: unknown
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

/**
 * Creates the Daily Sync Protocol HTTP(S) listener. It matches requests against the route
 * table, reads and caps a `POST` body under the matched route's own limit, dispatches to the
 * matched handler, and maps whatever comes back — a value, a thrown `ProtocolError`, or an
 * unexpected exception — onto the wire envelope. The listener is created but not started;
 * `commands/start.ts` binds it.
 */
export function createHttpServer(store: ServerStore, config: ServerConfig): Server {
  const listener = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const pathname = new URL(req.url ?? "/", "http://placeholder").pathname
      const route = matchRoute(req.method ?? "", pathname)

      const body =
        route.body === "stream" ? undefined : req.method === "POST" ? await readRequestBody(req, res, resolveBodyLimit(route, config)) : undefined

      const data = await route.handler({req, res, store, config, body})
      if (data !== RESPONSE_SENT) respondOk(res, data, acceptsGzip(req))
    } catch (err) {
      if (err === RESPONSE_ALREADY_SENT) return

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
