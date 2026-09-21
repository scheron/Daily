import dns from "node:dns"
import {isIP} from "node:net"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {fetchClientMetadata, isRegisteredRedirectUri} from "../../../src/agents/oauth/clientMetadata"
import {claudeAppDocument, claudeCodeDocument, codexDocument, startClientDocumentServer, unusedLoopbackPort} from "./harness"

import type {MockInstance} from "vitest"
import type {ClientMetadata} from "../../../src/agents/oauth/clientMetadata"
import type {ClientDocumentServer} from "./harness"

function stubLookup(hostname: string, address: string): MockInstance<typeof dns.lookup> {
  const realLookup = dns.lookup
  const family = isIP(address)
  const lookup = (name: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void): void => {
    if (name !== hostname) return realLookup(name, options, callback)
    process.nextTick(() => (options.all ? callback(null, [{address, family}]) : callback(null, address, family)))
  }

  return vi.spyOn(dns, "lookup").mockImplementation(lookup as typeof dns.lookup)
}

function jsonPaddedTo(doc: Record<string, unknown>, targetBytes: number): string {
  let pad = 0
  for (let attempt = 0; attempt < 4; attempt++) {
    const body = JSON.stringify({...doc, _pad: "x".repeat(pad)})
    const size = Buffer.byteLength(body, "utf8")
    if (size === targetBytes) return body
    pad += targetBytes - size
  }
  throw new Error(`could not pad a document to exactly ${targetBytes} bytes`)
}

describe("fetchClientMetadata accepts the three real clients' documents — TC-7", () => {
  let docs: ClientDocumentServer

  beforeEach(async () => {
    docs = await startClientDocumentServer()
  })

  afterEach(async () => {
    await docs.close()
  })

  it("TC-7: a Claude Code-shaped, a Claude app-shaped and a Codex-shaped document each answer ok with their own name and redirect URIs", async () => {
    const cases: [path: string, shape: (clientId: string) => Record<string, unknown>, name: string, redirectUris: string[]][] = [
      ["/claude-code.json", claudeCodeDocument, "Claude Code", ["http://localhost/callback", "http://127.0.0.1/callback"]],
      ["/claude-app.json", claudeAppDocument, "Claude", ["https://claude.ai/api/mcp/auth_callback"]],
      ["/codex.json", codexDocument, "Codex", ["http://127.0.0.1/callback", "http://localhost/callback"]],
    ]

    for (const [path, shape, name, redirectUris] of cases) {
      const clientId = docs.urlFor(path)
      docs.serve(path, {body: JSON.stringify(shape(clientId)), headers: {"cache-control": "public, max-age=300"}})

      const result = await fetchClientMetadata(clientId, {allowLoopback: true})
      expect(result).toEqual({ok: true, client: {clientId, clientName: name, redirectUris}})
    }
  })
})

describe("fetchClientMetadata refuses a client_id that could never be dialed safely — TC-8", () => {
  let docs: ClientDocumentServer

  beforeEach(async () => {
    docs = await startClientDocumentServer()
  })

  afterEach(async () => {
    await docs.close()
  })

  it("TC-8: a malformed id, a disallowed scheme, userinfo, a fragment, a . or .. segment, an empty path and disallowed loopback are all invalid_client_id, without a single request reaching anywhere", async () => {
    const candidates = [
      "not a url",
      "ftp://example.com/c",
      "http://example.com/c",
      "https://example.com",
      "https://example.com/",
      "https://u:p@example.com/c",
      "https://example.com/c#f",
      "https://example.com/a/../c",
      docs.urlFor("/client.json"),
    ]

    for (const clientId of candidates) {
      const result = await fetchClientMetadata(clientId, {allowLoopback: false})
      expect(result).toEqual({ok: false, refusal: "invalid_client_id"})
    }

    expect(docs.requestCount()).toBe(0)
  })
})

describe("fetchClientMetadata refuses the special-use address a client_id would resolve to — TC-9", () => {
  let docs: ClientDocumentServer

  beforeEach(async () => {
    docs = await startClientDocumentServer()
  })

  afterEach(async () => {
    await docs.close()
  })

  it("TC-9: every special-use address is unsafe_address without a request, and loopback permission unlocks loopback and nothing else", async () => {
    const port = new URL(docs.baseUrl).port

    const disallowedEvenWithoutLoopback = [
      `https://127.0.0.1:${port}/c`,
      `https://[::1]:${port}/c`,
      `https://[::ffff:127.0.0.1]:${port}/c`,
      "https://10.0.0.1/c",
      "https://169.254.169.254/latest/c",
      `https://localhost:${port}/c`,
    ]

    for (const clientId of disallowedEvenWithoutLoopback) {
      const result = await fetchClientMetadata(clientId, {allowLoopback: false})
      expect(result).toEqual({ok: false, refusal: "unsafe_address"})
    }

    const stillDisallowedWithLoopback = await fetchClientMetadata("https://10.0.0.1/c", {allowLoopback: true})
    expect(stillDisallowedWithLoopback).toEqual({ok: false, refusal: "unsafe_address"})

    expect(docs.requestCount()).toBe(0)
  })
})

describe("fetchClientMetadata bounds the fetch in time and in bytes — TC-10", () => {
  let docs: ClientDocumentServer

  beforeEach(async () => {
    docs = await startClientDocumentServer()
  })

  afterEach(async () => {
    await docs.close()
    vi.useRealTimers()
  })

  it("TC-10: a non-200, a redirect, an oversized body and a dead port all refuse unreachable; a document of exactly the byte cap is ok; the injectable bound fires fast and its default is 5000ms, proved without waiting it out", async () => {
    docs.serve("/missing", {status: 404, body: "{}"})

    const redirectTarget = docs.urlFor("/redirect-target")
    docs.serve("/redirect-target", {body: JSON.stringify(claudeCodeDocument(redirectTarget)), headers: {"cache-control": "public, max-age=300"}})
    docs.serve("/redirect", {status: 302, headers: {location: redirectTarget}})

    const bigClientId = docs.urlFor("/big.json")
    docs.serve("/big.json", {body: jsonPaddedTo(claudeCodeDocument(bigClientId), 5121), headers: {"cache-control": "public, max-age=300"}})

    const exactClientId = docs.urlFor("/exact.json")
    docs.serve("/exact.json", {body: jsonPaddedTo(claudeCodeDocument(exactClientId), 5120), headers: {"cache-control": "public, max-age=300"}})

    docs.serve("/hang", {hang: true})
    const deadPort = await unusedLoopbackPort()

    const missing = await fetchClientMetadata(docs.urlFor("/missing"), {allowLoopback: true})
    expect(missing).toEqual({ok: false, refusal: "unreachable"})

    const redirected = await fetchClientMetadata(docs.urlFor("/redirect"), {allowLoopback: true})
    expect(redirected).toEqual({ok: false, refusal: "unreachable"})
    expect(docs.requestCount("/redirect")).toBe(1)
    expect(docs.requestCount("/redirect-target")).toBe(0)

    const tooBig = await fetchClientMetadata(bigClientId, {allowLoopback: true})
    expect(tooBig).toEqual({ok: false, refusal: "unreachable"})

    const exact = await fetchClientMetadata(exactClientId, {allowLoopback: true})
    expect(exact).toEqual({
      ok: true,
      client: {clientId: exactClientId, clientName: "Claude Code", redirectUris: ["http://localhost/callback", "http://127.0.0.1/callback"]},
    })

    const dead = await fetchClientMetadata(`http://127.0.0.1:${deadPort}/c`, {allowLoopback: true})
    expect(dead).toEqual({ok: false, refusal: "unreachable"})

    const hangUrl = docs.urlFor("/hang")

    const startedAt = Date.now()
    const shortBound = await fetchClientMetadata(hangUrl, {allowLoopback: true, timeoutMs: 200})
    const elapsedMs = Date.now() - startedAt
    expect(shortBound).toEqual({ok: false, refusal: "unreachable"})
    expect(elapsedMs).toBeGreaterThanOrEqual(200)
    expect(elapsedMs).toBeLessThan(1000)

    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})
    try {
      let settled = false
      const defaultBoundPromise = fetchClientMetadata(hangUrl, {allowLoopback: true}).then((result) => {
        settled = true
        return result
      })

      await vi.advanceTimersByTimeAsync(4999)
      expect(settled).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      expect(await defaultBoundPromise).toEqual({ok: false, refusal: "unreachable"})
    } finally {
      vi.useRealTimers()
    }
  }, 10_000)
})

describe("fetchClientMetadata refuses whatever the document itself gets wrong — TC-11", () => {
  let docs: ClientDocumentServer

  beforeEach(async () => {
    docs = await startClientDocumentServer()
  })

  afterEach(async () => {
    await docs.close()
  })

  it("TC-11: not JSON, a JSON array, a client_id mismatch and every field CIMD requires are each invalid_document", async () => {
    const cases: [path: string, body: (clientId: string) => string][] = [
      ["/not-json", () => "not json"],
      ["/array", () => "[]"],
      ["/trailing-slash", (clientId) => JSON.stringify(claudeCodeDocument(`${clientId}/`))],
      ["/no-name", (clientId) => JSON.stringify(claudeCodeDocument(clientId, {client_name: undefined}))],
      ["/blank-name", (clientId) => JSON.stringify(claudeCodeDocument(clientId, {client_name: "   "}))],
      ["/long-name", (clientId) => JSON.stringify(claudeCodeDocument(clientId, {client_name: "x".repeat(101)}))],
      ["/no-redirects", (clientId) => JSON.stringify(claudeCodeDocument(clientId, {redirect_uris: undefined}))],
      ["/empty-redirects", (clientId) => JSON.stringify(claudeCodeDocument(clientId, {redirect_uris: []}))],
      ["/non-string-redirects", (clientId) => JSON.stringify(claudeCodeDocument(clientId, {redirect_uris: [42]}))],
      ["/auth-method", (clientId) => JSON.stringify(claudeCodeDocument(clientId, {token_endpoint_auth_method: "client_secret_basic"}))],
      ["/has-secret", (clientId) => JSON.stringify(claudeCodeDocument(clientId, {client_secret: "shh"}))],
      ["/grant-types", (clientId) => JSON.stringify(claudeCodeDocument(clientId, {grant_types: ["refresh_token"]}))],
      ["/response-types", (clientId) => JSON.stringify(claudeCodeDocument(clientId, {response_types: ["token"]}))],
    ]

    for (const [path, body] of cases) {
      const clientId = docs.urlFor(path)
      docs.serve(path, {body: body(clientId), headers: {"cache-control": "public, max-age=300"}})

      const result = await fetchClientMetadata(clientId, {allowLoopback: true})
      expect(result).toEqual({ok: false, refusal: "invalid_document"})
    }
  })
})

describe("fetchClientMetadata caches only a cacheable ok result, capped at an hour, re-checking loopback on every read — TC-12", () => {
  let docs: ClientDocumentServer

  beforeEach(async () => {
    docs = await startClientDocumentServer()
    vi.useFakeTimers({toFake: ["Date"]})
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
  })

  afterEach(async () => {
    vi.useRealTimers()
    await docs.close()
  })

  it("TC-12: a 300-second document is cached for 300 seconds, no cache-control or no-store is never cached, an 86400-second document is capped at one hour, a refused fetch is retried, and a cache hit still re-checks loopback permission", async () => {
    const at = (offsetMs: number): void => vi.setSystemTime(new Date(Date.parse("2026-01-01T00:00:00.000Z") + offsetMs))

    const cappedId = docs.urlFor("/300s.json")
    docs.serve("/300s.json", {body: JSON.stringify(claudeCodeDocument(cappedId)), headers: {"cache-control": "public, max-age=300"}})
    at(0)
    await fetchClientMetadata(cappedId, {allowLoopback: true})
    at(299_000)
    await fetchClientMetadata(cappedId, {allowLoopback: true})
    at(301_000)
    await fetchClientMetadata(cappedId, {allowLoopback: true})
    expect(docs.requestCount("/300s.json")).toBe(2)

    const noHeaderId = docs.urlFor("/no-header.json")
    docs.serve("/no-header.json", {body: JSON.stringify(claudeCodeDocument(noHeaderId))})
    at(0)
    await fetchClientMetadata(noHeaderId, {allowLoopback: true})
    await fetchClientMetadata(noHeaderId, {allowLoopback: true})
    expect(docs.requestCount("/no-header.json")).toBe(2)

    const noStoreId = docs.urlFor("/no-store.json")
    docs.serve("/no-store.json", {body: JSON.stringify(claudeCodeDocument(noStoreId)), headers: {"cache-control": "public, max-age=300, no-store"}})
    at(0)
    await fetchClientMetadata(noStoreId, {allowLoopback: true})
    await fetchClientMetadata(noStoreId, {allowLoopback: true})
    expect(docs.requestCount("/no-store.json")).toBe(2)

    const dayId = docs.urlFor("/day.json")
    docs.serve("/day.json", {body: JSON.stringify(claudeCodeDocument(dayId)), headers: {"cache-control": "public, max-age=86400"}})
    at(0)
    await fetchClientMetadata(dayId, {allowLoopback: true})
    at(3_599_000)
    await fetchClientMetadata(dayId, {allowLoopback: true})
    at(3_601_000)
    await fetchClientMetadata(dayId, {allowLoopback: true})
    expect(docs.requestCount("/day.json")).toBe(2)

    const flakyId = docs.urlFor("/flaky.json")
    docs.serve("/flaky.json", {status: 500, body: ""})
    const firstFlaky = await fetchClientMetadata(flakyId, {allowLoopback: true})
    expect(firstFlaky).toEqual({ok: false, refusal: "unreachable"})
    docs.serve("/flaky.json", {body: JSON.stringify(claudeCodeDocument(flakyId)), headers: {"cache-control": "public, max-age=300"}})
    const secondFlaky = await fetchClientMetadata(flakyId, {allowLoopback: true})
    expect(secondFlaky.ok).toBe(true)
    expect(docs.requestCount("/flaky.json")).toBe(2)

    const loopbackId = docs.urlFor("/loopback.json")
    docs.serve("/loopback.json", {body: JSON.stringify(claudeCodeDocument(loopbackId)), headers: {"cache-control": "public, max-age=300"}})
    const cachedWithLoopback = await fetchClientMetadata(loopbackId, {allowLoopback: true})
    expect(cachedWithLoopback.ok).toBe(true)
    const requestsBeforeRecheck = docs.requestCount("/loopback.json")
    const refusedWithoutLoopback = await fetchClientMetadata(loopbackId, {allowLoopback: false})
    expect(refusedWithoutLoopback).toEqual({ok: false, refusal: "invalid_client_id"})
    expect(docs.requestCount("/loopback.json")).toBe(requestsBeforeRecheck)
  })
})

describe("isRegisteredRedirectUri accepts only what a document lists, port-ignored on loopback — TC-13", () => {
  it("TC-13: a plain match, a port-ignored loopback match, a mismatched path, host, scheme or query, an unlisted loopback host and a private-use scheme are each judged on their own", () => {
    const claudeCode: ClientMetadata = {
      clientId: "https://claude.ai/oauth/claude-code-client-metadata",
      clientName: "Claude Code",
      redirectUris: ["http://localhost/callback", "http://127.0.0.1/callback"],
    }
    const claudeApp: ClientMetadata = {
      clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
      clientName: "Claude",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    }
    const codexPerServer: ClientMetadata = {
      clientId: "https://chatgpt.com/oauth/codex/client.json",
      clientName: "Codex",
      redirectUris: ["http://127.0.0.1/callback/epMNJ6P1xGQ9"],
    }
    const mixedClient: ClientMetadata = {
      clientId: "https://example.com/client.json",
      clientName: "Mixed",
      redirectUris: ["http://example.com/cb", "com.example.app:/cb"],
    }

    expect(isRegisteredRedirectUri(claudeCode, "http://localhost:54321/callback")).toBe(true)
    expect(isRegisteredRedirectUri(claudeCode, "http://127.0.0.1:1/callback")).toBe(true)
    expect(isRegisteredRedirectUri(claudeCode, "http://localhost/callback")).toBe(true)
    expect(isRegisteredRedirectUri(claudeApp, "https://claude.ai/api/mcp/auth_callback")).toBe(true)
    expect(isRegisteredRedirectUri(codexPerServer, "http://127.0.0.1:61000/callback/epMNJ6P1xGQ9")).toBe(true)

    expect(isRegisteredRedirectUri(claudeCode, "http://localhost:54321/callback?x=1")).toBe(false)
    expect(isRegisteredRedirectUri(claudeCode, "http://localhost:54321/other")).toBe(false)
    expect(isRegisteredRedirectUri(claudeCode, "https://localhost:54321/callback")).toBe(false)
    expect(isRegisteredRedirectUri(claudeCode, "http://[::1]:5/callback")).toBe(false)
    expect(isRegisteredRedirectUri(claudeCode, "http://evil.example/callback")).toBe(false)
    expect(isRegisteredRedirectUri(claudeApp, "https://claude.ai:8443/api/mcp/auth_callback")).toBe(false)
    expect(isRegisteredRedirectUri(claudeApp, "https://claude.ai/api/mcp/auth_callback/")).toBe(false)
    expect(isRegisteredRedirectUri(mixedClient, "http://example.com/cb")).toBe(false)
    expect(isRegisteredRedirectUri(mixedClient, "com.example.app:/cb")).toBe(false)
  })
})

describe("fetchClientMetadata judges a plain IPv4 or IPv6 address by its own ranges alone — TC-61", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("TC-61: a public IPv4 or IPv6 literal passes the address check and answers unreachable, never unsafe_address; both IPv4-mapped literals stay unsafe_address, loopback allowed or not", async () => {
    const publicLiteral = await fetchClientMetadata("https://1.1.1.1/client.json", {allowLoopback: false, timeoutMs: 1})
    expect(publicLiteral).toEqual({ok: false, refusal: "unreachable"})

    const mappedPrivate = await fetchClientMetadata("https://[::ffff:a00:1]/x", {allowLoopback: false})
    expect(mappedPrivate).toEqual({ok: false, refusal: "unsafe_address"})

    const mappedLoopback = await fetchClientMetadata("https://[::ffff:7f00:1]/x", {allowLoopback: true})
    expect(mappedLoopback).toEqual({ok: false, refusal: "unsafe_address"})

    const publicIpv6Literal = await fetchClientMetadata("https://[2606:4700:4700::1111]/client.json", {allowLoopback: false, timeoutMs: 1})
    expect(publicIpv6Literal).toEqual({ok: false, refusal: "unreachable"})
  })

  it("TC-61: a hostname resolving only to a public IPv4 address answers unreachable through the stubbed lookup, never unsafe_address", async () => {
    const lookupSpy = stubLookup("public-ipv4.invalid", "1.1.1.1")

    const result = await fetchClientMetadata("https://public-ipv4.invalid/client.json", {allowLoopback: false, timeoutMs: 1})

    expect(lookupSpy).toHaveBeenCalledWith("public-ipv4.invalid", expect.anything(), expect.any(Function))
    expect(result).toEqual({ok: false, refusal: "unreachable"})
  })

  it("TC-61: a hostname resolving only to a public IPv6 address answers unreachable through the stubbed lookup, never unsafe_address", async () => {
    const lookupSpy = stubLookup("public-ipv6.invalid", "2607:6bc0::10")

    const result = await fetchClientMetadata("https://public-ipv6.invalid/client.json", {allowLoopback: false, timeoutMs: 1})

    expect(lookupSpy).toHaveBeenCalledWith("public-ipv6.invalid", expect.anything(), expect.any(Function))
    expect(result).toEqual({ok: false, refusal: "unreachable"})
  })
})

describe("fetchClientMetadata refuses every IPv6 range that embeds an IPv4 — TC-62", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const embeddedIpv4Literals: [label: string, literal: string][] = [
    ["an IPv4-compatible literal for 127.0.0.1", "https://[::7f00:1]/x"],
    ["an IPv4-compatible literal for 10.0.0.1", "https://[::a00:1]/x"],
    ["a 6to4 literal for 127.0.0.1", "https://[2002:7f00:1::]/x"],
    ["a 6to4 literal for 169.254.169.254", "https://[2002:a9fe:a9fe::]/x"],
    ["a local-use NAT64 literal for 127.0.0.1", "https://[64:ff9b:1::7f00:1]/x"],
    ["the well-known NAT64 control for 127.0.0.1", "https://[64:ff9b::7f00:1]/x"],
  ]

  it.each(embeddedIpv4Literals)("TC-62: %s is unsafe_address without loopback allowed", async (_label, literal) => {
    expect(await fetchClientMetadata(literal, {allowLoopback: false})).toEqual({ok: false, refusal: "unsafe_address"})
  })

  it.each(embeddedIpv4Literals)("TC-62: %s is unsafe_address with loopback allowed", async (_label, literal) => {
    expect(await fetchClientMetadata(literal, {allowLoopback: true})).toEqual({ok: false, refusal: "unsafe_address"})
  })

  it("TC-62: a hostname resolving only to a 6to4 address embedding a private IPv4 is unsafe_address through the stubbed lookup", async () => {
    const lookupSpy = stubLookup("six-to-four.invalid", "2002:a9fe:a9fe::")

    const result = await fetchClientMetadata("https://six-to-four.invalid/client.json", {allowLoopback: false})

    expect(lookupSpy).toHaveBeenCalledWith("six-to-four.invalid", expect.anything(), expect.any(Function))
    expect(result).toEqual({ok: false, refusal: "unsafe_address"})
  })
})

describe("fetchClientMetadata lets IPv6 loopback through once loopback is allowed", () => {
  it("an http://[::1] client_id passes the address check with loopback allowed and answers unreachable, never unsafe_address", async () => {
    const port = await unusedLoopbackPort()

    const result = await fetchClientMetadata(`http://[::1]:${port}/client.json`, {allowLoopback: true, timeoutMs: 1})

    expect(result).toEqual({ok: false, refusal: "unreachable"})
  })
})

describe("fetchClientMetadata refuses the IANA special-purpose IPv6 ranges that embed no IPv4", () => {
  const specialPurposeLiterals: [label: string, literal: string][] = [
    ["the top of 3fff::/20, documentation", "https://[3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff]/x"],
    ["the top of 5f00::/16, segment routing", "https://[5f00:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/x"],
    ["the top of 100:0:0:1::/64, the dummy prefix", "https://[100:0:0:1:ffff:ffff:ffff:ffff]/x"],
  ]

  it.each(specialPurposeLiterals)("%s is unsafe_address", async (_label, literal) => {
    expect(await fetchClientMetadata(literal, {allowLoopback: false, timeoutMs: 1})).toEqual({ok: false, refusal: "unsafe_address"})
  })
})
