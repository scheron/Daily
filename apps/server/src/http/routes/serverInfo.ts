import {SYNC_PROTOCOL_PATHS, SYNC_PROTOCOL_VERSION} from "@daily/protocol"

import {loadIdentity} from "../../identity/ServerIdentityStore"

import type {ServerInfo} from "@daily/protocol"
import type {Route, RouteContext} from "../createHttpServer"

/** `GET /v1/server` — unauthenticated identity: protocol version, server id, name and claimed state. */
export const serverInfoRoute: Route = {
  method: "GET",
  path: SYNC_PROTOCOL_PATHS.server,
  handler: getServerInfo,
}

async function getServerInfo(ctx: RouteContext): Promise<ServerInfo> {
  const identity = loadIdentity(ctx.store)

  return {
    protocol: SYNC_PROTOCOL_VERSION,
    serverId: identity.serverId,
    name: identity.name,
    claimed: identity.claimedAt !== null,
  }
}
