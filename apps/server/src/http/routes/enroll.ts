import {ProtocolError, ProtocolErrorCode, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {authenticateParent} from "../../devices/authenticateRequest"
import {
  approveEnrollment,
  consumeConsoleEnrollment,
  createEnrollmentRequest,
  denyEnrollment,
  findEnrollmentByPollToken,
  findPendingEnrollment,
  isExpired,
  issueEnrolledCredential,
} from "../../enrollment/EnrollmentStore"
import {closeEnrollmentWindow, isClaimed, openEnrollmentWindow} from "../../identity/ServerIdentityStore"
import {isPrivateAddress, readRequestOrigin} from "../requestOrigin"

import type {
  ApproveEnrollmentBody,
  ConsoleEnrollBody,
  ConsoleEnrollResponse,
  DenyEnrollmentBody,
  EnrollmentStatus,
  EnrollmentWindow,
  EnrollRequestBody,
  EnrollRequestResponse,
  PendingEnrollmentResponse,
} from "@daily/protocol"
import type {IncomingMessage} from "node:http"
import type {ServerStore} from "../../store/instance"
import type {Route, RouteContext} from "../createHttpServer"

/** `POST /v1/enroll/request` — unauthenticated: the asking device has no credential yet, which is the whole point. */
export const enrollRequestRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.enrollRequest,
  handler: postEnrollRequest,
}

/** `GET /v1/enroll/status` — authenticated by the request's own poll token, which is not a device credential and never reaches the bearer check. */
export const enrollStatusRoute: Route = {
  method: "GET",
  path: SYNC_PROTOCOL_PATHS.enrollStatus,
  handler: getEnrollStatus,
}

/** `GET /v1/enroll/pending` — only the Parent reads the one waiting request; a Child is refused `NOT_PARENT`. */
export const enrollPendingRoute: Route = {
  method: "GET",
  path: SYNC_PROTOCOL_PATHS.enrollPending,
  handler: getEnrollPending,
}

/** `POST /v1/enroll/approve` — only the Parent approves the waiting request; a Child is refused `NOT_PARENT`. */
export const enrollApproveRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.enrollApprove,
  handler: postEnrollApprove,
}

/** `POST /v1/enroll/deny` — only the Parent refuses the waiting request; a Child is refused `NOT_PARENT`. The asking device is given nothing either way. */
export const enrollDenyRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.enrollDeny,
  handler: postEnrollDeny,
}

/** `POST /v1/enroll/window/open` — only the Parent opens the door for one device to ask to enroll; a Child is refused `NOT_PARENT`. */
export const enrollWindowOpenRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.enrollWindowOpen,
  handler: postEnrollWindowOpen,
}

/** `POST /v1/enroll/window/close` — only the Parent closes the door early; a Child is refused `NOT_PARENT`. */
export const enrollWindowCloseRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.enrollWindowClose,
  handler: postEnrollWindowClose,
}

/**
 * `POST /v1/enroll/console` — unauthenticated: this door exists for when every device is gone, so
 * there is no credential to require. It shares no code path with the five peer-approval handlers
 * above; a console-issued token is checked and consumed by `consumeConsoleEnrollment` alone.
 */
export const enrollConsoleRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.enrollConsole,
  handler: postEnrollConsole,
}

async function postEnrollRequest(ctx: RouteContext): Promise<EnrollRequestResponse> {
  requireClaimedServer(ctx.store)

  const body = (ctx.body ?? {}) as Partial<EnrollRequestBody>
  if (typeof body.deviceName !== "string" || body.deviceName.trim().length === 0) {
    throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "An enrollment request needs a device name")
  }

  const requestedFrom = readRequestOrigin(ctx.req)
  const {record, pollToken} = createEnrollmentRequest(ctx.store, body.deviceName.trim(), requestedFrom)

  return {requestId: record.id, code: record.code, pollToken, expiresAt: record.expiresAt}
}

async function getEnrollStatus(ctx: RouteContext): Promise<EnrollmentStatus> {
  requireClaimedServer(ctx.store)

  const record = findEnrollmentByPollToken(ctx.store, readPollToken(ctx.req))
  if (!record) throw new ProtocolError(ProtocolErrorCode.INVALID_ENROLLMENT_TOKEN, "This enrollment token is not valid")

  if (record.state === "denied") return {state: "denied"}

  if (isExpired(record, new Date().toISOString())) return {state: "expired"}

  if (record.state === "approved") {
    const {device, token, approvedBy} = issueEnrolledCredential(ctx.store, record)

    return {state: "approved", device: {id: device.id, name: device.name, createdAt: device.createdAt}, token, approvedBy}
  }

  return {state: "pending"}
}

async function getEnrollPending(ctx: RouteContext): Promise<PendingEnrollmentResponse> {
  requireClaimedServer(ctx.store)
  authenticateParent(ctx.store, ctx.req)

  const record = findPendingEnrollment(ctx.store)
  if (!record) return {request: null}

  return {
    request: {
      requestId: record.id,
      code: record.code,
      deviceName: record.deviceName,
      requestedAt: record.createdAt,
      expiresAt: record.expiresAt,
      requestedFrom: record.requestedFrom ? {address: record.requestedFrom, isPrivate: isPrivateAddress(record.requestedFrom)} : null,
    },
  }
}

async function postEnrollApprove(ctx: RouteContext): Promise<void> {
  requireClaimedServer(ctx.store)
  const approver = authenticateParent(ctx.store, ctx.req)

  const body = (ctx.body ?? {}) as Partial<ApproveEnrollmentBody>
  if (typeof body.requestId !== "string" || typeof body.code !== "string") {
    throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "An approval needs a request id and a code")
  }

  approveEnrollment(ctx.store, body.requestId, body.code, approver.id)
}

async function postEnrollDeny(ctx: RouteContext): Promise<void> {
  requireClaimedServer(ctx.store)
  authenticateParent(ctx.store, ctx.req)

  const body = (ctx.body ?? {}) as Partial<DenyEnrollmentBody>
  if (typeof body.requestId !== "string") {
    throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "A denial needs a request id")
  }

  denyEnrollment(ctx.store, body.requestId)
}

async function postEnrollWindowOpen(ctx: RouteContext): Promise<EnrollmentWindow> {
  requireClaimedServer(ctx.store)
  authenticateParent(ctx.store, ctx.req)

  return openEnrollmentWindow(ctx.store)
}

async function postEnrollWindowClose(ctx: RouteContext): Promise<void> {
  requireClaimedServer(ctx.store)
  authenticateParent(ctx.store, ctx.req)

  closeEnrollmentWindow(ctx.store)
}

async function postEnrollConsole(ctx: RouteContext): Promise<ConsoleEnrollResponse> {
  requireClaimedServer(ctx.store)

  const body = (ctx.body ?? {}) as Partial<ConsoleEnrollBody>
  if (typeof body.token !== "string" || typeof body.deviceName !== "string" || body.deviceName.trim().length === 0) {
    throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "A console enrollment needs a token and a device name")
  }

  const {device, token} = consumeConsoleEnrollment(ctx.store, body.token, body.deviceName.trim())

  return {device: {id: device.id, name: device.name, createdAt: device.createdAt}, token}
}

function requireClaimedServer(store: ServerStore): void {
  if (!isClaimed(store)) throw new ProtocolError(ProtocolErrorCode.SERVER_NOT_CLAIMED, "This server has not been claimed yet")
}

function readPollToken(req: IncomingMessage): string {
  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? "")
  if (!match) throw new ProtocolError(ProtocolErrorCode.INVALID_ENROLLMENT_TOKEN, "This enrollment token is not valid")

  return match[1]
}
