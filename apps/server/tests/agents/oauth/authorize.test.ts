import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {describe, expect, it} from "vitest"

import {AGENT_ENDPOINT_PATH, SYNC_PROTOCOL_CONFIG} from "@daily/protocol"

import {approveAgentRequest, createAgentRequest, openAgentWindow} from "../../../src/agents/AgentStore"
import {createDevice} from "../../../src/devices/DeviceStore"
import {loadIdentity} from "../../../src/identity/ServerIdentityStore"
import {createBetterSqliteDriver} from "../../../src/store/betterSqliteDriver"
import {openServerStore} from "../../../src/store/instance"
import {runMigrations} from "../../../src/store/migrate"
import {v001} from "../../../src/store/migrations/v001-initial-schema"
import {v002} from "../../../src/store/migrations/v002-snapshot"
import {v003} from "../../../src/store/migrations/v003-assets"
import {v004} from "../../../src/store/migrations/v004-device-roles"
import {v005} from "../../../src/store/migrations/v005-agents"
import {
  AGENT_OAUTH_TEST_PATHS,
  approveRequest,
  bootAgentServer,
  buildAuthorizeUrl,
  claimParent,
  claudeAppDocument,
  claudeCodeDocument,
  codexDocument,
  denyRequest,
  enrollChild,
  makePkcePair,
  openAgentWindowOver,
  readAgentsList,
  readPendingRequest,
  registerClientDocument,
  revokeAgentOver,
  startClientDocumentServer,
} from "./harness"

import type {ServerStore} from "../../../src/store/instance"
import type {BootedAgentServer} from "./harness"

function extractHref(html: string): string {
  const match = /href="([^"]+)"/.exec(html)
  if (!match) throw new Error("expected the page to carry a link")

  return match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

function codeAsDigitTriples(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

async function startAndConsentUrl(
  server: BootedAgentServer,
  parentToken: string,
  clientId: string,
  redirectUri: string,
  extra: {state?: string} = {},
): Promise<{authorizationId: string; consentPath: string}> {
  await openAgentWindowOver(server, parentToken)
  const {challenge} = makePkcePair()
  const res = await fetch(buildAuthorizeUrl(server, {clientId, redirectUri, codeChallenge: challenge, state: extra.state}), {redirect: "manual"})
  if (res.status !== 303) throw new Error(`expected the harness's authorize call to reach the consent page, got ${res.status}`)
  const location = res.headers.get("location")
  if (!location) throw new Error("expected a Location header")
  const authorizationId = new URL(location, server.baseUrl).searchParams.get("id")
  if (!authorizationId) throw new Error("expected the consent redirect to carry an id")

  return {authorizationId, consentPath: location}
}

describe("GET /oauth/authorize refuses outright with no Agent window open — TC-30", () => {
  it("TC-30: with no Agent window open, authorize starts nothing and fetches nothing, offering Try again on the same URL", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      const {challenge} = makePkcePair()
      const authorizeUrl = buildAuthorizeUrl(booted, {clientId, redirectUri: "http://localhost:5555/callback", codeChallenge: challenge, state: "s1"})

      const res = await fetch(authorizeUrl, {redirect: "manual"})
      expect(res.status).toBe(403)
      expect(res.headers.get("location")).toBeNull()

      const html = await res.text()
      expect(html).toContain("Daily isn't expecting an agent")
      expect(html).toContain("On one of your Macs, open Settings → Sync, press Connect an agent, then try again here.")

      const hrefUrl = new URL(extractHref(html), booted.baseUrl)
      const originalUrl = new URL(authorizeUrl)
      expect(hrefUrl.pathname).toBe(originalUrl.pathname)
      expect(Object.fromEntries(hrefUrl.searchParams)).toEqual(Object.fromEntries(originalUrl.searchParams))

      expect(docs.requestCount()).toBe(0)

      const pending = await readPendingRequest(booted, parent.token)
      expect(pending).toBeNull()

      const requestCount = booted.store.db.prepare(`SELECT COUNT(*) as n FROM agent_requests`).get() as {n: number}
      expect(requestCount.n).toBe(0)
      const authorizationCount = booted.store.db.prepare(`SELECT COUNT(*) as n FROM agent_authorizations`).get() as {n: number}
      expect(authorizationCount.n).toBe(0)
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("a second authorize request while one already waits is refused outright — TC-31", () => {
  it("TC-31: a second authorize request while one is already waiting fetches nothing for it and leaves exactly one pending request and one authorization", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      await openAgentWindowOver(booted, parent.token)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)

      const {challenge: c1} = makePkcePair()
      const first = await fetch(buildAuthorizeUrl(booted, {clientId, redirectUri: "http://localhost:5555/callback", codeChallenge: c1}), {
        redirect: "manual",
      })
      expect(first.status).toBe(303)

      const uncacheableSecondClientId = registerClientDocument(docs, "/claude-code-second.json", claudeCodeDocument, {})

      const {challenge: c2} = makePkcePair()
      const second = await fetch(
        buildAuthorizeUrl(booted, {clientId: uncacheableSecondClientId, redirectUri: "http://localhost:5555/callback", codeChallenge: c2}),
        {
          redirect: "manual",
        },
      )
      expect(second.status).toBe(409)
      expect(second.headers.get("location")).toBeNull()
      const html = await second.text()
      expect(html).toContain("Another agent is already waiting")
      expect(html).toContain("A request is already waiting for approval on your Mac. If it isn't yours, decline it there, then try again here.")

      expect(docs.requestCount("/claude-code-second.json")).toBe(0)

      const pendingCount = booted.store.db.prepare(`SELECT COUNT(*) as n FROM agent_requests WHERE state = 'pending'`).get() as {n: number}
      expect(pendingCount.n).toBe(1)
      const authorizationCount = booted.store.db.prepare(`SELECT COUNT(*) as n FROM agent_authorizations`).get() as {n: number}
      expect(authorizationCount.n).toBe(1)
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("the consent page names the agent, the code and where it returns — TC-32", () => {
  it("TC-32: the consent page reads correctly for a local program and for claude.ai, and the pending request carries the same facts", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const claudeCodeId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      const claudeAppId = registerClientDocument(docs, "/claude-app.json", claudeAppDocument)

      await openAgentWindowOver(booted, parent.token)
      const {challenge: c1} = makePkcePair()
      const authorizeRes = await fetch(
        buildAuthorizeUrl(booted, {
          clientId: claudeCodeId,
          redirectUri: "http://localhost:5555/callback",
          codeChallenge: c1,
          state: "s1",
          resource: `${booted.issuer}${AGENT_ENDPOINT_PATH}`,
        }),
        {redirect: "manual"},
      )
      expect(authorizeRes.status).toBe(303)
      const location = authorizeRes.headers.get("location")
      expect(location).toMatch(/^\/oauth\/consent\?id=/)

      const pending = await readPendingRequest(booted, parent.token)
      if (!pending) throw new Error("expected a pending request")
      expect(pending.agentName).toBe("Claude Code")
      expect(pending.returnsTo).toBe("localhost")
      expect(pending.isLocalProgram).toBe(true)

      const consentRes = await fetch(`${booted.baseUrl}${location}`)
      expect(consentRes.status).toBe(200)
      expect(consentRes.headers.get("cache-control")).toBe("no-store")
      expect(consentRes.headers.get("referrer-policy")).toBe("no-referrer")
      expect(consentRes.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")

      const html = await consentRes.text()
      expect(html).toContain("Claude Code wants access to your Daily")
      expect(html).toContain(codeAsDigitTriples(pending.code))
      expect(html).toContain("Approve on the Mac that is waiting for an agent")
      expect(html).toContain("localhost — a program on this computer")
      expect(html).toContain('<meta http-equiv="refresh" content="2">')

      await denyRequest(booted, parent.token, pending.requestId)
      await openAgentWindowOver(booted, parent.token)
      const {challenge: c2} = makePkcePair()
      const appAuthorizeRes = await fetch(
        buildAuthorizeUrl(booted, {clientId: claudeAppId, redirectUri: "https://claude.ai/api/mcp/auth_callback", codeChallenge: c2, state: "s2"}),
        {redirect: "manual"},
      )
      expect(appAuthorizeRes.status).toBe(303)
      const appLocation = appAuthorizeRes.headers.get("location")

      const appPending = await readPendingRequest(booted, parent.token)
      if (!appPending) throw new Error("expected the Claude app's request to be pending")
      expect(appPending.isLocalProgram).toBe(false)

      const appConsentRes = await fetch(`${booted.baseUrl}${appLocation}`)
      const appHtml = await appConsentRes.text()
      expect(appHtml).toContain("Claude wants access to your Daily")
      expect(appHtml).not.toContain("a program on this computer")
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("every refusal before the return address is trusted is a page — TC-33", () => {
  it("TC-33: no client_id, an unreachable or unsafe document, and an undeclared, missing-with-two-listed or repeated redirect_uri are each a 400 page naming which check failed; a missing redirect_uri with exactly one listed is accepted", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const twoUriClientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      const missingDocClientId = docs.urlFor("/missing.json")
      docs.serve("/missing.json", {status: 404, body: ""})
      const oneUriClientId = registerClientDocument(docs, "/claude-app.json", claudeAppDocument)

      type Case = {clientId?: string; omitClientId?: true; redirectUri?: string; omitRedirect?: true; repeatRedirect?: true; sentence: string}
      const cases: Case[] = [
        {omitClientId: true, sentence: "The agent didn't identify itself in a way Daily can check."},
        {clientId: missingDocClientId, sentence: "Daily couldn't read the agent's identity from its address. Try again in a moment."},
        {clientId: "https://10.0.0.1/c", sentence: "The agent's identity is published at an address Daily won't fetch from."},
        {clientId: twoUriClientId, redirectUri: "http://evil.example/callback", sentence: "The agent asked to return somewhere it didn't declare."},
        {clientId: twoUriClientId, omitRedirect: true, sentence: "The agent asked to return somewhere it didn't declare."},
        {clientId: twoUriClientId, repeatRedirect: true, sentence: "The agent asked to return somewhere it didn't declare."},
      ]

      for (const testCase of cases) {
        await openAgentWindowOver(booted, parent.token)
        const {challenge} = makePkcePair()
        const params = new URLSearchParams()
        if (!testCase.omitClientId) params.set("client_id", testCase.clientId ?? twoUriClientId)
        if (!testCase.omitRedirect) {
          params.set("redirect_uri", testCase.redirectUri ?? "http://localhost:5555/callback")
          if (testCase.repeatRedirect) params.append("redirect_uri", "http://127.0.0.1:5555/callback")
        }
        params.set("response_type", "code")
        params.set("code_challenge", challenge)
        params.set("code_challenge_method", "S256")

        const res = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.authorize}?${params.toString()}`, {redirect: "manual"})
        expect(res.status).toBe(400)
        expect(res.headers.get("location")).toBeNull()
        const html = await res.text()
        expect(html).toContain(testCase.sentence)
      }

      const authorizationsSoFar = booted.store.db.prepare(`SELECT COUNT(*) as n FROM agent_authorizations`).get() as {n: number}
      expect(authorizationsSoFar.n).toBe(0)

      await openAgentWindowOver(booted, parent.token)
      const {challenge} = makePkcePair()
      const acceptedParams = new URLSearchParams({
        client_id: oneUriClientId,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
      })
      const acceptedRes = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.authorize}?${acceptedParams.toString()}`, {redirect: "manual"})
      expect(acceptedRes.status).toBe(303)
      const location = acceptedRes.headers.get("location")
      if (!location) throw new Error("expected a Location header")
      const authorizationId = new URL(location, booted.baseUrl).searchParams.get("id")
      const row = booted.store.db.prepare(`SELECT redirect_uri FROM agent_authorizations WHERE id = ?`).get(authorizationId) as {
        redirect_uri: string
      }
      expect(row.redirect_uri).toBe("https://claude.ai/api/mcp/auth_callback")
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("every refusal after the return address is trusted is a redirect carrying error, state and iss — TC-34", () => {
  it("TC-34: an unsupported response_type, a missing or malformed challenge, a wrong method, an out-of-scope resource and a repeated state are each redirected with their own error", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)

      const subCases: [param: string, value: string | null | "repeat", expectedError: string][] = [
        ["response_type", "token", "unsupported_response_type"],
        ["code_challenge", null, "invalid_request"],
        ["code_challenge_method", "plain", "invalid_request"],
        ["code_challenge_method", null, "invalid_request"],
        ["code_challenge", "x".repeat(42), "invalid_request"],
        ["resource", "https://other.example/mcp", "invalid_target"],
        ["state", "repeat", "invalid_request"],
      ]

      for (const [param, value, expectedError] of subCases) {
        await openAgentWindowOver(booted, parent.token)
        const {challenge} = makePkcePair()
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: "http://localhost:5555/callback",
          response_type: "code",
          code_challenge: challenge,
          code_challenge_method: "S256",
          state: "s1",
        })
        if (value === null) params.delete(param)
        else if (value === "repeat") params.append(param, "s2")
        else params.set(param, value)

        const res = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.authorize}?${params.toString()}`, {redirect: "manual"})
        expect(res.status).toBe(303)
        const location = res.headers.get("location")
        if (!location) throw new Error("expected a redirect Location")
        const redirectUrl = new URL(location)
        expect(redirectUrl.origin + redirectUrl.pathname).toBe("http://localhost:5555/callback")
        expect(redirectUrl.searchParams.get("error")).toBe(expectedError)
        expect(redirectUrl.searchParams.get("iss")).toBe(booted.issuer)
        if (value !== "repeat") expect(redirectUrl.searchParams.get("state")).toBe("s1")
      }

      const authCount = booted.store.db.prepare(`SELECT COUNT(*) as n FROM agent_authorizations`).get() as {n: number}
      expect(authCount.n).toBe(0)
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("the resource parameter at the authorization endpoint — TC-35", () => {
  it("TC-35: repeated resource values that are all this server's are one request, any other resource is invalid_target, and no resource binds to this server's own", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      const resourceUrl = `${booted.issuer}${AGENT_ENDPOINT_PATH}`

      async function authorize(resources?: string[]): Promise<Response> {
        await openAgentWindowOver(booted, parent.token)
        const {challenge} = makePkcePair()
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: "http://localhost:5555/callback",
          response_type: "code",
          code_challenge: challenge,
          code_challenge_method: "S256",
        })
        for (const value of resources ?? []) params.append("resource", value)
        return fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.authorize}?${params.toString()}`, {redirect: "manual"})
      }

      const repeatedSame = await authorize([resourceUrl, resourceUrl])
      expect(repeatedSame.status).toBe(303)
      expect(repeatedSame.headers.get("location")).toMatch(/\/oauth\/consent\?id=/)

      const mixedResource = await authorize([resourceUrl, "https://other.example/mcp"])
      expect(mixedResource.status).toBe(303)
      const mixedLocation = new URL(mixedResource.headers.get("location") ?? "")
      expect(mixedLocation.origin + mixedLocation.pathname).toBe("http://localhost:5555/callback")
      expect(mixedLocation.searchParams.get("error")).toBe("invalid_target")

      const noResource = await authorize()
      expect(noResource.status).toBe(303)
      const noResourceLocation = noResource.headers.get("location")
      const authorizationId = new URL(noResourceLocation ?? "", booted.baseUrl).searchParams.get("id")
      const row = booted.store.db.prepare(`SELECT resource FROM agent_authorizations WHERE id = ?`).get(authorizationId) as {resource: string}
      expect(row.resource).toBe(resourceUrl)
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("a missing or empty response_type is a malformed request, not an unsupported one", () => {
  it("authorize with no response_type, and with response_type= empty, is redirected with invalid_request, carrying state and iss, and starts nothing", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      const {challenge} = makePkcePair()

      for (const responseType of [null, ""]) {
        await openAgentWindowOver(booted, parent.token)
        const authorizeUrl = new URL(
          buildAuthorizeUrl(booted, {clientId, redirectUri: "http://localhost:5555/callback", codeChallenge: challenge, state: "s1"}),
        )
        if (responseType === null) authorizeUrl.searchParams.delete("response_type")
        else authorizeUrl.searchParams.set("response_type", responseType)

        const res = await fetch(authorizeUrl, {redirect: "manual"})

        expect(res.status).toBe(303)
        const redirectUrl = new URL(res.headers.get("location") ?? "")
        expect(redirectUrl.origin + redirectUrl.pathname).toBe("http://localhost:5555/callback")
        expect(redirectUrl.searchParams.get("error")).toBe("invalid_request")
        expect(redirectUrl.searchParams.get("state")).toBe("s1")
        expect(redirectUrl.searchParams.get("iss")).toBe(booted.issuer)
      }

      expect((booted.store.db.prepare(`SELECT COUNT(*) as n FROM agent_authorizations`).get() as {n: number}).n).toBe(0)
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("an empty resource counts as absent at authorize", () => {
  it("authorize carrying resource= is accepted and binds the authorization to this server's own resource", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      await openAgentWindowOver(booted, parent.token)
      const {challenge} = makePkcePair()

      const res = await fetch(
        buildAuthorizeUrl(booted, {clientId, redirectUri: "http://localhost:5555/callback", codeChallenge: challenge, resource: ""}),
        {redirect: "manual"},
      )

      expect(res.status).toBe(303)
      const location = res.headers.get("location") ?? ""
      expect(location).toMatch(/\/oauth\/consent\?id=/)
      const authorizationId = new URL(location, booted.baseUrl).searchParams.get("id")
      const row = booted.store.db.prepare(`SELECT resource FROM agent_authorizations WHERE id = ?`).get(authorizationId) as {resource: string}
      expect(row.resource).toBe(`${booted.issuer}${AGENT_ENDPOINT_PATH}`)
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("an empty state counts as absent at authorize", () => {
  it("a refusal for a request carrying state= returns no state at all, and state=&state=s1 is one state, not a repeat", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      const {challenge} = makePkcePair()

      for (const states of [[""], ["", "s1"]]) {
        await openAgentWindowOver(booted, parent.token)
        const authorizeUrl = new URL(
          buildAuthorizeUrl(booted, {clientId, redirectUri: "http://localhost:5555/callback", codeChallenge: challenge, responseType: "token"}),
        )
        for (const state of states) authorizeUrl.searchParams.append("state", state)

        const res = await fetch(authorizeUrl, {redirect: "manual"})

        expect(res.status).toBe(303)
        const redirectUrl = new URL(res.headers.get("location") ?? "")
        expect(redirectUrl.searchParams.get("error")).toBe("unsupported_response_type")
        expect(redirectUrl.searchParams.getAll("state")).toEqual(states.filter((state) => state !== ""))
      }
    } finally {
      await docs.close()
      await booted.close()
    }
  })

  it("an accepted request carrying state= is stored without a state", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      await openAgentWindowOver(booted, parent.token)
      const {challenge} = makePkcePair()
      const authorizeUrl = new URL(buildAuthorizeUrl(booted, {clientId, redirectUri: "http://localhost:5555/callback", codeChallenge: challenge}))
      authorizeUrl.searchParams.append("state", "")

      const res = await fetch(authorizeUrl, {redirect: "manual"})

      expect(res.status).toBe(303)
      const authorizationId = new URL(res.headers.get("location") ?? "", booted.baseUrl).searchParams.get("id")
      const row = booted.store.db.prepare(`SELECT state FROM agent_authorizations WHERE id = ?`).get(authorizationId) as {state: string | null}
      expect(row.state).toBeNull()
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("the consent page hands the browser back once approved, and only once — TC-36", () => {
  it("TC-36: the first read after approval is a redirect carrying exactly code, state and iss; the second reads Access granted; a stateless request's redirect carries no state", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)

      const {consentPath} = await startAndConsentUrl(booted, parent.token, clientId, "http://localhost:5555/callback", {state: "s1"})
      const pending = await readPendingRequest(booted, parent.token)
      if (!pending) throw new Error("expected a pending request")
      const approveRes = await approveRequest(booted, parent.token, pending.requestId, pending.code, "Pacific/Auckland")
      expect(approveRes.status).toBe(204)

      const firstRead = await fetch(`${booted.baseUrl}${consentPath}`, {redirect: "manual"})
      expect(firstRead.status).toBe(303)
      const firstLocation = new URL(firstRead.headers.get("location") ?? "")
      expect(firstLocation.origin + firstLocation.pathname).toBe("http://localhost:5555/callback")
      expect([...firstLocation.searchParams.keys()].sort()).toEqual(["code", "iss", "state"])
      expect(firstLocation.searchParams.get("state")).toBe("s1")
      expect(firstLocation.searchParams.get("iss")).toBe(booted.issuer)
      expect(firstLocation.searchParams.get("code")).toBeTruthy()

      const secondRead = await fetch(`${booted.baseUrl}${consentPath}`, {redirect: "manual"})
      expect(secondRead.status).toBe(200)
      expect(secondRead.headers.get("location")).toBeNull()
      const html = await secondRead.text()
      expect(html).toContain("Access granted")
      expect(html).toContain("You can close this tab and go back to Claude Code.")

      const stateless = await startAndConsentUrl(booted, parent.token, clientId, "http://localhost:5555/callback")
      const statelessPending = await readPendingRequest(booted, parent.token)
      if (!statelessPending) throw new Error("expected a pending request")
      await approveRequest(booted, parent.token, statelessPending.requestId, statelessPending.code, "Pacific/Auckland")

      const statelessRead = await fetch(`${booted.baseUrl}${stateless.consentPath}`, {redirect: "manual"})
      expect(statelessRead.status).toBe(303)
      const statelessLocation = new URL(statelessRead.headers.get("location") ?? "")
      expect([...statelessLocation.searchParams.keys()].sort()).toEqual(["code", "iss"])
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("declining, running out and being replaced all say access wasn't granted — TC-37", () => {
  it("TC-37: a denial, an expiry and a window replaced by another Mac's request each end at the same page and the same return link, while the still-pending one shows the waiting page", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    const originalTtlMs = SYNC_PROTOCOL_CONFIG.agentRequestTtlMs
    try {
      const parent = await claimParent(booted)
      const child = await enrollChild(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)

      async function startRequest(): Promise<{authorizationId: string; requestId: string; code: string}> {
        const {authorizationId} = await startAndConsentUrl(booted, parent.token, clientId, "http://localhost:5555/callback", {state: "s1"})
        const pending = await readPendingRequest(booted, parent.token)
        if (!pending) throw new Error("expected a pending request")
        return {authorizationId, requestId: pending.requestId, code: pending.code}
      }

      async function assertAccessNotGranted(authorizationId: string): Promise<void> {
        const res = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.consent}?id=${authorizationId}`, {redirect: "manual"})
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain("Access wasn't granted")
        expect(html).toContain("The request was declined on your Mac, or nobody answered in time. Nothing was shared.")
        const hrefUrl = new URL(extractHref(html), booted.baseUrl)
        expect(hrefUrl.origin + hrefUrl.pathname).toBe("http://localhost:5555/callback")
        expect(hrefUrl.searchParams.get("error")).toBe("access_denied")
        expect(hrefUrl.searchParams.get("state")).toBe("s1")
        expect(hrefUrl.searchParams.get("iss")).toBe(booted.issuer)

        const row = booted.store.db.prepare(`SELECT code_hash FROM agent_authorizations WHERE id = ?`).get(authorizationId) as {
          code_hash: string | null
        }
        expect(row.code_hash).toBeNull()
      }

      const denied = await startRequest()
      const waitingRead = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.consent}?id=${denied.authorizationId}`, {redirect: "manual"})
      expect(waitingRead.status).toBe(200)
      const waitingHtml = await waitingRead.text()
      expect(waitingHtml).toContain('<meta http-equiv="refresh" content="2">')
      await denyRequest(booted, parent.token, denied.requestId)
      ;(SYNC_PROTOCOL_CONFIG as {agentRequestTtlMs: number}).agentRequestTtlMs = 50
      const expired = await startRequest()
      await new Promise((resolve) => setTimeout(resolve, 80))
      ;(SYNC_PROTOCOL_CONFIG as {agentRequestTtlMs: number}).agentRequestTtlMs = originalTtlMs

      await assertAccessNotGranted(denied.authorizationId)
      await assertAccessNotGranted(expired.authorizationId)

      const replaced = await startRequest()
      await openAgentWindowOver(booted, child.token)
      await assertAccessNotGranted(replaced.authorizationId)
    } finally {
      ;(SYNC_PROTOCOL_CONFIG as {agentRequestTtlMs: number}).agentRequestTtlMs = originalTtlMs
      await docs.close()
      await booted.close()
    }
  })
})

describe("revoking before the browser returns leaves nothing to hand back — TC-38", () => {
  it("TC-38: revoking the freshly approved agent before the browser reads the consent page again answers Access wasn't granted, with no code issued", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)

      const {authorizationId, consentPath} = await startAndConsentUrl(booted, parent.token, clientId, "http://localhost:5555/callback", {state: "s1"})
      const pending = await readPendingRequest(booted, parent.token)
      if (!pending) throw new Error("expected a pending request")
      await approveRequest(booted, parent.token, pending.requestId, pending.code, "Pacific/Auckland")

      const agents = await readAgentsList(booted, parent.token)
      const newAgent = agents.agents.find((agent) => agent.revokedAt === null)
      if (!newAgent) throw new Error("expected a freshly approved agent")
      const revokeRes = await revokeAgentOver(booted, parent.token, newAgent.id)
      expect(revokeRes.status).toBe(200)

      const consentRes = await fetch(`${booted.baseUrl}${consentPath}`, {redirect: "manual"})
      expect(consentRes.status).toBe(200)
      const html = await consentRes.text()
      expect(html).toContain("Access wasn't granted")

      const row = booted.store.db.prepare(`SELECT code_hash FROM agent_authorizations WHERE id = ?`).get(authorizationId) as {
        code_hash: string | null
      }
      expect(row.code_hash).toBeNull()
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("an unknown consent id has expired — TC-39", () => {
  it("TC-39: /oauth/consent?id=nope is 404 This page has expired", async () => {
    const booted = await bootAgentServer()
    try {
      const res = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.consent}?id=nope`)
      expect(res.status).toBe(404)
      const html = await res.text()
      expect(html).toContain("This page has expired")
      expect(html).toContain("Start over in your agent.")
    } finally {
      await booted.close()
    }
  })
})

describe("a client_name carrying HTML is escaped on the page — TC-40", () => {
  it("TC-40: the consent page escapes a hostile client_name while the pending request keeps it unescaped", async () => {
    const booted = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parent = await claimParent(booted)
      await openAgentWindowOver(booted, parent.token)

      const maliciousName = "<script>alert(1)</script>"
      const clientId = registerClientDocument(docs, "/evil.json", (id) => claudeCodeDocument(id, {client_name: maliciousName}))

      const {challenge} = makePkcePair()
      const authorizeRes = await fetch(
        buildAuthorizeUrl(booted, {clientId, redirectUri: "http://localhost:5555/callback", codeChallenge: challenge}),
        {redirect: "manual"},
      )
      const authorizationId = new URL(authorizeRes.headers.get("location") ?? "", booted.baseUrl).searchParams.get("id")

      const consentRes = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.consent}?id=${authorizationId}`)
      const html = await consentRes.text()
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
      expect(html).not.toContain("<script")

      const pending = await readPendingRequest(booted, parent.token)
      expect(pending?.agentName).toBe(maliciousName)
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("the loopback allowance follows the server, not the client — TC-41", () => {
  it("TC-41: a public server refuses a loopback client_id without fetching it, and a loopback server fetches the same document and proceeds", async () => {
    const nonLoopback = await bootAgentServer({publicUrl: "https://daily.example.com"})
    const loopback = await bootAgentServer()
    const docs = await startClientDocumentServer()
    try {
      const parentNonLoopback = await claimParent(nonLoopback)
      await openAgentWindowOver(nonLoopback, parentNonLoopback.token)
      const parentLoopback = await claimParent(loopback)
      await openAgentWindowOver(loopback, parentLoopback.token)

      const clientId = registerClientDocument(docs, "/client.json", codexDocument)

      const {challenge: c1} = makePkcePair()
      const refusedRes = await fetch(buildAuthorizeUrl(nonLoopback, {clientId, redirectUri: "http://127.0.0.1/callback", codeChallenge: c1}), {
        redirect: "manual",
      })
      expect(refusedRes.status).toBe(400)
      const refusedHtml = await refusedRes.text()
      expect(refusedHtml).toContain("The agent didn't identify itself in a way Daily can check.")
      expect(docs.requestCount("/client.json")).toBe(0)

      const {challenge: c2} = makePkcePair()
      const acceptedRes = await fetch(buildAuthorizeUrl(loopback, {clientId, redirectUri: "http://127.0.0.1/callback", codeChallenge: c2}), {
        redirect: "manual",
      })
      expect(acceptedRes.status).toBe(303)
      expect(acceptedRes.headers.get("location")).toMatch(/\/oauth\/consent\?id=/)
      expect(docs.requestCount("/client.json")).toBe(1)
    } finally {
      await docs.close()
      await nonLoopback.close()
      await loopback.close()
    }
  })
})

describe("migration v006 adds the OAuth tables — TC-42", () => {
  it("TC-42: a store at v005 gains agent_authorizations and agent_tokens on first open, leaves every pre-existing row untouched, and applies nothing on a second open", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "daily-agent-oauth-migration-"))

    try {
      const db = createBetterSqliteDriver(join(dataDir, "server.sqlite"))
      runMigrations(db, [v001, v002, v003, v004, v005])
      const before: ServerStore = {db, dataDir, close: () => db.close()}
      loadIdentity(before)

      const device = createDevice(before, "Seed Mac")
      openAgentWindow(before, device.device.id)
      const request = createAgentRequest(before, {agentName: "Claude Code", returnsTo: "localhost", isLocalProgram: true})
      approveAgentRequest(before, request.id, request.code, device.device.id)

      const devicesBefore = before.db.prepare(`SELECT * FROM devices ORDER BY id`).all()
      const agentsBefore = before.db.prepare(`SELECT * FROM agents ORDER BY id`).all()
      const requestsBefore = before.db.prepare(`SELECT * FROM agent_requests ORDER BY id`).all()

      before.close()

      const migrated = openServerStore(dataDir)

      const appliedVersions = migrated.db.prepare(`SELECT version FROM _migrations ORDER BY version`).all() as {version: number}[]
      expect(appliedVersions.map((row) => row.version)).toEqual([1, 2, 3, 4, 5, 6])

      const authorizationColumns = (migrated.db.prepare(`PRAGMA table_info(agent_authorizations)`).all() as {name: string}[])
        .map((c) => c.name)
        .sort()
      expect(authorizationColumns).toEqual(
        [
          "id",
          "request_id",
          "client_id",
          "redirect_uri",
          "state",
          "code_challenge",
          "resource",
          "created_at",
          "code_hash",
          "code_expires_at",
          "code_used_at",
        ].sort(),
      )

      const tokenColumns = (migrated.db.prepare(`PRAGMA table_info(agent_tokens)`).all() as {name: string}[]).map((c) => c.name).sort()
      expect(tokenColumns).toEqual(
        [
          "id",
          "agent_id",
          "client_id",
          "resource",
          "access_token_hash",
          "access_expires_at",
          "refresh_token_hash",
          "created_at",
          "rotated_at",
        ].sort(),
      )

      const tokenIndexes = (migrated.db.prepare(`PRAGMA index_list(agent_tokens)`).all() as {name: string}[]).map((idx) => idx.name)
      expect(tokenIndexes).toContain("idx_agent_tokens_agent")

      expect(migrated.db.prepare(`SELECT * FROM devices ORDER BY id`).all()).toEqual(devicesBefore)
      expect(migrated.db.prepare(`SELECT * FROM agents ORDER BY id`).all()).toEqual(agentsBefore)
      expect(migrated.db.prepare(`SELECT * FROM agent_requests ORDER BY id`).all()).toEqual(requestsBefore)

      migrated.close()

      const reopened = openServerStore(dataDir)
      const appliedAfterSecondOpen = reopened.db.prepare(`SELECT version FROM _migrations ORDER BY version`).all() as {version: number}[]
      expect(appliedAfterSecondOpen.map((row) => row.version)).toEqual([1, 2, 3, 4, 5, 6])
      reopened.close()
    } finally {
      rmSync(dataDir, {recursive: true, force: true})
    }
  })
})
