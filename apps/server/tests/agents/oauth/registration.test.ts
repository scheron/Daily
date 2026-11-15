import {once} from "node:events"
import {rmSync} from "node:fs"
import http from "node:http"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {readRegisteredAgentClient} from "../../../src/agents/oauth/AgentClientRegistrationStore"
import {bootAgentServer, claimParent, openAgentWindowOver, readAgentsList, readPendingRequest} from "./harness"

import type {BootedAgentServer} from "./harness"

const REGISTRATION_PATH = "/oauth/register"

describe("OAuth client registration", () => {
  let server: BootedAgentServer
  let parentToken: string

  beforeEach(async () => {
    server = await bootAgentServer({}, {deleteDataDirOnClose: false})
    parentToken = (await claimParent(server)).token
  })

  afterEach(async () => {
    vi.useRealTimers()
    await server.close()
    rmSync(server.dataDir, {recursive: true, force: true})
  })

  it("returns a public client ID only while the connection window is open and creates no approval or grant", async () => {
    const closed = await register(server)
    expect(closed.status).toBe(403)
    expect(await closed.json()).toEqual({error: "access_denied", error_description: expect.stringContaining("Connect an agent")})

    await openAgentWindowOver(server, parentToken)

    const startedAt = Math.floor(Date.now() / 1000)
    const response = await register(server, {client_name: "  Desktop client  "})
    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("content-type")).toBe("application/json")
    const registered = await response.json()
    expect(registered).toEqual({
      client_id: expect.stringMatching(/^daily_[A-Za-z0-9_-]+$/),
      client_id_issued_at: expect.any(Number),
      client_name: "Desktop client",
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    })
    expect(registered.client_id_issued_at).toBeGreaterThanOrEqual(startedAt)
    expect(registered.client_id_issued_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))
    expect(await readPendingRequest(server, parentToken)).toBeNull()
    expect((await readAgentsList(server, parentToken)).agents).toEqual([])
  })

  it("assigns public defaults and stores only supported metadata", async () => {
    await openAgentWindowOver(server, parentToken)
    const redirectUris = ["https://agent.example/callback", "http://[::1]:1234/callback"]
    const response = await postRegistration(
      server,
      JSON.stringify({redirect_uris: redirectUris, logo_uri: "https://agent.example/logo.png", extension: "ignored"}),
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      client_id: expect.any(String),
      client_id_issued_at: expect.any(Number),
      client_name: "Unnamed agent",
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    })
  })

  it.each([
    ["a non-loopback HTTP callback", {redirect_uris: ["http://agent.example/callback"]}, "invalid_redirect_uri"],
    ["a private-use scheme", {redirect_uris: ["agent:/callback"]}, "invalid_redirect_uri"],
    ["a callback fragment", {redirect_uris: ["https://agent.example/callback#"]}, "invalid_redirect_uri"],
    ["too many callbacks", {redirect_uris: Array.from({length: 9}, (_, index) => `https://agent.example/${index}`)}, "invalid_redirect_uri"],
    ["an oversized callback", {redirect_uris: [`https://agent.example/${"a".repeat(2048)}`]}, "invalid_redirect_uri"],
    ["a control character in the client name", {client_name: "Desktop\nClient"}, "invalid_client_metadata"],
    ["an oversized client name", {client_name: "a".repeat(101)}, "invalid_client_metadata"],
    ["a confidential authentication method", {token_endpoint_auth_method: "client_secret_basic"}, "invalid_client_metadata"],
    ["a supplied client secret", {client_secret: "local-test-value"}, "invalid_client_metadata"],
    ["a supplied client ID", {client_id: "preexisting-client"}, "invalid_client_metadata"],
    ["an unsupported grant", {grant_types: ["authorization_code", "client_credentials"]}, "invalid_client_metadata"],
    ["a missing authorization-code grant", {grant_types: ["refresh_token"]}, "invalid_client_metadata"],
    ["an unsupported response type", {response_types: ["code", "token"]}, "invalid_client_metadata"],
  ])("rejects %s", async (_label, metadata, error) => {
    await openAgentWindowOver(server, parentToken)
    const response = await register(server, metadata)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({error, error_description: expect.any(String)})
  })

  it("rejects non-JSON, malformed and oversized bodies before reading metadata", async () => {
    await openAgentWindowOver(server, parentToken)
    const nonJson = await postRegistration(server, "{}", "text/plain")
    const malformed = await postRegistration(server, "{invalid}")
    const oversized = await postRegistration(server, JSON.stringify({extension: "é".repeat(4096)}))

    for (const response of [nonJson, malformed, oversized]) {
      expect(await response.json()).toEqual({error: "invalid_client_metadata", error_description: expect.any(String)})
    }
    expect(nonJson.status).toBe(400)
    expect(malformed.status).toBe(400)
    expect(oversized.status).toBe(413)
  })

  it("limits registrations with a chunked body even without Content-Length", async () => {
    await openAgentWindowOver(server, parentToken)
    const request = http.request(`${server.baseUrl}${REGISTRATION_PATH}`, {
      method: "POST",
      headers: {"content-type": "application/json", "transfer-encoding": "chunked"},
    })
    const response = once(request, "response")
    request.write('{"extension":"')
    request.end(`${"x".repeat(8192)}"}`)

    const [reply] = await response
    expect(reply.statusCode).toBe(413)
    reply.resume()
    await once(reply, "end")
  })

  it("refuses a registration whose window is replaced while the body is in flight", async () => {
    await openAgentWindowOver(server, parentToken)
    const body = JSON.stringify(makeRegistrationMetadata())
    const request = http.request(`${server.baseUrl}${REGISTRATION_PATH}`, {
      method: "POST",
      headers: {"content-type": "application/json", "content-length": Buffer.byteLength(body), expect: "100-continue"},
    })
    const continued = once(request, "continue")
    const response = once(request, "response")
    request.flushHeaders()
    await continued

    await openAgentWindowOver(server, parentToken)
    request.end(body)

    const [reply] = await response
    expect(reply.statusCode).toBe(403)
    reply.resume()
    await once(reply, "end")
    expect((await register(server)).status).toBe(201)
  })

  it("ends an incomplete registration body at its ten-second deadline", async () => {
    await openAgentWindowOver(server, parentToken)
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})
    const request = http.request(`${server.baseUrl}${REGISTRATION_PATH}`, {
      method: "POST",
      headers: {"content-type": "application/json", "content-length": 100, expect: "100-continue"},
    })
    const continued = once(request, "continue")
    const response = once(request, "response")
    request.flushHeaders()
    try {
      await continued
      await vi.advanceTimersByTimeAsync(10_000)

      const [reply] = await response
      expect(reply.statusCode).toBe(408)
      reply.resume()
      await once(reply, "end")
    } finally {
      request.destroy()
    }
  })

  it("accepts eight concurrent distinct registrations and lets a successful request retry at the window limit", async () => {
    await openAgentWindowOver(server, parentToken)
    const responses = await Promise.all(Array.from({length: 10}, (_, index) => register(server, {client_name: `Test client ${index}`})))
    const results = await Promise.all(responses.map((response) => response.json()))
    const allowed = results.filter((_result, index) => responses[index].status === 201)
    const rejected = results.filter((_result, index) => responses[index].status === 429)

    expect(allowed).toHaveLength(8)
    expect(new Set(allowed.map((result) => result.client_id)).size).toBe(8)
    expect(rejected).toHaveLength(2)
    expect(rejected).toEqual(Array(2).fill({error: "temporarily_unavailable", error_description: expect.stringContaining("new window")}))

    const retried = await register(server, {client_name: allowed[0].client_name})
    expect(retried.status).toBe(201)
    expect(await retried.json()).toEqual(allowed[0])
  })

  it("reports how long to wait after 32 distinct clients register across windows in one minute", async () => {
    const start = new Date("2026-07-01T00:00:00Z")
    vi.useFakeTimers({toFake: ["Date"]})
    vi.setSystemTime(start)

    for (let window = 0; window < 4; window++) {
      await openAgentWindowOver(server, parentToken)
      const responses = await Promise.all(Array.from({length: 8}, (_, index) => register(server, {client_name: `Test client ${window}-${index}`})))
      expect(responses.map((response) => response.status)).toEqual(Array(8).fill(201))
    }

    vi.setSystemTime(start.getTime() + 15_000)
    await openAgentWindowOver(server, parentToken)
    const limited = await register(server)
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("45")
    expect(await limited.json()).toEqual({error: "temporarily_unavailable", error_description: expect.stringContaining("shortly")})

    vi.setSystemTime(start.getTime() + 60_000)
    expect((await register(server)).status).toBe(201)
  })

  it("reuses the same ID and issue time after a restart and issues a fresh ID after unused registrations expire", async () => {
    vi.useFakeTimers({toFake: ["Date"]})
    vi.setSystemTime(new Date("2026-07-01T00:00:00Z"))
    await openAgentWindowOver(server, parentToken)
    const issued = await register(server)
    expect(issued.status).toBe(201)
    const initial = await issued.json()
    const {dataDir, issuer} = server
    await server.close()
    server = await bootAgentServer({dataDir, publicUrl: issuer}, {deleteDataDirOnClose: false})

    const reused = await register(server)
    expect(reused.status).toBe(201)
    expect(await reused.json()).toEqual(initial)

    vi.setSystemTime(new Date("2026-07-02T00:00:00Z"))
    expect(readRegisteredAgentClient(server.store, issuer, initial.client_id)).toBeNull()
    await openAgentWindowOver(server, parentToken)
    const fresh = await register(server)
    expect(fresh.status).toBe(201)
    const replacement = await fresh.json()
    expect(replacement.client_id).not.toBe(initial.client_id)
    expect(replacement.client_id_issued_at).toBe(initial.client_id_issued_at + 86_400)
  })
})

function register(server: BootedAgentServer, overrides: Record<string, unknown> = {}): Promise<Response> {
  return postRegistration(server, JSON.stringify(makeRegistrationMetadata(overrides)))
}

function postRegistration(server: BootedAgentServer, body: string, mediaType = "application/json; charset=utf-8"): Promise<Response> {
  return fetch(`${server.baseUrl}${REGISTRATION_PATH}`, {
    method: "POST",
    headers: {"content-type": mediaType},
    body,
  })
}

function makeRegistrationMetadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    client_name: "Desktop client",
    redirect_uris: ["http://127.0.0.1/callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    ...overrides,
  }
}
