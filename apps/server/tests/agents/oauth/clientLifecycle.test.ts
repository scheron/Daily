import {createHash} from "node:crypto"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {expect, it, onTestFinished, vi} from "vitest"

import {AGENT_ENDPOINT_PATH, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {exchangeAuthorizationCode} from "../../../src/agents/oauth/AgentTokenStore"
import {hashToken} from "../../../src/devices/tokens"
import {claimServer} from "../../../src/http/routes/claim"
import {ensureClaimCode, loadIdentity} from "../../../src/identity/ServerIdentityStore"
import {createBetterSqliteDriver} from "../../../src/store/betterSqliteDriver"
import {runMigrations} from "../../../src/store/migrate"
import {migrations} from "../../../src/store/migrations"
import {
  authorizeApproveAndReturn,
  bootAgentServer,
  buildAuthorizeUrl,
  claimParent,
  claudeCodeDocument,
  connectAgent,
  exchangeCode,
  makePkcePair,
  openAgentWindowOver,
  readAgentsList,
  readPendingRequest,
  refreshTokens,
  registerClientDocument,
  revokeAgentOver,
  startClientDocumentServer,
} from "./harness"

import type {RequestLogView} from "@daily/protocol"
import type {ServerStore} from "../../../src/store/instance"
import type {BootedAgentServer, ConnectedAgent} from "./harness"

const ISSUER = "http://127.0.0.1:18080"
const REGISTERED_CALLBACK = "http://127.0.0.1/callback"
const CALLBACK = "http://127.0.0.1:42016/callback"

it("binds a registered client to its issuer, resource and PKCE without creating a grant at registration", async () => {
  const server = await bootAgentServer({publicUrl: ISSUER})
  onTestFinished(() => server.close())
  const parent = await claimParent(server)
  await openAgentWindowOver(server, parent.token)
  const clientId = await registerPublicClient(server)

  expect(await readPendingRequest(server, parent.token)).toBeNull()
  expect((await readAgentsList(server, parent.token)).agents).toEqual([])
  expect(server.store.db.prepare("SELECT id FROM agent_tokens").all()).toEqual([])

  const query = {clientId, redirectUri: CALLBACK, codeChallenge: makePkcePair().challenge}
  server.config.publicUrl = "http://127.0.0.1:18081"
  try {
    const differentIssuer = await fetch(buildAuthorizeUrl(server, query), {redirect: "manual"})
    expect(differentIssuer.status).toBe(400)
    expect(differentIssuer.headers.get("location")).toBeNull()
  } finally {
    server.config.publicUrl = ISSUER
  }

  const plain = await fetch(buildAuthorizeUrl(server, {...query, codeChallengeMethod: "plain"}), {redirect: "manual"})
  expect(plain.status).toBe(303)
  expect(new URL(plain.headers.get("location")!).searchParams.get("error")).toBe("invalid_request")
  const wrongResource = await fetch(buildAuthorizeUrl(server, {...query, resource: `${ISSUER}/other`}), {redirect: "manual"})
  expect(wrongResource.status).toBe(303)
  expect(new URL(wrongResource.headers.get("location")!).searchParams.get("error")).toBe("invalid_target")
  expect(await readPendingRequest(server, parent.token)).toBeNull()

  const authorized = await authorizeApproveAndReturn(server, parent.token, {clientId, redirectUri: CALLBACK})
  const exchange = {clientId, code: authorized.code, verifier: authorized.verifier, redirectUri: CALLBACK}
  const foreignClient = await exchangeCode(server, {...exchange, clientId: "daily_other_client"})
  expect(foreignClient.status).toBe(400)
  expect(await foreignClient.json()).toMatchObject({error: "invalid_grant"})
  const wrongVerifier = await exchangeCode(server, {...exchange, verifier: makePkcePair().verifier})
  expect(wrongVerifier.status).toBe(400)
  expect(await wrongVerifier.json()).toMatchObject({error: "invalid_grant"})
  const wrongTarget = await exchangeCode(server, {...exchange, resource: `${ISSUER}/other`})
  expect(wrongTarget.status).toBe(400)
  expect(await wrongTarget.json()).toMatchObject({error: "invalid_target"})
  expect(server.store.db.prepare("SELECT id FROM agent_tokens").all()).toEqual([])
  expect((await exchangeCode(server, exchange)).status).toBe(200)
})

it("rotates tokens after a restart with the window closed and requires approval for a new connection after revocation", async () => {
  const dataDir = makeDataDir()
  const first = await bootAgentServer({dataDir, publicUrl: ISSUER}, {deleteDataDirOnClose: false})
  let parentToken: string
  let connected: ConnectedAgent
  let agentId: string
  try {
    parentToken = (await claimParent(first)).token
    await openAgentWindowOver(first, parentToken)
    const clientId = await registerPublicClient(first)
    connected = await connectAgent(first, parentToken, {clientId, redirectUri: CALLBACK})
    const view = await readAgentsList(first, parentToken)
    expect(view.agentWindow).toBeNull()
    expect(view.agents).toHaveLength(1)
    agentId = view.agents[0].id
  } finally {
    await first.close()
  }

  const server = await bootAgentServer({dataDir, publicUrl: ISSUER}, {deleteDataDirOnClose: false})
  onTestFinished(() => server.close())
  const tools = await listTools(server, connected.accessToken)
  expect(tools.status).toBe(200)
  const {result} = (await tools.json()) as {result: {tools: {name: string}[]}}
  expect(result.tools.map((tool) => tool.name)).toContain("list_tasks")

  const closed = await fetch(
    buildAuthorizeUrl(server, {clientId: connected.clientId, redirectUri: CALLBACK, codeChallenge: makePkcePair().challenge}),
    {
      redirect: "manual",
    },
  )
  expect(closed.status).toBe(403)
  expect((await readAgentsList(server, parentToken)).agentWindow).toBeNull()

  const refreshed = await refreshTokens(server, {clientId: connected.clientId, refreshToken: connected.refreshToken})
  expect(refreshed.status).toBe(200)
  const pair = (await refreshed.json()) as {access_token: string; refresh_token: string}
  expect(pair.access_token).not.toBe(connected.accessToken)
  expect(pair.refresh_token).not.toBe(connected.refreshToken)
  expect((await revokeAgentOver(server, parentToken, agentId)).status).toBe(200)
  expect((await listTools(server, pair.access_token)).status).toBe(401)
  const refused = await refreshTokens(server, {clientId: connected.clientId, refreshToken: pair.refresh_token})
  expect(refused.status).toBe(400)
  expect(await refused.json()).toMatchObject({error: "invalid_grant"})

  await openAgentWindowOver(server, parentToken)
  const newClientId = await registerPublicClient(server)
  expect(newClientId).not.toBe(connected.clientId)
  expect(await readPendingRequest(server, parentToken)).toBeNull()
  const reconnected = await connectAgent(server, parentToken, {clientId: newClientId, redirectUri: CALLBACK})
  expect((await listTools(server, reconnected.accessToken)).status).toBe(200)
})

it("preserves live CIMD credentials and accepts new metadata documents after upgrading a v006 database", async () => {
  const dataDir = makeDataDir()
  const docs = await startClientDocumentServer()
  onTestFinished(() => docs.close())
  const clientId = registerClientDocument(docs, "/existing-client.json", claudeCodeDocument)
  const {parentToken, accessToken, refreshToken} = seedLegacyGrant(dataDir, clientId)

  const server = await bootAgentServer({dataDir, publicUrl: ISSUER}, {deleteDataDirOnClose: false})
  onTestFinished(() => server.close())
  expect(server.store.db.prepare("SELECT max(version) AS version FROM _migrations").get()).toEqual({version: 7})
  expect((await listTools(server, accessToken)).status).toBe(200)
  const refresh = await refreshTokens(server, {clientId, refreshToken})
  expect(refresh.status).toBe(200)
  expect(await refresh.json()).toMatchObject({access_token: expect.any(String), refresh_token: expect.any(String)})

  await openAgentWindowOver(server, parentToken)
  const connected = await connectAgent(server, parentToken, {clientId, redirectUri: CALLBACK})
  expect(docs.requestCount("/existing-client.json")).toBe(1)
  expect((await listTools(server, connected.accessToken)).status).toBe(200)
})

it("logs canonical OAuth routes and statuses without metadata, query values, token bodies or credentials", async () => {
  const server = await bootAgentServer({publicUrl: ISSUER})
  onTestFinished(() => server.close())
  const parent = await claimParent(server)
  const clientName = "Synthetic registration metadata 2f5798"
  const state = "Synthetic state 642adf"
  await openAgentWindowOver(server, parent.token)
  const clientId = await registerPublicClient(server, clientName)
  const connected = await connectAgent(server, parent.token, {clientId, redirectUri: CALLBACK, state})
  expect((await listTools(server, connected.accessToken)).status).toBe(200)

  await vi.waitFor(async () => {
    const log = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.logs}`, {headers: {authorization: `Bearer ${parent.token}`}})
    expect(log.status).toBe(200)
    const text = await log.text()
    const {data} = JSON.parse(text) as {data: RequestLogView}
    expect(data.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({method: "POST", path: "/oauth/register", status: 201}),
        expect.objectContaining({method: "GET", path: "/oauth/authorize", status: 303}),
        expect.objectContaining({method: "GET", path: "/oauth/consent", status: 303}),
        expect.objectContaining({method: "POST", path: "/oauth/token", status: 200}),
        expect.objectContaining({method: "POST", path: "/mcp", status: 200}),
      ]),
    )
    for (const secret of [
      clientName,
      clientId,
      CALLBACK,
      REGISTERED_CALLBACK,
      state,
      connected.code,
      connected.verifier,
      connected.challenge,
      connected.accessToken,
      connected.refreshToken,
      parent.token,
    ]) {
      expect(text).not.toContain(secret)
      expect(text).not.toContain(encodeURIComponent(secret))
    }
  })
})

function makeDataDir(): string {
  const dataDir = mkdtempSync(join(tmpdir(), "daily-client-lifecycle-"))
  onTestFinished(() => rmSync(dataDir, {recursive: true, force: true}))
  return dataDir
}

async function registerPublicClient(server: BootedAgentServer, clientName = "Example Agent"): Promise<string> {
  const registration = await fetch(`${server.baseUrl}/oauth/register`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({client_name: clientName, redirect_uris: [REGISTERED_CALLBACK]}),
  })
  expect(registration.status).toBe(201)
  return ((await registration.json()) as {client_id: string}).client_id
}

function listTools(server: BootedAgentServer, token: string): Promise<Response> {
  const protocolVersion = "2026-07-28"
  return fetch(`${server.baseUrl}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "mcp-protocol-version": protocolVersion,
      "mcp-method": "tools/list",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {_meta: {"io.modelcontextprotocol/protocolVersion": protocolVersion, "io.modelcontextprotocol/clientCapabilities": {}}},
    }),
  })
}

function seedLegacyGrant(dataDir: string, clientId: string): {parentToken: string; accessToken: string; refreshToken: string} {
  const db = createBetterSqliteDriver(join(dataDir, "server.sqlite"))
  try {
    runMigrations(
      db,
      migrations.filter((migration) => migration.version <= 6),
    )
    expect(db.prepare("SELECT max(version) AS version FROM _migrations").get()).toEqual({version: 6})
    const store: ServerStore = {db, dataDir, close: () => db.close()}
    loadIdentity(store)
    const claimCode = ensureClaimCode(store)
    if (!claimCode) throw new Error("Expected a claim code for the empty database")
    const parent = claimServer(store, claimCode, "Seed Mac")
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    const resource = `${ISSUER}${AGENT_ENDPOINT_PATH}`
    const code = "synthetic-existing-authorization-code"
    const verifier = "legacy-verifier-".repeat(4)
    const challenge = createHash("sha256").update(verifier).digest("base64url")

    db.prepare("INSERT INTO agents (id, device_id, name, created_at) VALUES ('legacy-agent', ?, 'CIMD Client', ?)").run(parent.device.id, now)
    db.prepare(
      `INSERT INTO agent_requests (id, device_id, code, agent_name, returns_to, is_local_program, state, created_at, expires_at, resolved_at, issued_agent_id)
                VALUES ('legacy-request', ?, '123456', 'CIMD Client', '127.0.0.1', 1, 'approved', ?, ?, ?, 'legacy-agent')`,
    ).run(parent.device.id, now, expiresAt, now)
    db.prepare(
      `INSERT INTO agent_authorizations (id, request_id, client_id, redirect_uri, code_challenge, resource, created_at, code_hash, code_expires_at)
                VALUES ('legacy-authorization', 'legacy-request', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(clientId, CALLBACK, challenge, resource, now, hashToken(code), expiresAt)

    const exchange = exchangeAuthorizationCode(store, {code, clientId, redirectUri: CALLBACK, codeVerifier: verifier}, resource)
    if (!exchange.ok) throw new Error(exchange.description)
    return {parentToken: parent.token, accessToken: exchange.grant.accessToken, refreshToken: exchange.grant.refreshToken}
  } finally {
    db.close()
  }
}
