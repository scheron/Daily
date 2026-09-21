import {nanoid} from "nanoid"

import {ProtocolError, ProtocolErrorCode, SYNC_PROTOCOL_CONFIG} from "@daily/protocol"

import {generateCode} from "../codes"
import {clearAgentWindow, readAgentWindow, writeAgentWindow} from "../identity/ServerIdentityStore"

import type {AgentWindowState} from "../identity/ServerIdentityStore"
import type {ServerStore} from "../store/instance"

export type {AgentWindowState}

export type AgentRecord = {
  id: string
  deviceId: string
  name: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export type AgentRequestRecord = {
  id: string
  deviceId: string
  code: string
  agentName: string
  returnsTo: string
  isLocalProgram: boolean
  state: "pending" | "approved" | "denied"
  createdAt: string
  expiresAt: string
  resolvedAt: string | null
  issuedAgentId: string | null
}

export type CreateAgentRequestParams = {agentName: string; returnsTo: string; isLocalProgram: boolean}

type AgentRow = {
  id: string
  device_id: string
  name: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

type AgentRequestRow = {
  id: string
  device_id: string
  code: string
  agent_name: string
  returns_to: string
  is_local_program: number
  state: AgentRequestRecord["state"]
  created_at: string
  expires_at: string
  resolved_at: string | null
  issued_agent_id: string | null
}

const AGENT_COLUMNS = `id, device_id, name, created_at, last_used_at, revoked_at`
const AGENT_REQUEST_COLUMNS = `id, device_id, code, agent_name, returns_to, is_local_program, state, created_at, expires_at, resolved_at, issued_agent_id`

/**
 * Creates an agent request bound to the Mac whose Agent window is open. The whole check-and-write
 * happens inside one transaction — the window and any pending request are both re-read there, so
 * two requests arriving together produce one pending request, not two.
 */
export function createAgentRequest(store: ServerStore, params: CreateAgentRequestParams): AgentRequestRecord {
  const create = store.db.transaction((): AgentRequestRecord => {
    const window = readAgentWindow(store)
    if (!window) {
      throw new ProtocolError(ProtocolErrorCode.AGENT_WINDOW_CLOSED, "No Mac has an Agent window open right now")
    }

    if (findPendingAgentRequest(store, window.deviceId)) {
      throw new ProtocolError(ProtocolErrorCode.AGENT_REQUEST_IN_PROGRESS, "Another agent is already waiting to be approved")
    }

    const now = new Date()
    const record: AgentRequestRecord = {
      id: nanoid(),
      deviceId: window.deviceId,
      code: generateCode(),
      agentName: params.agentName,
      returnsTo: params.returnsTo,
      isLocalProgram: params.isLocalProgram,
      state: "pending",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SYNC_PROTOCOL_CONFIG.agentRequestTtlMs).toISOString(),
      resolvedAt: null,
      issuedAgentId: null,
    }

    store.db
      .prepare(
        `INSERT INTO agent_requests (id, device_id, code, agent_name, returns_to, is_local_program, state, created_at, expires_at, resolved_at, issued_agent_id)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL, NULL)`,
      )
      .run(
        record.id,
        record.deviceId,
        record.code,
        record.agentName,
        record.returnsTo,
        record.isLocalProgram ? 1 : 0,
        record.createdAt,
        record.expiresAt,
      )

    return record
  })

  return create.immediate()
}

/** Returns the request still waiting for a decision on `deviceId`'s Agent window, or `null` when none is waiting or the waiting one has lapsed. */
export function findPendingAgentRequest(store: ServerStore, deviceId: string): AgentRequestRecord | null {
  const row = store.db
    .prepare(
      `SELECT ${AGENT_REQUEST_COLUMNS} FROM agent_requests WHERE state = 'pending' AND device_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(deviceId) as AgentRequestRow | undefined

  if (!row) return null

  const record = toAgentRequestRecord(row)

  return Date.parse(record.expiresAt) <= Date.now() ? null : record
}

/** Reads an agent request by id, whatever its state, with no expiry check — for callers that already hold the id and want its raw record. */
export function readAgentRequest(store: ServerStore, requestId: string): AgentRequestRecord | null {
  const row = store.db.prepare(`SELECT ${AGENT_REQUEST_COLUMNS} FROM agent_requests WHERE id = ?`).get(requestId) as AgentRequestRow | undefined

  return row ? toAgentRequestRecord(row) : null
}

/**
 * Approves a waiting request on behalf of the Mac that owns it, minting the agent it asked for.
 * Ownership is checked before the code, so a Mac probing another Mac's request learns nothing
 * about the code it is guarding. The whole check-and-write happens inside one transaction, and
 * closes the Agent window on success.
 */
export function approveAgentRequest(store: ServerStore, requestId: string, code: string, deviceId: string): AgentRecord {
  const approve = store.db.transaction((): AgentRecord => {
    const record = requirePendingAgentRequest(store, requestId)

    if (record.deviceId !== deviceId) {
      throw new ProtocolError(ProtocolErrorCode.NOT_AGENT_OWNER, "This agent request belongs to a different Mac")
    }

    if (record.code !== code) {
      throw new ProtocolError(ProtocolErrorCode.AGENT_CODE_MISMATCH, "This code does not match the request waiting for approval")
    }

    const agent: AgentRecord = {
      id: nanoid(),
      deviceId: record.deviceId,
      name: record.agentName,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    }

    store.db
      .prepare(`INSERT INTO agents (id, device_id, name, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, NULL, NULL)`)
      .run(agent.id, agent.deviceId, agent.name, agent.createdAt)

    store.db
      .prepare(`UPDATE agent_requests SET state = 'approved', resolved_at = ?, issued_agent_id = ? WHERE id = ?`)
      .run(new Date().toISOString(), agent.id, record.id)

    clearAgentWindow(store)

    return agent
  })

  return approve.immediate()
}

/** Refuses a waiting request on behalf of the Mac that owns it. The Agent window is left open, so the person can try again inside their five minutes. */
export function denyAgentRequest(store: ServerStore, requestId: string, deviceId: string): void {
  const deny = store.db.transaction((): void => {
    const record = requirePendingAgentRequest(store, requestId)

    if (record.deviceId !== deviceId) {
      throw new ProtocolError(ProtocolErrorCode.NOT_AGENT_OWNER, "This agent request belongs to a different Mac")
    }

    store.db.prepare(`UPDATE agent_requests SET state = 'denied', resolved_at = ? WHERE id = ?`).run(new Date().toISOString(), record.id)
  })

  deny.immediate()
}

/**
 * Opens the Agent window on `deviceId`, replacing any window already open. Because only one window
 * exists, any request still waiting for a decision — on this Mac or another — is denied in the
 * same transaction, so it never lingers where no Mac can decide it.
 */
export function openAgentWindow(store: ServerStore, deviceId: string): AgentWindowState {
  const open = store.db.transaction((): AgentWindowState => {
    store.db.prepare(`UPDATE agent_requests SET state = 'denied', resolved_at = ? WHERE state = 'pending'`).run(new Date().toISOString())

    return writeAgentWindow(store, deviceId)
  })

  return open.immediate()
}

/** Closes the Agent window, if one is open, leaving any waiting request untouched. */
export function closeAgentWindow(store: ServerStore): void {
  clearAgentWindow(store)
}

/** Lists agents for one Mac, or every Mac's when `deviceId` is `null`, active ones oldest-first and revoked ones last. */
export function listAgents(store: ServerStore, deviceId: string | null): AgentRecord[] {
  const rows = store.db
    .prepare(
      `SELECT ${AGENT_COLUMNS} FROM agents ${deviceId === null ? "" : "WHERE device_id = ?"}
       ORDER BY
         CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END ASC,
         CASE WHEN revoked_at IS NULL THEN created_at END ASC,
         CASE WHEN revoked_at IS NOT NULL THEN revoked_at END DESC`,
    )
    .all(...(deviceId === null ? [] : [deviceId])) as AgentRow[]

  return rows.map(toAgentRecord)
}

/** Finds an agent by id, or `null` when no such agent exists. */
export function findAgentById(store: ServerStore, agentId: string): AgentRecord | null {
  const row = store.db.prepare(`SELECT ${AGENT_COLUMNS} FROM agents WHERE id = ?`).get(agentId) as AgentRow | undefined

  return row ? toAgentRecord(row) : null
}

/** Revokes an agent by id, leaving its row in place. Returns `null` when no such agent exists, and the record unchanged when it was already revoked. */
export function revokeAgent(store: ServerStore, agentId: string): AgentRecord | null {
  const existing = findAgentById(store, agentId)
  if (!existing) return null
  if (existing.revokedAt) return existing

  const revokedAt = new Date().toISOString()
  store.db.prepare(`UPDATE agents SET revoked_at = ? WHERE id = ?`).run(revokedAt, agentId)

  return {...existing, revokedAt}
}

/** Revokes every one of a device's still-active agents in one statement, and returns how many that was. */
export function revokeAgentsOfDevice(store: ServerStore, deviceId: string, revokedAt: string): number {
  const result = store.db.prepare(`UPDATE agents SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL`).run(revokedAt, deviceId)

  return result.changes
}

/**
 * Moves an agent's `last_used_at` forward to now, in one indexed `UPDATE`, and returns the new
 * timestamp, exactly as `touchDevice` does for a device.
 */
export function touchAgent(store: ServerStore, agentId: string): string {
  const lastUsedAt = new Date().toISOString()
  store.db.prepare(`UPDATE agents SET last_used_at = ? WHERE id = ?`).run(lastUsedAt, agentId)

  return lastUsedAt
}

function requirePendingAgentRequest(store: ServerStore, requestId: string): AgentRequestRecord {
  const row = store.db.prepare(`SELECT ${AGENT_REQUEST_COLUMNS} FROM agent_requests WHERE id = ?`).get(requestId) as AgentRequestRow | undefined
  if (!row) throw new ProtocolError(ProtocolErrorCode.AGENT_REQUEST_NOT_FOUND, "No such agent request")

  const record = toAgentRequestRecord(row)
  if (record.state !== "pending" || Date.parse(record.expiresAt) <= Date.now()) {
    throw new ProtocolError(ProtocolErrorCode.AGENT_REQUEST_NOT_PENDING, "This agent request is no longer pending")
  }

  return record
}

function toAgentRecord(row: AgentRow): AgentRecord {
  return {
    id: row.id,
    deviceId: row.device_id,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }
}

function toAgentRequestRecord(row: AgentRequestRow): AgentRequestRecord {
  return {
    id: row.id,
    deviceId: row.device_id,
    code: row.code,
    agentName: row.agent_name,
    returnsTo: row.returns_to,
    isLocalProgram: row.is_local_program === 1,
    state: row.state,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    resolvedAt: row.resolved_at,
    issuedAgentId: row.issued_agent_id,
  }
}
