import {readFileSync} from "node:fs"
import http from "node:http"
import https from "node:https"

import {SYNC_PROTOCOL_CONFIG} from "@shared/config/syncProtocol"
import {ProtocolError} from "@shared/errors/protocol/ProtocolError"
import {ProtocolErrorCode} from "@shared/errors/protocol/ProtocolErrorCode"

import {respondError, respondOk} from "./respond"
import {routes} from "./routes"

import type {ServerConfig} from "@server/config/resolveServerConfig"
import type {ServerStore} from "@server/store/instance"
import type {IncomingMessage, Server, ServerResponse} from "node:http"

export type RouteContext = {
  req: IncomingMessage
  res: ServerResponse
  store: ServerStore
  config: ServerConfig
  body: unknown
}
export type Route = {method: "GET" | "POST"; path: string; handler: (ctx: RouteContext) => Promise<unknown>}

const RESPONSE_ALREADY_SENT = Symbol("response-already-sent")

/**
 * Creates the Daily Sync Protocol HTTP(S) listener. It matches requests against the route
 * table, reads and caps a `POST` body, dispatches to the matched handler, and maps whatever
 * comes back — a value, a thrown `ProtocolError`, or an unexpected exception — onto the wire
 * envelope. The listener is created but not started; `commands/start.ts` binds it.
 */
export function createHttpServer(store: ServerStore, config: ServerConfig): Server {
  const listener = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const body = req.method === "POST" ? await readRequestBody(req, res) : undefined
      const pathname = new URL(req.url ?? "/", "http://placeholder").pathname
      const route = matchRoute(req.method ?? "", pathname)

      const data = await route.handler({req, res, store, config, body})
      respondOk(res, data)
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
  const atPath = routes.filter((route) => route.path === pathname)
  if (atPath.length === 0) throw new ProtocolError(ProtocolErrorCode.UNKNOWN_ROUTE, `No route for ${pathname}`)

  const route = atPath.find((candidate) => candidate.method === method)
  if (!route) throw new ProtocolError(ProtocolErrorCode.METHOD_NOT_ALLOWED, `${method} not allowed on ${pathname}`)

  return route
}

function readRequestBody(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let received = 0
    let settled = false

    req.on("data", (chunk: Buffer) => {
      if (settled) return

      received += chunk.length
      if (received > SYNC_PROTOCOL_CONFIG.maxControlRequestBodyBytes) {
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

      const raw = Buffer.concat(chunks).toString("utf8")
      if (raw.length === 0) {
        resolve(undefined)
        return
      }

      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "Request body is not valid JSON"))
      }
    })

    req.on("error", (err) => {
      if (settled) return
      settled = true
      reject(err)
    })
  })
}
