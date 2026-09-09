import {ProtocolError, ProtocolErrorCode, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {authenticateParent} from "../../devices/authenticateRequest"
import {listDevices, revokeDevice} from "../../devices/DeviceStore"
import {isClaimed, readEnrollmentWindow} from "../../identity/ServerIdentityStore"

import type {DeviceListResponse, RevokeDeviceBody} from "@daily/protocol"
import type {ServerStore} from "../../store/instance"
import type {Route, RouteContext} from "../createHttpServer"

/** `GET /v1/devices` — only the Parent reads the full membership; a Child is refused `NOT_PARENT`. */
export const devicesRoute: Route = {
  method: "GET",
  path: SYNC_PROTOCOL_PATHS.devices,
  handler: getDevices,
}

/** `POST /v1/devices/revoke` — only the Parent withdraws another device's access; a Child is refused `NOT_PARENT`. */
export const deviceRevokeRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.deviceRevoke,
  handler: postDeviceRevoke,
}

async function getDevices(ctx: RouteContext): Promise<DeviceListResponse> {
  requireClaimedServer(ctx.store)
  authenticateParent(ctx.store, ctx.req)

  return readDeviceListResponse(ctx.store)
}

async function postDeviceRevoke(ctx: RouteContext): Promise<DeviceListResponse> {
  requireClaimedServer(ctx.store)
  const approver = authenticateParent(ctx.store, ctx.req)

  const body = (ctx.body ?? {}) as Partial<RevokeDeviceBody>
  if (typeof body.deviceId !== "string") {
    throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "A revoke needs a deviceId")
  }

  if (body.deviceId === approver.id) {
    throw new ProtocolError(ProtocolErrorCode.CANNOT_REVOKE_PARENT, "The Parent cannot revoke its own access")
  }

  const revoked = revokeDevice(ctx.store, body.deviceId)
  if (!revoked) throw new ProtocolError(ProtocolErrorCode.DEVICE_NOT_FOUND, `No such device: ${body.deviceId}`)

  return readDeviceListResponse(ctx.store)
}

function readDeviceListResponse(store: ServerStore): DeviceListResponse {
  return {
    devices: listDevices(store).map((device) => ({
      id: device.id,
      name: device.name,
      role: device.role,
      createdAt: device.createdAt,
      lastSeenAt: device.lastSeenAt,
      revokedAt: device.revokedAt,
    })),
    enrollmentWindow: readEnrollmentWindow(store),
  }
}

function requireClaimedServer(store: ServerStore): void {
  if (!isClaimed(store)) throw new ProtocolError(ProtocolErrorCode.SERVER_NOT_CLAIMED, "This server has not been claimed yet")
}
