import {createHash, timingSafeEqual} from "node:crypto"
import {nanoid} from "nanoid"

import {hashToken, mintToken} from "../../devices/tokens"
import {findAgentById, readAgentRequest, revokeAgent} from "../AgentStore"
import {findAgentAuthorizationByCode, markAuthorizationCodeUsed} from "./AgentAuthorizationStore"

import type {ServerStore} from "../../store/instance"

export type AgentTokenGrant = {accessToken: string; refreshToken: string; expiresIn: number}
export type AgentTokenOutcome = {ok: true; grant: AgentTokenGrant} | {ok: false; description: string}
export type CodeExchange = {code: string; clientId: string; redirectUri: string | null; codeVerifier: string}
export type TokenRefresh = {refreshToken: string; clientId: string | null}
export type AgentCaller = {agentId: string; deviceId: string; timeZone: string | null; name: string}

/**
 * Exchanges an authorization code for a token pair, once, under PKCE, the client and redirect URI
 * it was issued to, and `resource`. A code that was already used is refused, and when the replay
 * is otherwise valid the agent it minted is revoked. The refusal is returned from the transaction
 * rather than thrown, so that revocation commits. A wrong verifier refuses without burning the code.
 */
export function exchangeAuthorizationCode(store: ServerStore, exchange: CodeExchange, resource: string): AgentTokenOutcome {
  const exchangeCode = store.db.transaction((): AgentTokenOutcome => {
    const authorization = findAgentAuthorizationByCode(store, exchange.code)
    if (!authorization) return {ok: false, description: "The authorization code is not valid"}

    const isSameClient =
      authorization.clientId === exchange.clientId && (exchange.redirectUri === null || exchange.redirectUri === authorization.redirectUri)
    const isVerifierCorrect = matchesCodeChallenge(exchange.codeVerifier, authorization.codeChallenge)

    if (authorization.codeUsedAt) {
      const issuedAgentId = isSameClient && isVerifierCorrect ? readAgentRequest(store, authorization.requestId)?.issuedAgentId : null
      if (issuedAgentId) revokeAgent(store, issuedAgentId)

      return {ok: false, description: "The authorization code was already used"}
    }

    if (!authorization.codeExpiresAt || Date.parse(authorization.codeExpiresAt) <= Date.now()) {
      return {ok: false, description: "The authorization code has expired"}
    }
    if (!isSameClient) return {ok: false, description: "The authorization code was issued to another client or redirect_uri"}
    if (!isVerifierCorrect) return {ok: false, description: "The code_verifier does not match the code_challenge"}
    if (authorization.resource !== resource) return {ok: false, description: "The authorization code was issued for another resource"}

    const request = readAgentRequest(store, authorization.requestId)
    const agent = request?.state === "approved" && request.issuedAgentId ? findAgentById(store, request.issuedAgentId) : null
    if (!agent || agent.revokedAt) return {ok: false, description: "Access was not granted, or the agent has been revoked"}

    markAuthorizationCodeUsed(store, authorization.id, new Date().toISOString())

    return {ok: true, grant: mintAgentTokens(store, {agentId: agent.id, clientId: authorization.clientId, resource})}
  })

  return exchangeCode.immediate()
}

/**
 * Rotates a refresh token: retires it and answers a new pair for the same agent. A refresh token
 * that was already rotated revokes the agent before anything else is checked, and the refusal is
 * returned from the transaction rather than thrown, so that revocation commits. A `null`
 * `clientId` is not compared.
 */
export function refreshAgentTokens(store: ServerStore, refresh: TokenRefresh, resource: string): AgentTokenOutcome {
  const rotate = store.db.transaction((): AgentTokenOutcome => {
    const row = store.db
      .prepare(`SELECT id, agent_id, client_id, resource, rotated_at FROM agent_tokens WHERE refresh_token_hash = ?`)
      .get(hashToken(refresh.refreshToken)) as
      | {id: string; agent_id: string; client_id: string; resource: string; rotated_at: string | null}
      | undefined
    if (!row) return {ok: false, description: "The refresh token is not valid"}

    if (row.rotated_at) {
      revokeAgent(store, row.agent_id)
      return {ok: false, description: "The refresh token was already used, so the agent has been revoked"}
    }

    const agent = findAgentById(store, row.agent_id)
    if (!agent || agent.revokedAt) return {ok: false, description: "The agent has been revoked"}
    if (refresh.clientId !== null && refresh.clientId !== row.client_id) {
      return {ok: false, description: "The refresh token was issued to another client"}
    }
    if (row.resource !== resource) return {ok: false, description: "The refresh token was issued for another resource"}

    store.db.prepare(`UPDATE agent_tokens SET rotated_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id)

    return {ok: true, grant: mintAgentTokens(store, {agentId: agent.id, clientId: row.client_id, resource})}
  })

  return rotate.immediate()
}

/**
 * Answers the agent an access token belongs to, with its name, its Mac and that Mac's time zone
 * from the same row, or `null` unless the token is unexpired, was issued for `resource` and its
 * agent is not revoked. A rotated pair's access token still passes until its own hour is up.
 * Writes nothing.
 */
export function verifyAgentAccessToken(store: ServerStore, accessToken: string, resource: string): AgentCaller | null {
  const row = store.db
    .prepare(
      `SELECT agents.id AS agent_id, agents.device_id AS device_id, agents.name AS name, devices.time_zone AS time_zone
       FROM agent_tokens
       JOIN agents ON agents.id = agent_tokens.agent_id
       JOIN devices ON devices.id = agents.device_id
       WHERE agent_tokens.access_token_hash = ?
         AND agent_tokens.access_expires_at > ?
         AND agent_tokens.resource = ?
         AND agents.revoked_at IS NULL`,
    )
    .get(hashToken(accessToken), new Date().toISOString(), resource) as
    | {agent_id: string; device_id: string; name: string; time_zone: string | null}
    | undefined

  return row ? {agentId: row.agent_id, deviceId: row.device_id, timeZone: row.time_zone, name: row.name} : null
}

function mintAgentTokens(store: ServerStore, pair: {agentId: string; clientId: string; resource: string}): AgentTokenGrant {
  const accessToken = mintToken()
  const refreshToken = mintToken()
  const expiresIn = 3600
  const now = Date.now()

  store.db
    .prepare(
      `INSERT INTO agent_tokens (id, agent_id, client_id, resource, access_token_hash, access_expires_at, refresh_token_hash, created_at, rotated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      nanoid(),
      pair.agentId,
      pair.clientId,
      pair.resource,
      hashToken(accessToken),
      new Date(now + expiresIn * 1000).toISOString(),
      hashToken(refreshToken),
      new Date(now).toISOString(),
    )

  return {accessToken, refreshToken, expiresIn}
}

function matchesCodeChallenge(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false

  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"), "utf8")
  const stored = Buffer.from(challenge, "utf8")

  return computed.length === stored.length && timingSafeEqual(computed, stored)
}
