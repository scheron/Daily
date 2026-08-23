import {ProtocolError} from "@shared/errors/protocol/ProtocolError"
import {ProtocolErrorCode} from "@shared/errors/protocol/ProtocolErrorCode"
import {SYNC_PROTOCOL_PATHS} from "@shared/types/syncProtocol"

import {authenticateRequest} from "@server/devices/authenticateRequest"
import {findPendingEnrollment} from "@server/enrollment/EnrollmentStore"
import {isClaimed} from "@server/identity/ServerIdentityStore"
import {isStorableSnapshot, readRevision, readSnapshot, writeSnapshotIfUnchanged} from "@server/snapshot/SnapshotStore"

import type {ServerStore} from "@server/store/instance"
import type {RevisionProbe, SnapshotReadResponse, SnapshotWriteBody, SnapshotWriteResponse} from "@shared/types/syncProtocol"
import type {Route, RouteContext} from "../createHttpServer"

/** `GET /v1/snapshot` — any bound device reads the stored snapshot and the revision it was read at. */
export const snapshotReadRoute: Route = {
  method: "GET",
  path: SYNC_PROTOCOL_PATHS.snapshot,
  handler: getSnapshot,
}

/** `POST /v1/snapshot` — any bound device writes its merged snapshot back, accepted only at the revision it read. */
export const snapshotWriteRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.snapshot,
  bodyLimit: "snapshot",
  handler: postSnapshot,
}

/** `GET /v1/revision` — any bound device polls this cheap two-field probe instead of pulling the whole snapshot. */
export const revisionRoute: Route = {
  method: "GET",
  path: SYNC_PROTOCOL_PATHS.revision,
  handler: getRevision,
}

async function getSnapshot(ctx: RouteContext): Promise<SnapshotReadResponse> {
  requireClaimedServer(ctx.store)
  authenticateRequest(ctx.store, ctx.req)

  const stored = readSnapshot(ctx.store)

  return {snapshot: stored ? stored.document : null, revision: stored ? stored.revision : null}
}

async function postSnapshot(ctx: RouteContext): Promise<SnapshotWriteResponse> {
  requireClaimedServer(ctx.store)
  const device = authenticateRequest(ctx.store, ctx.req)

  if (typeof ctx.body !== "object" || ctx.body === null) {
    throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "A snapshot write needs a body")
  }

  const body = ctx.body as Partial<SnapshotWriteBody>
  if (!("snapshot" in body) || (typeof body.expectedRevision !== "string" && body.expectedRevision !== null)) {
    throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "A snapshot write needs a snapshot and an expectedRevision")
  }

  if (!isStorableSnapshot(body.snapshot)) {
    throw new ProtocolError(ProtocolErrorCode.INVALID_SNAPSHOT, "This body is not a storable snapshot")
  }

  const revision = writeSnapshotIfUnchanged(ctx.store, body.snapshot, body.expectedRevision, device.id)

  return {revision}
}

async function getRevision(ctx: RouteContext): Promise<RevisionProbe> {
  requireClaimedServer(ctx.store)
  authenticateRequest(ctx.store, ctx.req)

  return {
    revision: readRevision(ctx.store),
    pendingEnrollment: findPendingEnrollment(ctx.store) !== null,
  }
}

function requireClaimedServer(store: ServerStore): void {
  if (!isClaimed(store)) throw new ProtocolError(ProtocolErrorCode.SERVER_NOT_CLAIMED, "This server has not been claimed yet")
}
