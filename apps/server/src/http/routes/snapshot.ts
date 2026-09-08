import {setTimeout as delay} from "node:timers/promises"

import {ProtocolError, ProtocolErrorCode, SYNC_PROTOCOL_CONFIG, SYNC_PROTOCOL_PATHS, SYNC_PROTOCOL_VERSION} from "@daily/protocol"

import {authenticateRequest} from "../../devices/authenticateRequest"
import {findPendingEnrollment} from "../../enrollment/EnrollmentStore"
import {isClaimed} from "../../identity/ServerIdentityStore"
import {isStorableSnapshot, readRevision, readSnapshot, writeSnapshotIfUnchanged} from "../../snapshot/SnapshotStore"
import {RESPONSE_SENT} from "../respond"

import type {RevisionProbe, SnapshotReadResponse, SnapshotWriteBody, SnapshotWriteResponse} from "@daily/protocol"
import type {ServerStore} from "../../store/instance"
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

/**
 * How often a held request re-reads the store while it waits. Bounded and cheap — a `better-sqlite3`
 * read, not a network call — so this stays a periodic re-check rather than a tight loop.
 */
const REVISION_HOLD_POLL_INTERVAL_MS = 250

async function getRevision(ctx: RouteContext): Promise<RevisionProbe | typeof RESPONSE_SENT> {
  requireClaimedServer(ctx.store)
  authenticateRequest(ctx.store, ctx.req)

  const knownRevision = new URL(ctx.req.url ?? "/", "http://placeholder").searchParams.get("knownRevision")
  if (knownRevision === null) return readRevisionProbe(ctx.store)

  return holdForRevisionChange(ctx, knownRevision)
}

function readRevisionProbe(store: RouteContext["store"]): RevisionProbe {
  return {
    revision: readRevision(store),
    pendingEnrollment: findPendingEnrollment(store) !== null,
    protocol: SYNC_PROTOCOL_VERSION,
  }
}

/**
 * Holds the response until the stored revision moves away from `knownRevision`, an enrollment
 * starts waiting, or `revisionHoldMs` passes — whichever comes first. A hold that reaches its own
 * end is answered with the (unchanged) current probe, exactly as an immediate request would be.
 *
 * A caller that stops waiting (its own timeout, or the device stopping its probe loop) closes the
 * connection from its side; this is noticed via `res`'s `close` event so the loop stops re-reading
 * the store and returns `RESPONSE_SENT` rather than writing to a socket nobody is reading anymore.
 */
async function holdForRevisionChange(ctx: RouteContext, knownRevision: string): Promise<RevisionProbe | typeof RESPONSE_SENT> {
  let callerGone = false
  const onCallerGone = (): void => {
    callerGone = true
  }
  ctx.res.once("close", onCallerGone)

  try {
    const deadline = Date.now() + SYNC_PROTOCOL_CONFIG.revisionHoldMs

    while (true) {
      if (callerGone) return RESPONSE_SENT

      const probe = readRevisionProbe(ctx.store)
      if (probe.revision !== knownRevision || probe.pendingEnrollment) return probe

      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) return probe

      await delay(Math.min(REVISION_HOLD_POLL_INTERVAL_MS, remainingMs))
    }
  } finally {
    ctx.res.removeListener("close", onCallerGone)
  }
}

function requireClaimedServer(store: ServerStore): void {
  if (!isClaimed(store)) throw new ProtocolError(ProtocolErrorCode.SERVER_NOT_CLAIMED, "This server has not been claimed yet")
}
