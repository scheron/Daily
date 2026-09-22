import {hostname} from "node:os"
import {nanoid} from "nanoid"

import {ProtocolError, ProtocolErrorCode, SYNC_PROTOCOL_CONFIG} from "@daily/protocol"

import {generateCode} from "../codes"

import type {EnrollmentWindow} from "@daily/protocol"
import type {ServerStore} from "../store/instance"

export type ServerIdentity = {serverId: string; name: string; createdAt: string; claimedAt: string | null}

type ServerIdentityRow = {
  server_id: string
  name: string
  created_at: string
  claimed_at: string | null
}

type ClaimStateRow = {claimed_at: string | null; claim_code: string | null}

/**
 * Reads the server's identity row, creating it with a fresh id on first open — named `defaultName`,
 * or after the host when no name is given.
 */
export function loadIdentity(store: ServerStore, defaultName?: string): ServerIdentity {
  const existing = store.db.prepare(`SELECT server_id, name, created_at, claimed_at FROM server_identity WHERE id = 1`).get() as
    | ServerIdentityRow
    | undefined

  if (existing) return toServerIdentity(existing)

  const identity: ServerIdentity = {
    serverId: nanoid(),
    name: defaultName ?? hostname(),
    createdAt: new Date().toISOString(),
    claimedAt: null,
  }

  store.db
    .prepare(`INSERT INTO server_identity (id, server_id, name, created_at, claimed_at) VALUES (1, ?, ?, ?, NULL)`)
    .run(identity.serverId, identity.name, identity.createdAt)

  return identity
}

/**
 * Moves the stored name to `name`, returning the name it replaced, or `null` when the row already
 * said that. Nothing keys off the name — it is the display string `GET /v1/server` reports and the
 * app shows — so reconciling it on every start costs nothing and strands no one.
 */
export function applyServerName(store: ServerStore, name: string): string | null {
  const previous = loadIdentity(store).name
  if (previous === name) return null

  store.db.prepare(`UPDATE server_identity SET name = ? WHERE id = 1`).run(name)

  return previous
}

/** Marks the server as claimed at the given timestamp. */
export function markClaimed(store: ServerStore, at: string): void {
  store.db.prepare(`UPDATE server_identity SET claimed_at = ? WHERE id = 1`).run(at)
}

/** Returns the unclaimed server's claim code, generating and storing one when it has none, and `null` once the server is claimed. */
export function ensureClaimCode(store: ServerStore): string | null {
  const row = readClaimState(store)
  if (row.claimed_at) return null
  if (row.claim_code) return row.claim_code

  const code = generateCode()
  store.db.prepare(`UPDATE server_identity SET claim_code = ? WHERE id = 1`).run(code)

  return code
}

/** Replaces the unclaimed server's claim code, clearing the attempt counter and any lock. Refuses on a claimed server: re-opening it to a code is nobody's decision to take. */
export function regenerateClaimCode(store: ServerStore): string {
  const regenerate = store.db.transaction((): string => {
    if (readClaimState(store).claimed_at) {
      throw new ProtocolError(ProtocolErrorCode.ALREADY_CLAIMED, "This server is already claimed, so its claim code cannot be regenerated")
    }

    const code = generateCode()
    store.db.prepare(`UPDATE server_identity SET claim_code = ?, claim_attempts = 0, claim_locked_at = NULL WHERE id = 1`).run(code)

    return code
  })

  return regenerate.immediate()
}

/** Reports whether the server has been claimed by its first device. */
export function isClaimed(store: ServerStore): boolean {
  return readClaimState(store).claimed_at !== null
}

/**
 * Opens the door for one device to ask to enroll, for `SYNC_PROTOCOL_CONFIG.enrollmentWindowMs`
 * from now. Opening while one is already open replaces it — the person pressed the button again,
 * and the honest reading of that is "start the clock over".
 */
export function openEnrollmentWindow(store: ServerStore): EnrollmentWindow {
  const expiresAt = new Date(Date.now() + SYNC_PROTOCOL_CONFIG.enrollmentWindowMs).toISOString()

  store.db.prepare(`UPDATE server_identity SET enrollment_window_expires_at = ? WHERE id = 1`).run(expiresAt)

  return {expiresAt}
}

/** Closes the enrollment window, if one is open. */
export function closeEnrollmentWindow(store: ServerStore): void {
  store.db.prepare(`UPDATE server_identity SET enrollment_window_expires_at = NULL WHERE id = 1`).run()
}

/** The open enrollment window, or `null` when none is open or the open one has run out. */
export function readEnrollmentWindow(store: ServerStore): EnrollmentWindow | null {
  const row = store.db.prepare(`SELECT enrollment_window_expires_at FROM server_identity WHERE id = 1`).get() as {
    enrollment_window_expires_at: string | null
  }

  if (!row.enrollment_window_expires_at) return null
  if (Date.parse(row.enrollment_window_expires_at) <= Date.now()) return null

  return {expiresAt: row.enrollment_window_expires_at}
}

export type AgentWindowState = {expiresAt: string; deviceId: string}

/**
 * Opens the door for one device to ask to connect an agent, for `SYNC_PROTOCOL_CONFIG.agentWindowMs`
 * from now. Opening while one is already open replaces it, on whichever device asked this time.
 */
export function writeAgentWindow(store: ServerStore, deviceId: string): AgentWindowState {
  const expiresAt = new Date(Date.now() + SYNC_PROTOCOL_CONFIG.agentWindowMs).toISOString()

  store.db.prepare(`UPDATE server_identity SET agent_window_expires_at = ?, agent_window_device_id = ? WHERE id = 1`).run(expiresAt, deviceId)

  return {expiresAt, deviceId}
}

/** Closes the Agent window, if one is open. */
export function clearAgentWindow(store: ServerStore): void {
  store.db.prepare(`UPDATE server_identity SET agent_window_expires_at = NULL, agent_window_device_id = NULL WHERE id = 1`).run()
}

/** The open Agent window, or `null` when none is open or the open one has run out. */
export function readAgentWindow(store: ServerStore): AgentWindowState | null {
  const row = store.db.prepare(`SELECT agent_window_expires_at, agent_window_device_id FROM server_identity WHERE id = 1`).get() as {
    agent_window_expires_at: string | null
    agent_window_device_id: string | null
  }

  if (!row.agent_window_expires_at || !row.agent_window_device_id) return null
  if (Date.parse(row.agent_window_expires_at) <= Date.now()) return null

  return {expiresAt: row.agent_window_expires_at, deviceId: row.agent_window_device_id}
}

function readClaimState(store: ServerStore): ClaimStateRow {
  return store.db.prepare(`SELECT claimed_at, claim_code FROM server_identity WHERE id = 1`).get() as ClaimStateRow
}

function toServerIdentity(row: ServerIdentityRow): ServerIdentity {
  return {
    serverId: row.server_id,
    name: row.name,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
  }
}
