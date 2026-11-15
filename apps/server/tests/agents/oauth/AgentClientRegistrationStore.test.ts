import {createHash} from "node:crypto"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {ProtocolErrorCode, SYNC_PROTOCOL_CONFIG} from "@daily/protocol"

import {approveAgentRequest, closeAgentWindow, openAgentWindow, readAgentRequest, revokeAgent} from "../../../src/agents/AgentStore"
import {createAgentAuthorization, issueAuthorizationCode} from "../../../src/agents/oauth/AgentAuthorizationStore"
import {readRegisteredAgentClient, registerAgentClient} from "../../../src/agents/oauth/AgentClientRegistrationStore"
import {exchangeAuthorizationCode} from "../../../src/agents/oauth/AgentTokenStore"
import {createDevice} from "../../../src/devices/DeviceStore"
import {openServerStore} from "../../../src/store/instance"

import type {ServerStore} from "../../../src/store/instance"

const ISSUER = "https://daily.example.com"
const CALLBACK = "http://127.0.0.1/callback"
const VERIFIER = "verifier".repeat(8)

describe("agent client registration storage", () => {
  let dataDir: string
  let store: ServerStore
  let deviceId: string

  beforeEach(() => {
    vi.useFakeTimers({toFake: ["Date"]})
    dataDir = mkdtempSync(join(tmpdir(), "daily-client-registration-"))
    store = openServerStore(dataDir)
    deviceId = createDevice(store, "MacBook Air").device.id
  })

  afterEach(() => {
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
    vi.useRealTimers()
  })

  it.each(["closed", "expired", "replaced"])("refuses to create an authorization for a %s window", (state) => {
    const window = openAgentWindow(store, deviceId)
    if (state === "closed") closeAgentWindow(store)
    if (state === "expired") vi.advanceTimersByTime(SYNC_PROTOCOL_CONFIG.agentWindowMs)
    if (state === "replaced") openAgentWindow(store, deviceId)

    expect(() => createAgentAuthorization(store, makeAuthorization("https://client.example.com/client.json"), window.id)).toThrow(
      expect.objectContaining({code: ProtocolErrorCode.AGENT_WINDOW_CLOSED}),
    )
    expect(store.db.prepare("SELECT id FROM agent_requests").all()).toEqual([])
    expect(store.db.prepare("SELECT id FROM agent_authorizations").all()).toEqual([])
    expect(registerAgentClient(store, makeRegistration(window.id))).toEqual({ok: false, reason: "window_closed"})
    expect(store.db.prepare("SELECT client_id FROM agent_client_registrations").all()).toEqual([])
  })

  it("keeps the issued ID and timestamp on retry, scopes the ID to its issuer, and preserves it on restart", () => {
    const window = openAgentWindow(store, deviceId)
    const registration = makeRegistration(window.id)
    const first = registerAgentClient(store, registration)
    if (!first.ok) throw new Error(first.reason)
    expect(first.client.clientId).toMatch(/^daily_[A-Za-z0-9_-]+$/)
    expect(first.issuedAt).toBe(Math.floor(Date.now() / 1000))

    vi.advanceTimersByTime(1000)
    store.close()
    store = openServerStore(dataDir)

    expect(registerAgentClient(store, registration)).toEqual(first)
    expect(readRegisteredAgentClient(store, ISSUER, first.client.clientId)).toEqual(first.client)
    expect(readRegisteredAgentClient(store, "https://other.example.com", first.client.clientId)).toBeNull()
  })

  it("counts unique registrations against the shared window quota and allows an exact retry when full", () => {
    const window = openAgentWindow(store, deviceId)
    const first = registerAgentClient(store, makeRegistration(window.id))
    const secondConnection = openServerStore(dataDir)
    try {
      expect(first.ok).toBe(true)
      for (let index = 1; index < 8; index += 1) {
        expect(registerAgentClient(secondConnection, makeRegistration(window.id, `Client ${index}`)).ok).toBe(true)
      }

      expect(registerAgentClient(store, makeRegistration(window.id))).toEqual(first)
      expect(registerAgentClient(store, makeRegistration(window.id, "One more"))).toEqual({ok: false, reason: "window_quota"})
    } finally {
      secondConnection.close()
    }
  })

  it("enforces the same rolling registration rate across new windows, issuers and server restart", () => {
    for (let batch = 0; batch < 4; batch += 1) {
      const window = openAgentWindow(store, deviceId)
      for (let index = 0; index < 8; index += 1) {
        expect(registerAgentClient(store, makeRegistration(window.id, `Client ${index}`)).ok).toBe(true)
      }
    }

    store.close()
    store = openServerStore(dataDir)
    const window = openAgentWindow(store, deviceId)
    const registration = {...makeRegistration(window.id), issuer: "https://other.example.com"}

    expect(registerAgentClient(store, registration)).toEqual({ok: false, reason: "rate_limited", retryAfterSeconds: 60})
    vi.advanceTimersByTime(60_000)
    expect(registerAgentClient(store, registration).ok).toBe(true)
  })

  it("recovers capacity when abandoned IDs expire and issues a new ID on re-registration", () => {
    const window = openAgentWindow(store, deviceId)
    const first = registerAgentClient(store, makeRegistration(window.id))
    if (!first.ok) throw new Error(first.reason)
    store.db
      .prepare(
        `WITH RECURSIVE sequence(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM sequence WHERE n < 1023)
                INSERT INTO agent_client_registrations (client_id, issuer, window_id, client_name, redirect_uris, created_at)
                SELECT 'seed-' || n, ?, 'seed-window', 'Client ' || n, '[]', ? FROM sequence`,
      )
      .run(ISSUER, Date.now() - 60_000)
    expect(registerAgentClient(store, makeRegistration(window.id, "One more"))).toEqual({ok: false, reason: "capacity"})

    vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    expect(readRegisteredAgentClient(store, ISSUER, first.client.clientId)).toBeNull()
    const reopened = openAgentWindow(store, deviceId)
    const second = registerAgentClient(store, makeRegistration(reopened.id))
    if (!second.ok) throw new Error(second.reason)
    expect(second.client.clientId).not.toBe(first.client.clientId)
    expect(store.db.prepare("SELECT client_id FROM agent_client_registrations").all()).toEqual([{client_id: second.client.clientId}])
  })

  it("protects the approval handoff through the original request deadline and purges an approval that never produces a code", () => {
    const window = openAgentWindow(store, deviceId)
    const first = registerAgentClient(store, makeRegistration(window.id))
    if (!first.ok) throw new Error(first.reason)
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1)
    const reopened = openAgentWindow(store, deviceId)
    const authorization = createAgentAuthorization(store, makeAuthorization(first.client.clientId), reopened.id)
    const request = readAgentRequest(store, authorization.requestId)
    if (!request) throw new Error("Expected an approval request")

    vi.advanceTimersByTime(1)
    expect(registerAgentClient(store, makeRegistration(reopened.id, "Another client")).ok).toBe(true)
    expect(readRegisteredAgentClient(store, ISSUER, first.client.clientId)).toEqual(first.client)

    approveAgentRequest(store, request.id, request.code, deviceId)
    const next = openAgentWindow(store, deviceId)
    expect(registerAgentClient(store, makeRegistration(next.id, "Another client")).ok).toBe(true)
    expect(readRegisteredAgentClient(store, ISSUER, first.client.clientId)).toEqual(first.client)

    vi.setSystemTime(new Date(request.expiresAt))
    expect(readRegisteredAgentClient(store, ISSUER, first.client.clientId)).toBeNull()
    const afterDeadline = openAgentWindow(store, deviceId)
    expect(registerAgentClient(store, makeRegistration(afterDeadline.id, "New client")).ok).toBe(true)
    expect(store.db.prepare("SELECT client_id FROM agent_client_registrations WHERE client_id = ?").get(first.client.clientId)).toBeUndefined()
  })

  it.each([false, true])("keeps an outstanding code or exchanged grant beyond registration expiry (exchanged: %s)", (isExchanged) => {
    const window = openAgentWindow(store, deviceId)
    const first = registerAgentClient(store, makeRegistration(window.id))
    if (!first.ok) throw new Error(first.reason)
    const clientId = first.client.clientId
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1)
    const reopened = openAgentWindow(store, deviceId)
    const params = makeAuthorization(clientId)
    const authorization = createAgentAuthorization(store, params, reopened.id)
    const request = readAgentRequest(store, authorization.requestId)
    if (!request) throw new Error("Expected an approval request")
    const agent = approveAgentRequest(store, request.id, request.code, deviceId)
    const code = issueAuthorizationCode(store, authorization.id)
    if (!code) throw new Error("Expected an authorization code")

    vi.advanceTimersByTime(1)
    const next = openAgentWindow(store, deviceId)
    expect(registerAgentClient(store, makeRegistration(next.id, "Another client")).ok).toBe(true)
    expect(readRegisteredAgentClient(store, ISSUER, first.client.clientId)).toEqual(first.client)

    if (isExchanged) {
      const result = exchangeAuthorizationCode(store, {clientId, code, codeVerifier: VERIFIER, redirectUri: CALLBACK}, params.resource)
      expect(result.ok).toBe(true)
    }

    vi.advanceTimersByTime(59_999)
    if (isExchanged) {
      expect(readRegisteredAgentClient(store, ISSUER, clientId)).toEqual(first.client)
      revokeAgent(store, agent.id)
    }
    expect(registerAgentClient(store, makeRegistration(next.id, "New client")).ok).toBe(true)
    expect(store.db.prepare("SELECT client_id FROM agent_client_registrations WHERE client_id = ?").get(clientId)).toBeUndefined()
  })
})

function makeRegistration(windowId: string, clientName = "Example Client"): Parameters<typeof registerAgentClient>[1] {
  return {issuer: ISSUER, windowId, clientName, redirectUris: [CALLBACK]}
}

function makeAuthorization(clientId: string): Parameters<typeof createAgentAuthorization>[1] {
  return {
    agentName: "Example Client",
    returnsTo: "127.0.0.1",
    isLocalProgram: true,
    clientId,
    redirectUri: CALLBACK,
    state: null,
    codeChallenge: createHash("sha256").update(VERIFIER).digest("base64url"),
    resource: `${ISSUER}/mcp`,
  }
}
