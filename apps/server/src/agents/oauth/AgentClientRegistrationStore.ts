import {nanoid} from "nanoid"

import {AGENT_ENDPOINT_PATH} from "@daily/protocol"

import {readAgentWindow} from "../../identity/ServerIdentityStore"

import type {ServerStore} from "../../store/instance"
import type {ClientMetadata} from "./clientMetadata"

type RegisterAgentClientParams = Omit<ClientMetadata, "clientId"> & {issuer: string; windowId: string}
type RegistrationOutcome =
  | {ok: true; client: ClientMetadata; issuedAt: number}
  | {ok: false; reason: "window_closed" | "window_quota" | "capacity"}
  | {ok: false; reason: "rate_limited"; retryAfterSeconds: number}

type RegisteredClientRow = {client_id: string; client_name: string; redirect_uris: string; created_at: number}

const ISSUED_CLIENT_ID_PREFIX = "daily_"
const UNUSED_REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000
const REGISTRATION_IS_LIVE = `(
  registration.created_at > ? OR EXISTS (
    SELECT 1 FROM agent_authorizations AS authorization
    JOIN agent_requests AS request ON request.id = authorization.request_id
    LEFT JOIN agents AS agent ON agent.id = request.issued_agent_id
    WHERE authorization.client_id = registration.client_id
      AND authorization.resource = registration.issuer || '${AGENT_ENDPOINT_PATH}'
      AND (
        (request.state = 'pending' AND request.expires_at > ?)
        OR (
          request.state = 'approved' AND agent.id IS NOT NULL AND agent.revoked_at IS NULL
          AND (authorization.code_used_at IS NOT NULL OR COALESCE(authorization.code_expires_at, request.expires_at) > ?)
        )
      )
  )
)`

/** Accepts validated public metadata. An exact retry in the same open window reuses the issued ID. */
export function registerAgentClient(store: ServerStore, params: RegisterAgentClientParams): RegistrationOutcome {
  const register = store.db.transaction((): RegistrationOutcome => {
    const window = readAgentWindow(store)
    if (!window || window.id !== params.windowId) return {ok: false, reason: "window_closed"}

    const now = Date.now()
    const redirectUris = JSON.stringify(params.redirectUris)
    const existing = store.db
      .prepare(
        `SELECT client_id, client_name, redirect_uris, created_at FROM agent_client_registrations
                WHERE window_id = ? AND issuer = ? AND client_name = ? AND redirect_uris = ?`,
      )
      .get<RegisteredClientRow>(window.id, params.issuer, params.clientName, redirectUris)
    if (existing) return {ok: true, client: toClientMetadata(existing), issuedAt: Math.floor(existing.created_at / 1000)}

    const nowIso = new Date(now).toISOString()
    store.db
      .prepare(`DELETE FROM agent_client_registrations AS registration WHERE NOT ${REGISTRATION_IS_LIVE}`)
      .run(now - UNUSED_REGISTRATION_TTL_MS, nowIso, nowIso)

    const perWindowLimit = 8
    const windowCount = store.db
      .prepare("SELECT count(*) AS total FROM agent_client_registrations WHERE window_id = ?")
      .get<{total: number}>(window.id)!
    if (windowCount.total >= perWindowLimit) return {ok: false, reason: "window_quota"}

    const rateLimit = 32
    const ratePeriodMs = 60_000
    const recent = store.db
      .prepare("SELECT count(*) AS total, min(created_at) AS oldest FROM agent_client_registrations WHERE created_at > ?")
      .get<{total: number; oldest: number | null}>(now - ratePeriodMs)!
    if (recent.total >= rateLimit && recent.oldest !== null) {
      return {ok: false, reason: "rate_limited", retryAfterSeconds: Math.ceil((recent.oldest + ratePeriodMs - now) / 1000)}
    }

    const capacity = 1024
    const stored = store.db.prepare("SELECT count(*) AS total FROM agent_client_registrations").get<{total: number}>()!
    if (stored.total >= capacity) return {ok: false, reason: "capacity"}

    const clientId = `${ISSUED_CLIENT_ID_PREFIX}${nanoid()}`
    store.db
      .prepare(
        `INSERT INTO agent_client_registrations (client_id, issuer, window_id, client_name, redirect_uris, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(clientId, params.issuer, window.id, params.clientName, redirectUris, now)

    return {ok: true, client: {clientId, clientName: params.clientName, redirectUris: params.redirectUris}, issuedAt: Math.floor(now / 1000)}
  })

  return register.immediate()
}

/** An unused ID stops resolving at its expiry even when cleanup has not run yet. */
export function readRegisteredAgentClient(store: ServerStore, issuer: string, clientId: string): ClientMetadata | null {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const row = store.db
    .prepare(
      `SELECT client_id, client_name, redirect_uris, created_at FROM agent_client_registrations AS registration
              WHERE issuer = ? AND client_id = ? AND ${REGISTRATION_IS_LIVE}`,
    )
    .get<RegisteredClientRow>(issuer, clientId, now - UNUSED_REGISTRATION_TTL_MS, nowIso, nowIso)

  return row ? toClientMetadata(row) : null
}

export function isIssuedAgentClientId(clientId: string): boolean {
  return clientId.startsWith(ISSUED_CLIENT_ID_PREFIX)
}

function toClientMetadata(row: RegisteredClientRow): ClientMetadata {
  return {clientId: row.client_id, clientName: row.client_name, redirectUris: JSON.parse(row.redirect_uris) as string[]}
}
