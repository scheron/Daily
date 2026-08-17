import {ProtocolError} from "@shared/errors/protocol/ProtocolError"
import {ProtocolErrorCode} from "@shared/errors/protocol/ProtocolErrorCode"

import {findDeviceByTokenHash, touchDevice} from "./DeviceStore"
import {hashToken} from "./tokens"

import type {IncomingMessage} from "node:http"
import type {ServerStore} from "../store/instance"
import type {DeviceRecord} from "./DeviceStore"

const BEARER_PATTERN = /^Bearer (\S+)$/i

/**
 * Resolves an incoming request's bearer token to its device, moving `last_seen_at` forward.
 * Throws `ProtocolError(UNAUTHORIZED)` when the header is missing, malformed or names a token
 * that was never issued, and `ProtocolError(DEVICE_REVOKED)` when the device has been revoked.
 */
export function authenticateRequest(store: ServerStore, req: IncomingMessage): DeviceRecord {
  const header = req.headers.authorization
  const match = typeof header === "string" ? BEARER_PATTERN.exec(header) : null
  if (!match) throw new ProtocolError(ProtocolErrorCode.UNAUTHORIZED)

  const device = findDeviceByTokenHash(store, hashToken(match[1]))
  if (!device) throw new ProtocolError(ProtocolErrorCode.UNAUTHORIZED)
  if (device.revokedAt) throw new ProtocolError(ProtocolErrorCode.DEVICE_REVOKED)

  const lastSeenAt = touchDevice(store, device.id)

  return {...device, lastSeenAt}
}
