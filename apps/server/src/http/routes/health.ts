import {RESPONSE_SENT} from "../respond"

import type {Route, RouteContext} from "../createHttpServer"

/**
 * Where the health route answers. Deliberately not an entry in `SYNC_PROTOCOL_PATHS`: monitoring
 * is a contract with whoever watches this server, not with the app, and raising
 * `SYNC_PROTOCOL_VERSION` must never move it or change what it returns.
 */
export const HEALTH_PATH = "/health"

/**
 * `GET /health` — unauthenticated liveness, for an uptime monitor or a container probe.
 *
 * It answers `{"status":"ok"}` and nothing else, on purpose. `GET /v1/server` would serve the same
 * monitoring need, but it publishes the server's id, its name and whether it has been claimed — so
 * pointing a monitor at it would make a route that tells a stranger which servers are still
 * claimable into the one route guaranteed to be reachable. This one discloses nothing.
 *
 * It also touches neither the store nor the identity, so it still answers while the database is
 * busy, and it answers the same before and after the server is claimed.
 */
export const healthRoute: Route = {
  method: "GET",
  path: HEALTH_PATH,
  handler: getHealth,
}

async function getHealth(ctx: RouteContext): Promise<typeof RESPONSE_SENT> {
  ctx.res.writeHead(200, {"content-type": "application/json"})
  ctx.res.end(`{"status":"ok"}`)

  return RESPONSE_SENT
}
