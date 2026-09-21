import {nanoid} from "nanoid"

import {hashToken, mintToken} from "../../devices/tokens"
import {createAgentRequest} from "../AgentStore"

import type {ServerStore} from "../../store/instance"

export type AgentAuthorizationRecord = {
  id: string
  requestId: string
  clientId: string
  redirectUri: string
  state: string | null
  codeChallenge: string
  resource: string
  createdAt: string
  codeExpiresAt: string | null
  codeUsedAt: string | null
}

export type CreateAgentAuthorizationParams = {
  agentName: string
  returnsTo: string
  isLocalProgram: boolean
  clientId: string
  redirectUri: string
  state: string | null
  codeChallenge: string
  resource: string
}

type AgentAuthorizationRow = {
  id: string
  request_id: string
  client_id: string
  redirect_uri: string
  state: string | null
  code_challenge: string
  resource: string
  created_at: string
  code_expires_at: string | null
  code_used_at: string | null
}

const AGENT_AUTHORIZATION_COLUMNS = `id, request_id, client_id, redirect_uri, state, code_challenge, resource, created_at, code_expires_at, code_used_at`

/**
 * Starts an agent request on the open Agent window and records the OAuth parameters it belongs
 * to, as one unit: the request's own transaction runs as a savepoint inside this one, so its
 * `ProtocolError(AGENT_WINDOW_CLOSED | AGENT_REQUEST_IN_PROGRESS)` is rethrown unchanged with
 * neither row written.
 */
export function createAgentAuthorization(store: ServerStore, params: CreateAgentAuthorizationParams): AgentAuthorizationRecord {
  const create = store.db.transaction((): AgentAuthorizationRecord => {
    const request = createAgentRequest(store, {agentName: params.agentName, returnsTo: params.returnsTo, isLocalProgram: params.isLocalProgram})

    const record: AgentAuthorizationRecord = {
      id: nanoid(),
      requestId: request.id,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      state: params.state,
      codeChallenge: params.codeChallenge,
      resource: params.resource,
      createdAt: new Date().toISOString(),
      codeExpiresAt: null,
      codeUsedAt: null,
    }

    store.db
      .prepare(
        `INSERT INTO agent_authorizations (id, request_id, client_id, redirect_uri, state, code_challenge, resource, created_at, code_hash, code_expires_at, code_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
      )
      .run(record.id, record.requestId, record.clientId, record.redirectUri, record.state, record.codeChallenge, record.resource, record.createdAt)

    return record
  })

  return create.immediate()
}

export function readAgentAuthorization(store: ServerStore, authorizationId: string): AgentAuthorizationRecord | null {
  const row = store.db.prepare(`SELECT ${AGENT_AUTHORIZATION_COLUMNS} FROM agent_authorizations WHERE id = ?`).get(authorizationId) as
    | AgentAuthorizationRow
    | undefined

  return row ? toAgentAuthorizationRecord(row) : null
}

/**
 * Mints the authorization's one code, valid for 60 seconds, storing only its hash. Returns the
 * plaintext — the only time it exists — or `null` when a code was already issued for this
 * authorization, so a second call can never mint a second code.
 */
export function issueAuthorizationCode(store: ServerStore, authorizationId: string): string | null {
  const code = mintToken()
  const codeExpiresAt = new Date(Date.now() + 60 * 1000).toISOString()

  const result = store.db
    .prepare(`UPDATE agent_authorizations SET code_hash = ?, code_expires_at = ? WHERE id = ? AND code_hash IS NULL`)
    .run(hashToken(code), codeExpiresAt, authorizationId)

  return result.changes === 1 ? code : null
}

/** Finds the authorization a code was issued for, by the code's hash, whether or not it has expired or been used. */
export function findAgentAuthorizationByCode(store: ServerStore, code: string): AgentAuthorizationRecord | null {
  const row = store.db.prepare(`SELECT ${AGENT_AUTHORIZATION_COLUMNS} FROM agent_authorizations WHERE code_hash = ?`).get(hashToken(code)) as
    | AgentAuthorizationRow
    | undefined

  return row ? toAgentAuthorizationRecord(row) : null
}

export function markAuthorizationCodeUsed(store: ServerStore, authorizationId: string, usedAt: string): void {
  store.db.prepare(`UPDATE agent_authorizations SET code_used_at = ? WHERE id = ?`).run(usedAt, authorizationId)
}

function toAgentAuthorizationRecord(row: AgentAuthorizationRow): AgentAuthorizationRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    state: row.state,
    codeChallenge: row.code_challenge,
    resource: row.resource,
    createdAt: row.created_at,
    codeExpiresAt: row.code_expires_at,
    codeUsedAt: row.code_used_at,
  }
}
