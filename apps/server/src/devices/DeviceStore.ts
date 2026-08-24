import {nanoid} from "nanoid"

import {hashToken, mintToken} from "./tokens"

import type {ServerStore} from "../store/instance"

export type DeviceRecord = {
  id: string
  name: string
  createdAt: string
  lastSeenAt: string | null
  revokedAt: string | null
}

type DeviceRow = {
  id: string
  name: string
  created_at: string
  last_seen_at: string | null
  revoked_at: string | null
}

/** Creates a device, minting its credential and persisting only the credential's hash; the plaintext token is returned once and never recoverable afterwards. */
export function createDevice(store: ServerStore, name: string): {device: DeviceRecord; token: string} {
  const token = mintToken()
  const device: DeviceRecord = {
    id: nanoid(),
    name,
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
    revokedAt: null,
  }

  store.db
    .prepare(`INSERT INTO devices (id, name, token_hash, created_at, last_seen_at, revoked_at) VALUES (?, ?, ?, ?, NULL, NULL)`)
    .run(device.id, device.name, hashToken(token), device.createdAt)

  return {device, token}
}

/** Lists every device, active or revoked, oldest first. */
export function listDevices(store: ServerStore): DeviceRecord[] {
  const rows = store.db.prepare(`SELECT id, name, created_at, last_seen_at, revoked_at FROM devices ORDER BY created_at ASC`).all() as DeviceRow[]

  return rows.map(toDeviceRecord)
}

/** Revokes a device by id, leaving its row in place. Returns `null` when no such device exists, and the record unchanged when it was already revoked. */
export function revokeDevice(store: ServerStore, deviceId: string): DeviceRecord | null {
  const existing = findDeviceById(store, deviceId)
  if (!existing) return null
  if (existing.revokedAt) return existing

  const revokedAt = new Date().toISOString()
  store.db.prepare(`UPDATE devices SET revoked_at = ? WHERE id = ?`).run(revokedAt, deviceId)

  return {...existing, revokedAt}
}

/** Counts devices that have not been revoked. */
export function countActiveDevices(store: ServerStore): number {
  const row = store.db.prepare(`SELECT COUNT(*) as count FROM devices WHERE revoked_at IS NULL`).get() as {count: number}

  return row.count
}

/** Finds a device by the hash of a presented token, for the bearer check. */
export function findDeviceByTokenHash(store: ServerStore, tokenHash: string): DeviceRecord | null {
  const row = store.db.prepare(`SELECT id, name, created_at, last_seen_at, revoked_at FROM devices WHERE token_hash = ?`).get(tokenHash) as
    | DeviceRow
    | undefined

  return row ? toDeviceRecord(row) : null
}

/** Moves a device's `last_seen_at` forward to now, in one indexed `UPDATE`, and returns the new timestamp. */
export function touchDevice(store: ServerStore, deviceId: string): string {
  const lastSeenAt = new Date().toISOString()
  store.db.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`).run(lastSeenAt, deviceId)

  return lastSeenAt
}

function findDeviceById(store: ServerStore, deviceId: string): DeviceRecord | null {
  const row = store.db.prepare(`SELECT id, name, created_at, last_seen_at, revoked_at FROM devices WHERE id = ?`).get(deviceId) as
    | DeviceRow
    | undefined

  return row ? toDeviceRecord(row) : null
}

function toDeviceRecord(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  }
}
