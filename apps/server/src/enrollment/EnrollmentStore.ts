import {nanoid} from "nanoid"

import {ProtocolError, ProtocolErrorCode, SYNC_PROTOCOL_CONFIG} from "@daily/protocol"

import {generateCode} from "../codes"
import {createDevice, findParentDevice} from "../devices/DeviceStore"
import {hashToken, mintToken} from "../devices/tokens"
import {closeEnrollmentWindow, readEnrollmentWindow} from "../identity/ServerIdentityStore"

import type {DeviceRole, RequestOrigin} from "@daily/protocol"
import type {DeviceRecord} from "../devices/DeviceStore"
import type {ServerStore} from "../store/instance"

export type EnrollmentRecord = {
  id: string
  deviceName: string
  code: string
  state: "pending" | "approved" | "denied"
  createdAt: string
  expiresAt: string
  resolvedAt: string | null
  issuedDeviceId: string | null
  requestedFrom: string | null
  approvedByDeviceId: string | null
}

type EnrollmentRow = {
  id: string
  device_name: string
  code: string
  state: EnrollmentRecord["state"]
  created_at: string
  expires_at: string
  resolved_at: string | null
  issued_device_id: string | null
  requested_from_address: string | null
  approved_by_device_id: string | null
}

type DeviceRow = {
  id: string
  name: string
  role: DeviceRole
  created_at: string
  last_seen_at: string | null
  revoked_at: string | null
}

const COLUMNS = `id, device_name, code, state, created_at, expires_at, resolved_at, issued_device_id, requested_from_address, approved_by_device_id`

/**
 * Opens an enrollment request for an unbound device: a six-digit code the owner compares by eye,
 * and a poll token that authenticates nothing but `GET /v1/enroll/status`. Only the poll token's
 * hash is stored. `requestedFrom` is the caller's own resolved origin — this store never reads
 * `node:http` itself — and only its address is persisted; whether that address is private is
 * derived on read, never stored.
 */
export function createEnrollmentRequest(
  store: ServerStore,
  deviceName: string,
  requestedFrom: RequestOrigin | null = null,
): {record: EnrollmentRecord; pollToken: string} {
  const pollToken = mintToken()

  const create = store.db.transaction((): EnrollmentRecord => {
    if (!readEnrollmentWindow(store)) {
      throw new ProtocolError(
        ProtocolErrorCode.ENROLLMENT_WINDOW_CLOSED,
        "This server is not expecting a new device right now. Ask the Mac that administers it to add a device, then try again.",
      )
    }

    if (findPendingEnrollment(store)) {
      throw new ProtocolError(ProtocolErrorCode.ENROLLMENT_IN_PROGRESS, "Another device is already waiting to be enrolled")
    }

    const now = new Date()
    const record: EnrollmentRecord = {
      id: nanoid(),
      deviceName,
      code: generateCode(),
      state: "pending",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SYNC_PROTOCOL_CONFIG.enrollmentTtlMs).toISOString(),
      resolvedAt: null,
      issuedDeviceId: null,
      requestedFrom: requestedFrom?.address ?? null,
      approvedByDeviceId: null,
    }

    store.db
      .prepare(
        `INSERT INTO enrollment_requests (id, device_name, code, poll_token_hash, state, created_at, expires_at, resolved_at, approved_by_device_id, issued_device_id, requested_from_address)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL, NULL, NULL, ?)`,
      )
      .run(record.id, record.deviceName, record.code, hashToken(pollToken), record.createdAt, record.expiresAt, record.requestedFrom)

    return record
  })

  return {record: create.immediate(), pollToken}
}

/** Returns the one request still waiting for a decision, or `null` when none is waiting or the waiting one has lapsed. */
export function findPendingEnrollment(store: ServerStore): EnrollmentRecord | null {
  clearExpiredIssuedTokens(store)

  const row = store.db
    .prepare(`SELECT ${COLUMNS} FROM enrollment_requests WHERE state = 'pending' ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .get() as EnrollmentRow | undefined

  if (!row) return null

  const record = toEnrollmentRecord(row)

  return isExpired(record, new Date().toISOString()) ? null : record
}

/** Resolves the poll token an asking device was handed back to its own request. */
export function findEnrollmentByPollToken(store: ServerStore, pollToken: string): EnrollmentRecord | null {
  clearExpiredIssuedTokens(store)

  const row = store.db.prepare(`SELECT ${COLUMNS} FROM enrollment_requests WHERE poll_token_hash = ?`).get(hashToken(pollToken)) as
    | EnrollmentRow
    | undefined

  return row ? toEnrollmentRecord(row) : null
}

/**
 * Approves a waiting request on behalf of an already-bound device, minting the asking device's
 * record. The whole check-and-write happens inside one transaction — the request is re-read
 * there, so two approvals arriving together produce one device, not two.
 */
export function approveEnrollment(store: ServerStore, requestId: string, code: string, approvedBy: string): {device: DeviceRecord; token: string} {
  const approve = store.db.transaction((): {device: DeviceRecord; token: string} => {
    const record = requirePendingRequest(store, requestId)

    if (record.code !== code) {
      throw new ProtocolError(ProtocolErrorCode.ENROLLMENT_CODE_MISMATCH, "This code does not match the request waiting for approval")
    }

    const {device, token} = createDevice(store, record.deviceName, "child")
    store.db
      .prepare(
        `UPDATE enrollment_requests SET state = 'approved', resolved_at = ?, approved_by_device_id = ?, issued_device_id = ?, issued_token = ? WHERE id = ?`,
      )
      .run(new Date().toISOString(), approvedBy, device.id, token, record.id)
    closeEnrollmentWindow(store)

    return {device, token}
  })

  return approve.immediate()
}

/** Refuses a waiting request. The asking device is told `denied` on its next poll and is given nothing. */
export function denyEnrollment(store: ServerStore, requestId: string): void {
  const deny = store.db.transaction((): void => {
    const record = requirePendingRequest(store, requestId)

    store.db.prepare(`UPDATE enrollment_requests SET state = 'denied', resolved_at = ? WHERE id = ?`).run(new Date().toISOString(), record.id)
  })

  deny.immediate()
}

/**
 * Hands the asking device the credential its approval minted, read back unchanged from
 * `issued_token`. The token is minted once, at approval, and never re-minted: a later poll returns
 * the identical string, so a device that already authenticated with an earlier response keeps
 * working. Also names the device that approved it, `null` when the enrollment carries none.
 */
export function issueEnrolledCredential(
  store: ServerStore,
  record: EnrollmentRecord,
): {device: DeviceRecord; token: string; approvedBy: string | null} {
  const row = store.db.prepare(`SELECT id, name, role, created_at, last_seen_at, revoked_at FROM devices WHERE id = ?`).get(record.issuedDeviceId) as
    | DeviceRow
    | undefined

  if (!row) throw new ProtocolError(ProtocolErrorCode.ENROLLMENT_NOT_FOUND, "This enrollment has no device to hand over")

  const issued = store.db.prepare(`SELECT issued_token FROM enrollment_requests WHERE id = ?`).get(record.id) as {issued_token: string | null}
  if (!issued.issued_token) throw new ProtocolError(ProtocolErrorCode.ENROLLMENT_NOT_FOUND, "This enrollment has no credential left to hand over")

  return {
    device: {id: row.id, name: row.name, role: row.role, createdAt: row.created_at, lastSeenAt: row.last_seen_at, revokedAt: row.revoked_at},
    token: issued.issued_token,
    approvedBy: record.approvedByDeviceId ? readDeviceName(store, record.approvedByDeviceId) : null,
  }
}

/**
 * Drops the plaintext credential of every request whose pickup window has closed, so the column
 * holds a token only while that token is still collectable. It runs from the paths that already
 * read this table — a lazy clear, not a sweeper: nothing schedules it and nothing runs in the
 * background. A request the asking device never polls again is therefore cleared by the next
 * enrollment call any device makes, or by the next server start.
 */
export function clearExpiredIssuedTokens(store: ServerStore): void {
  const collectableSince = new Date(Date.now() - SYNC_PROTOCOL_CONFIG.enrollmentTtlMs).toISOString()

  store.db
    .prepare(`UPDATE enrollment_requests SET issued_token = NULL WHERE issued_token IS NOT NULL AND (resolved_at IS NULL OR resolved_at <= ?)`)
    .run(collectableSince)
}

export type ConsoleEnrollment = {token: string; expiresAt: string}

/**
 * Mints a single-use console enrollment token, for when the console is the only door left — every
 * bound device is gone. A full credential, not a six-digit code: it authenticates by itself, with
 * no human comparing it to anything. Only its hash is stored; the plaintext is returned once and
 * is the console operator's to relay.
 */
export function createConsoleEnrollment(store: ServerStore): ConsoleEnrollment {
  const token = mintToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SYNC_PROTOCOL_CONFIG.consoleEnrollmentTtlMs).toISOString()

  store.db
    .prepare(
      `INSERT INTO console_enrollments (id, token_hash, created_at, expires_at, consumed_at, issued_device_id) VALUES (?, ?, ?, ?, NULL, NULL)`,
    )
    .run(nanoid(), hashToken(token), now.toISOString(), expiresAt)

  return {token, expiresAt}
}

/**
 * Binds a fresh device with a console-issued token, once. The whole check-and-write happens
 * inside one transaction — the token's row is re-read there, so two callers racing on the same
 * token cannot both pass the check and each bind a device from it. An unknown token, an
 * already-consumed one and an expired one all fail the same way, on purpose: distinguishing them
 * would tell an unauthenticated caller which of its guesses was once real.
 */
export function consumeConsoleEnrollment(store: ServerStore, token: string, deviceName: string): {device: DeviceRecord; token: string} {
  const consume = store.db.transaction((): {device: DeviceRecord; token: string} => {
    const row = store.db.prepare(`SELECT id, consumed_at, expires_at FROM console_enrollments WHERE token_hash = ?`).get(hashToken(token)) as
      | {id: string; consumed_at: string | null; expires_at: string}
      | undefined

    if (!row || row.consumed_at !== null || Date.parse(row.expires_at) <= Date.now()) {
      throw new ProtocolError(ProtocolErrorCode.INVALID_ENROLLMENT_TOKEN, "This enrollment token is not valid")
    }

    const role: DeviceRole = findParentDevice(store) === null ? "parent" : "child"
    const {device, token: deviceToken} = createDevice(store, deviceName, role)
    store.db
      .prepare(`UPDATE console_enrollments SET consumed_at = ?, issued_device_id = ? WHERE id = ?`)
      .run(new Date().toISOString(), device.id, row.id)

    return {device, token: deviceToken}
  })

  return consume.immediate()
}

/**
 * Reports whether a request has run out of time. Expiry is derived, never stored, and the
 * deadline it reads depends on the state: a `pending` request expires at `expiresAt`, an
 * `approved` one at `resolvedAt` plus the enrollment TTL — the window its device has to collect
 * the credential — and a `denied` one never expires, because `denied` is the answer it keeps.
 */
export function isExpired(record: EnrollmentRecord, now: string): boolean {
  const at = Date.parse(now)

  if (record.state === "denied") return false

  if (record.state === "approved") {
    if (!record.resolvedAt) return true

    return at >= Date.parse(record.resolvedAt) + SYNC_PROTOCOL_CONFIG.enrollmentTtlMs
  }

  return at >= Date.parse(record.expiresAt)
}

function requirePendingRequest(store: ServerStore, requestId: string): EnrollmentRecord {
  clearExpiredIssuedTokens(store)

  const row = store.db.prepare(`SELECT ${COLUMNS} FROM enrollment_requests WHERE id = ?`).get(requestId) as EnrollmentRow | undefined
  if (!row) throw new ProtocolError(ProtocolErrorCode.ENROLLMENT_NOT_FOUND, "No such enrollment request")

  const record = toEnrollmentRecord(row)
  if (record.state !== "pending" || isExpired(record, new Date().toISOString())) {
    throw new ProtocolError(ProtocolErrorCode.ENROLLMENT_NOT_PENDING, "This enrollment request is no longer pending")
  }

  return record
}

function toEnrollmentRecord(row: EnrollmentRow): EnrollmentRecord {
  return {
    id: row.id,
    deviceName: row.device_name,
    code: row.code,
    state: row.state,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    resolvedAt: row.resolved_at,
    issuedDeviceId: row.issued_device_id,
    requestedFrom: row.requested_from_address,
    approvedByDeviceId: row.approved_by_device_id,
  }
}

function readDeviceName(store: ServerStore, deviceId: string): string | null {
  const row = store.db.prepare(`SELECT name FROM devices WHERE id = ?`).get(deviceId) as {name: string} | undefined

  return row ? row.name : null
}
