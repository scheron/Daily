import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {agentUrls, isAgentResource} from "../../src/agents/agentUrls"
import {resolveServerConfig} from "../../src/config/resolveServerConfig"
import {AGENT_OAUTH_TEST_PATHS, bootAgentServer, claimParent, openAgentWindowOver} from "./oauth/harness"

import type {AgentWindow, RevisionProbe} from "@daily/protocol"
import type {BootedAgentServer} from "./oauth/harness"

describe("protected resource metadata and authorization server metadata — TC-1, TC-2", () => {
  let booted: BootedAgentServer

  beforeEach(async () => {
    booted = await bootAgentServer()
  })

  afterEach(async () => {
    await booted.close()
  })

  it.each([
    ["unclaimed", false],
    ["claimed", true],
  ])("TC-1: both protected resource metadata paths answer the same document, unauthenticated, on a %s server", async (_label, claim) => {
    if (claim) await claimParent(booted)

    for (const path of [`${AGENT_OAUTH_TEST_PATHS.protectedResource}/mcp`, AGENT_OAUTH_TEST_PATHS.protectedResource]) {
      const res = await fetch(`${booted.baseUrl}${path}`)

      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/json")
      expect(res.headers.get("cache-control")).toBe("no-store")
      expect(await res.json()).toEqual({
        resource: `${booted.issuer}/mcp`,
        authorization_servers: [booted.issuer],
        bearer_methods_supported: ["header"],
        resource_name: "Daily",
      })
    }
  })

  it("TC-2: authorization server metadata answers exactly the nine fields Claude reads to choose CIMD", async () => {
    const res = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.authorizationServer}`)

    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json).toEqual({
      issuer: booted.issuer,
      authorization_endpoint: `${booted.issuer}${AGENT_OAUTH_TEST_PATHS.authorize}`,
      token_endpoint: `${booted.issuer}${AGENT_OAUTH_TEST_PATHS.token}`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    })
    expect(json).not.toHaveProperty("scopes_supported")
    expect(json).not.toHaveProperty("registration_endpoint")
  })
})

describe("a public address builds one string for the Mac to copy and the server to serve — TC-3", () => {
  it("TC-3: a trailing slash on the public address leaves one slash before every path, and the Agent window's agentAddress is the resource metadata's own resource", async () => {
    const booted = await bootAgentServer({publicUrl: "https://daily.example.com/"})

    try {
      const parent = await claimParent(booted)

      const resourceRes = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.protectedResource}/mcp`)
      const resourceJson = (await resourceRes.json()) as {resource: string; authorization_servers: string[]}
      expect(resourceJson.resource).toBe("https://daily.example.com/mcp")
      expect(resourceJson.authorization_servers).toEqual(["https://daily.example.com"])

      const authServerRes = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.authorizationServer}`)
      const authServerJson = (await authServerRes.json()) as {issuer: string; authorization_endpoint: string; token_endpoint: string}
      expect(authServerJson.issuer).toBe("https://daily.example.com")
      expect(authServerJson.authorization_endpoint).toBe("https://daily.example.com/oauth/authorize")
      expect(authServerJson.token_endpoint).toBe("https://daily.example.com/oauth/token")

      const window: AgentWindow = await openAgentWindowOver(booted, parent.token)
      expect(window.agentAddress).toBe(resourceJson.resource)
    } finally {
      await booted.close()
    }
  })
})

describe("a server that does not accept agents answers the same fact on every discovery path — TC-4", () => {
  it("TC-4: a server with no public address and a self-signed server both answer 404 agents_not_supported on discovery while window/open keeps its own 409", async () => {
    const noPublicUrl = await bootAgentServer({}, {autoPublicUrl: false})
    try {
      const parent = await claimParent(noPublicUrl)
      await assertAgentsNotSupported(noPublicUrl, parent.token)
    } finally {
      await noPublicUrl.close()
    }

    const previousTls = process.env.DAILY_SERVER_TLS
    process.env.DAILY_SERVER_TLS = "self-signed"
    try {
      const selfSigned = await bootAgentServer({publicUrl: "https://192.0.2.10"})
      try {
        const parent = await claimParent(selfSigned)
        await assertAgentsNotSupported(selfSigned, parent.token)
      } finally {
        await selfSigned.close()
      }
    } finally {
      if (previousTls === undefined) delete process.env.DAILY_SERVER_TLS
      else process.env.DAILY_SERVER_TLS = previousTls
    }
  })
})

async function assertAgentsNotSupported(booted: BootedAgentServer, parentToken: string): Promise<void> {
  for (const path of [
    `${AGENT_OAUTH_TEST_PATHS.protectedResource}/mcp`,
    AGENT_OAUTH_TEST_PATHS.protectedResource,
    AGENT_OAUTH_TEST_PATHS.authorizationServer,
  ]) {
    const res = await fetch(`${booted.baseUrl}${path}`)
    expect(res.status).toBe(404)
    const json = (await res.json()) as {error: string; error_description: string}
    expect(json.error).toBe("agents_not_supported")
    expect(typeof json.error_description).toBe("string")
  }

  const opened = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {
    method: "POST",
    headers: {authorization: `Bearer ${parentToken}`},
  })
  expect(opened.status).toBe(409)
  expect(await opened.json()).toEqual({ok: false, error: {code: "AGENTS_NOT_SUPPORTED", message: expect.any(String)}})
}

describe("IPv6 loopback in brackets accepts agents — TC-5", () => {
  it("TC-5: a public address of http://[::1]:<port> reports acceptsAgents true and serves that same issuer", async () => {
    const booted = await bootAgentServer({publicUrl: "http://[::1]:4321"})

    try {
      const parent = await claimParent(booted)

      const probe = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${parent.token}`}})
      const probeJson = (await probe.json()) as {ok: true; data: RevisionProbe}
      expect(probeJson.data.acceptsAgents).toBe(true)

      const authServerRes = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.authorizationServer}`)
      expect(authServerRes.status).toBe(200)
      const authServerJson = (await authServerRes.json()) as {issuer: string}
      expect(authServerJson.issuer).toBe("http://[::1]:4321")
    } finally {
      await booted.close()
    }
  })
})

describe("isAgentResource canonicalises exactly as MCP's basic/authorization asks — TC-6", () => {
  it("TC-6: a candidate matches only by scheme, host and path, case- and trailing-slash- and default-port-insensitively, never by query, fragment, userinfo or a different port", () => {
    const urls = agentUrls(resolveServerConfig({dataDir: "", host: "127.0.0.1", port: 0, publicUrl: "https://daily.example.com"}))
    if (!urls) throw new Error("expected agentUrls to answer for an accepting config")

    const accepted = [
      "https://daily.example.com/mcp",
      "HTTPS://Daily.Example.COM/mcp",
      "https://daily.example.com/mcp/",
      "https://daily.example.com:443/mcp",
    ]
    for (const candidate of accepted) expect(isAgentResource(urls, candidate)).toBe(true)

    const refused = [
      "https://daily.example.com/mcp?x=1",
      "https://daily.example.com/mcp#f",
      "https://u:p@daily.example.com/mcp",
      "http://daily.example.com/mcp",
      "https://daily.example.com:8443/mcp",
      "https://daily.example.com/",
      "https://daily.example.com/mcp/x",
      "https://other.example/mcp",
      "not a url",
      "https://daily.example.com/mcp//",
    ]
    for (const candidate of refused) expect(isAgentResource(urls, candidate)).toBe(false)
  })
})
