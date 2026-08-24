import {timingSafeEqual} from "node:crypto"

import {ProtocolError, ProtocolErrorCode, SYNC_PROTOCOL_CONFIG, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {createDevice} from "../../devices/DeviceStore"
import {markClaimed} from "../../identity/ServerIdentityStore"

import type {ClaimBody, ClaimResponse} from "@daily/protocol"
import type {ServerStore} from "../../store/instance"
import type {Route, RouteContext} from "../createHttpServer"

type ClaimStateRow = {claimed_at: string | null; claim_code: string | null; claim_attempts: number; claim_locked_at: string | null}

type ClaimOutcome = {outcome: "claimed"; credential: ClaimResponse} | {outcome: "already-claimed"} | {outcome: "locked"} | {outcome: "invalid-code"}

/** `POST /v1/claim` — unauthenticated by definition: the caller has no credential yet, and the claim code is the credential. */
export const claimRoute: Route = {
  method: "POST",
  path: SYNC_PROTOCOL_PATHS.claim,
  handler: postClaim,
}

/**
 * Binds the first device to an unclaimed server. The whole check-and-write happens inside one
 * transaction — the identity row is re-read there, so two claims arriving together cannot both
 * pass the check and leave the server with two "first" devices. A refusal is returned from the
 * transaction rather than thrown out of it, so a wrong attempt still commits its count.
 */
export function claimServer(store: ServerStore, code: string, deviceName: string): ClaimResponse {
  const claim = store.db.transaction((): ClaimOutcome => {
    const row = store.db
      .prepare(`SELECT claimed_at, claim_code, claim_attempts, claim_locked_at FROM server_identity WHERE id = 1`)
      .get() as ClaimStateRow

    if (row.claimed_at) return {outcome: "already-claimed"}
    if (row.claim_locked_at) return {outcome: "locked"}

    if (!row.claim_code || !matchesClaimCode(code, row.claim_code)) {
      recordFailedAttempt(store, row.claim_attempts)
      return {outcome: "invalid-code"}
    }

    const {device, token} = createDevice(store, deviceName)
    markClaimed(store, new Date().toISOString())
    store.db.prepare(`UPDATE server_identity SET claim_code = NULL WHERE id = 1`).run()

    return {outcome: "claimed", credential: {device: {id: device.id, name: device.name, createdAt: device.createdAt}, token}}
  })

  const result = claim.immediate()

  if (result.outcome === "already-claimed") throw new ProtocolError(ProtocolErrorCode.ALREADY_CLAIMED, "This server has already been claimed")
  if (result.outcome === "locked") {
    throw new ProtocolError(ProtocolErrorCode.CLAIM_CODE_LOCKED, "Too many wrong claim codes; regenerate the code from the server console")
  }
  if (result.outcome === "invalid-code") throw new ProtocolError(ProtocolErrorCode.INVALID_CLAIM_CODE, "The claim code is not correct")

  return result.credential
}

async function postClaim(ctx: RouteContext): Promise<ClaimResponse> {
  const body = (ctx.body ?? {}) as Partial<ClaimBody>

  if (typeof body.code !== "string" || typeof body.deviceName !== "string" || body.deviceName.trim().length === 0) {
    throw new ProtocolError(ProtocolErrorCode.MALFORMED_REQUEST, "A claim needs a code and a device name")
  }

  return claimServer(ctx.store, body.code, body.deviceName.trim())
}

function recordFailedAttempt(store: ServerStore, attemptsSoFar: number): void {
  const attempts = attemptsSoFar + 1
  const lockedAt = attempts >= SYNC_PROTOCOL_CONFIG.claimAttemptLimit ? new Date().toISOString() : null

  store.db
    .prepare(`UPDATE server_identity SET claim_attempts = ?, claim_locked_at = COALESCE(claim_locked_at, ?) WHERE id = 1`)
    .run(attempts, lockedAt)
}

function matchesClaimCode(presented: string, stored: string): boolean {
  const shape = new RegExp(`^\\d{${SYNC_PROTOCOL_CONFIG.codeLength}}$`)
  if (!shape.test(presented) || presented.length !== stored.length) return false

  return timingSafeEqual(Buffer.from(presented, "utf8"), Buffer.from(stored, "utf8"))
}
