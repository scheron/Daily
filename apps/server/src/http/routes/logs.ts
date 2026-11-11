import {SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {authenticateRequest} from "../../devices/authenticateRequest"

import type {RequestLogView} from "@daily/protocol"
import type {Route, RouteContext} from "../createHttpServer"

/** `GET /v1/logs` — any bound device reads the server's request log. The read itself is never logged. */
export const logsRoute: Route = {
  method: "GET",
  path: SYNC_PROTOCOL_PATHS.logs,
  handler: getLogs,
}

async function getLogs(ctx: RouteContext): Promise<RequestLogView> {
  authenticateRequest(ctx.store, ctx.req)

  return {entries: ctx.requestLog.list()}
}
