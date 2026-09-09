import {customAlphabet, urlAlphabet} from "nanoid"

import {ProtocolError, ProtocolErrorCode} from "@daily/protocol"

import {hashToken, mintToken} from "./tokens"

import type {DeviceRole} from "@daily/protocol"
import type {ServerStore} from "../store/instance"

const DEVICE_ID_ALPHABET = urlAlphabet.replace(/[-_]/g, "")
const generateDeviceId = customAlphabet(DEVICE_ID_ALPHABET, 21)

export type DeviceRecord = {
  id: string
  name: string
  role: DeviceRole
  createdAt: string
  lastSeenAt: string | null
  revokedAt: string | null
}

type DeviceRow = {
  id: string
  name: string
  role: DeviceRole
  created_at: string
  last_seen_at: string | null
  revoked_at: string | null
}

const SELECT_COLUMNS = `id, name, role, created_at, last_seen_at, revoked_at`

/** Creates a device, minting its credential and persisting only the credential's hash; the plaintext token is returned once and never recoverable afterwards. */
export function createDevice(store: ServerStore, name: string, role: DeviceRole = "child"): {device: DeviceRecord; token: string} {
  const token = mintToken()
  const device: DeviceRecord = {
    id: generateDeviceId(),
    name,
    role,
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
    revokedAt: null,
  }

  store.db
    .prepare(`INSERT INTO devices (id, name, role, token_hash, created_at, last_seen_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL, NULL)`)
    .run(device.id, device.name, device.role, hashToken(token), device.createdAt)

  return {device, token}
}

/** Lists every device, active first by `createdAt` ascending, then revoked ones by `revokedAt` descending. */
export function listDevices(store: ServerStore): DeviceRecord[] {
  const rows = store.db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM devices
       ORDER BY
         CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END ASC,
         CASE WHEN revoked_at IS NULL THEN created_at END ASC,
         CASE WHEN revoked_at IS NOT NULL THEN revoked_at END DESC`,
    )
    .all() as DeviceRow[]

  return rows.map(toDeviceRecord)
}

/** Revokes a device by id, clearing its role in the same statement so a revoked device never holds the Parent role, and leaving its row in place. Returns `null` when no such device exists, and the record unchanged when it was already revoked. */
export function revokeDevice(store: ServerStore, deviceId: string): DeviceRecord | null {
  const existing = findDeviceById(store, deviceId)
  if (!existing) return null
  if (existing.revokedAt) return existing

  const revokedAt = new Date().toISOString()
  store.db.prepare(`UPDATE devices SET role = 'child', revoked_at = ? WHERE id = ?`).run(revokedAt, deviceId)

  return {...existing, role: "child", revokedAt}
}

/** Counts devices that have not been revoked. */
export function countActiveDevices(store: ServerStore): number {
  const row = store.db.prepare(`SELECT COUNT(*) as count FROM devices WHERE revoked_at IS NULL`).get() as {count: number}

  return row.count
}

/** Finds a device by the hash of a presented token, for the bearer check. */
export function findDeviceByTokenHash(store: ServerStore, tokenHash: string): DeviceRecord | null {
  const row = store.db.prepare(`SELECT ${SELECT_COLUMNS} FROM devices WHERE token_hash = ?`).get(tokenHash) as DeviceRow | undefined

  return row ? toDeviceRecord(row) : null
}

/** Moves a device's `last_seen_at` forward to now, in one indexed `UPDATE`, and returns the new timestamp. */
export function touchDevice(store: ServerStore, deviceId: string): string {
  const lastSeenAt = new Date().toISOString()
  store.db.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`).run(lastSeenAt, deviceId)

  return lastSeenAt
}

/** Finds the one device currently holding the Parent role, or `null` when the role is vacant. */
export function findParentDevice(store: ServerStore): DeviceRecord | null {
  const row = store.db.prepare(`SELECT ${SELECT_COLUMNS} FROM devices WHERE role = 'parent'`).get() as DeviceRow | undefined

  return row ? toDeviceRecord(row) : null
}

/**
 * Moves the Parent role onto `deviceId`, demoting the current Parent in the same transaction —
 * demote before promote, because the partial unique index on `role = 'parent'` is checked per
 * statement rather than deferred. Throws `ProtocolError(DEVICE_NOT_FOUND)` for an unknown id and
 * `ProtocolError(NOT_PARENT)` for a revoked one; either refusal leaves every role untouched.
 */
export function promoteDevice(store: ServerStore, deviceId: string): DeviceRecord {
  const promote = store.db.transaction((): DeviceRecord => {
    const target = findDeviceById(store, deviceId)
    if (!target) throw new ProtocolError(ProtocolErrorCode.DEVICE_NOT_FOUND, `No such device: ${deviceId}`)
    if (target.revokedAt) throw new ProtocolError(ProtocolErrorCode.NOT_PARENT, `Device ${deviceId} has been revoked and cannot be promoted`)

    store.db.prepare(`UPDATE devices SET role = 'child' WHERE role = 'parent'`).run()
    store.db.prepare(`UPDATE devices SET role = 'parent' WHERE id = ?`).run(deviceId)

    return {...target, role: "parent"}
  })

  return promote.immediate()
}

function findDeviceById(store: ServerStore, deviceId: string): DeviceRecord | null {
  const row = store.db.prepare(`SELECT ${SELECT_COLUMNS} FROM devices WHERE id = ?`).get(deviceId) as DeviceRow | undefined

  return row ? toDeviceRecord(row) : null
}

function toDeviceRecord(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  }
}
