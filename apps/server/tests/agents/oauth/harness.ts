import {createHash, randomBytes} from "node:crypto"
import {mkdtempSync, rmSync} from "node:fs"
import http from "node:http"
import {tmpdir} from "node:os"
import {join} from "node:path"

import {AGENT_ENDPOINT_PATH, SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import {resolveServerConfig} from "../../../src/config/resolveServerConfig"
import {createConsoleEnrollment} from "../../../src/enrollment/EnrollmentStore"
import {createHttpServer} from "../../../src/http/createHttpServer"
import {ensureClaimCode} from "../../../src/identity/ServerIdentityStore"
import {openServerStore} from "../../../src/store/instance"

import type {AgentListResponse, AgentWindow, ClaimResponse, ConsoleEnrollResponse, PendingAgentRequestResponse} from "@daily/protocol"
import type {AddressInfo} from "node:net"
import type {ServerConfig, ServerConfigOptions} from "../../../src/config/resolveServerConfig"
import type {ServerStore} from "../../../src/store/instance"

/** The public OAuth paths as literals rather than imported from `AGENT_OAUTH_PATHS`, so a change to a production path fails the suite instead of moving with it. */
export const AGENT_OAUTH_TEST_PATHS = {
  protectedResource: "/.well-known/oauth-protected-resource",
  authorizationServer: "/.well-known/oauth-authorization-server",
  authorize: "/oauth/authorize",
  consent: "/oauth/consent",
  consentStatus: "/oauth/consent/status",
  token: "/oauth/token",
} as const

export type BootedAgentServer = {
  baseUrl: string
  issuer: string
  store: ServerStore
  config: ServerConfig
  dataDir: string
  close(): Promise<void>
}

/**
 * Boots a real server on a real loopback listener, over a real store in a temp directory — the
 * `bootServer` shape of `protocol.test.ts`, copied since that one is private. Unless
 * `overrides.publicUrl` is given or `autoPublicUrl` is turned off, `config.publicUrl` is set,
 * after the real port is known, to this same listener's own address, because a server with no
 * followable `publicUrl` refuses every agent endpoint before a case gets to decide anything. A
 * case about that refusal — no public address at all — passes `{autoPublicUrl: false}` instead.
 *
 * `overrides.dataDir` reopens a directory a previous boot left behind — pass
 * `{deleteDataDirOnClose: false}` on that previous boot so its `close()` stops the listener
 * without deleting the store a reopen still needs.
 */
export async function bootAgentServer(
  overrides: ServerConfigOptions = {},
  {autoPublicUrl = true, deleteDataDirOnClose = true}: {autoPublicUrl?: boolean; deleteDataDirOnClose?: boolean} = {},
): Promise<BootedAgentServer> {
  const dataDir = overrides.dataDir ?? mkdtempSync(join(tmpdir(), "daily-agent-oauth-"))
  const config = resolveServerConfig({host: "127.0.0.1", port: 0, ...overrides, dataDir})
  const store = openServerStore(config.dataDir)
  const server = createHttpServer(store, config)

  await new Promise<void>((resolve) => server.listen(config.port, config.host, resolve))
  const {port} = server.address() as AddressInfo
  const baseUrl = `http://${config.host}:${port}`

  if (autoPublicUrl && overrides.publicUrl === undefined) config.publicUrl = baseUrl

  return {
    baseUrl,
    issuer: (config.publicUrl ?? baseUrl).replace(/\/+$/, ""),
    store,
    config,
    dataDir,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          store.close()
          if (deleteDataDirOnClose) rmSync(dataDir, {recursive: true, force: true})
          resolve()
        })
      }),
  }
}

export type DocumentResponseSpec = {
  status?: number
  headers?: Record<string, string>
  body?: string
  delayMs?: number
  hang?: true
}

export type ClientDocumentServer = {
  baseUrl: string
  urlFor(path: string): string
  requestCount(path?: string): number
  serve(path: string, spec: DocumentResponseSpec): void
  close(): Promise<void>
}

/**
 * The harness's second loopback listener — stands in for a client's own host, serving whatever
 * a case registers at a path: a body, a status, headers, or a hang that accepts the connection
 * and never answers it. Every fetch it receives is counted, so a case can prove the server never
 * asked at all.
 */
export async function startClientDocumentServer(): Promise<ClientDocumentServer> {
  const counts = new Map<string, number>()
  const specs = new Map<string, DocumentResponseSpec>()

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://placeholder").pathname
    counts.set(pathname, (counts.get(pathname) ?? 0) + 1)

    const spec = specs.get(pathname)
    if (!spec) {
      res.writeHead(404)
      res.end()
      return
    }
    if (spec.hang) return

    const write = (): void => {
      res.writeHead(spec.status ?? 200, {"content-type": "application/json", ...spec.headers})
      res.end(spec.body ?? "")
    }
    if (spec.delayMs) setTimeout(write, spec.delayMs)
    else write()
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const {port} = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${port}`

  return {
    baseUrl,
    urlFor: (path) => `${baseUrl}${path}`,
    requestCount: (path) => (path === undefined ? [...counts.values()].reduce((sum, n) => sum + n, 0) : (counts.get(path) ?? 0)),
    serve: (path, spec) => specs.set(path, spec),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

/** A loopback port nobody is listening on: bound, read, and released, for the small race window before a case dials it. */
export async function unusedLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = http.createServer()
    probe.on("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const {port} = probe.address() as AddressInfo
      probe.close((err) => (err ? reject(err) : resolve(port)))
    })
  })
}

export type PkcePair = {verifier: string; challenge: string}

/** A PKCE pair the token endpoint's `S256` check accepts: a 64-character verifier and its challenge. */
export function makePkcePair(): PkcePair {
  const verifier = randomBytes(48).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")

  return {verifier, challenge}
}

/** Claude Code's published document, `https://claude.ai/oauth/claude-code-client-metadata`, verbatim but for `client_id`. */
export function claudeCodeDocument(clientId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    client_id: clientId,
    client_name: "Claude Code",
    client_uri: "https://claude.ai",
    redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    ...overrides,
  }
}

/** The Claude app's published document, `https://claude.ai/oauth/mcp-oauth-client-metadata`, verbatim but for `client_id`. */
export function claudeAppDocument(clientId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    client_id: clientId,
    client_name: "Claude",
    client_uri: "https://claude.ai",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:jwt-bearer"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    ...overrides,
  }
}

/** Codex's published document, `https://chatgpt.com/oauth/codex/client.json`, verbatim but for `client_id`. */
export function codexDocument(clientId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    client_id: clientId,
    client_uri: "https://chatgpt.com/codex",
    application_type: "native",
    redirect_uris: ["http://127.0.0.1/callback", "http://localhost/callback"],
    token_endpoint_auth_method: "none",
    token_endpoint_auth_methods_supported: ["none"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: "Codex",
    logo_uri: "https://persistent.oaistatic.com/sonic/misc/openai-logo.png",
    ...overrides,
  }
}

/** Registers `shape`'s document, cached for five minutes as Claude's own documents are, at `path` on `docs`, and answers the `client_id` it was given. */
export function registerClientDocument(
  docs: ClientDocumentServer,
  path: string,
  shape: (clientId: string) => Record<string, unknown>,
  headers: Record<string, string> = {"cache-control": "public, max-age=300"},
): string {
  const clientId = docs.urlFor(path)
  docs.serve(path, {body: JSON.stringify(shape(clientId)), headers})

  return clientId
}

/** Claims the harness server's one device as its Parent, the way a first Mac does. */
export async function claimParent(server: BootedAgentServer, deviceName = "MacBook Air"): Promise<{token: string; deviceId: string}> {
  const code = ensureClaimCode(server.store)
  if (!code) throw new Error("expected an unclaimed harness server to hold a claim code")

  const res = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {method: "POST", body: JSON.stringify({code, deviceName})})
  if (res.status !== 200) throw new Error(`expected the harness's claim to succeed, got ${res.status}`)

  const json = (await res.json()) as {ok: true; data: ClaimResponse}
  return {token: json.data.token, deviceId: json.data.device.id}
}

/** Enrolls a second, Child device on the harness server through the console enrollment door, bypassing the approval dance the app would otherwise need. */
export async function enrollChild(server: BootedAgentServer, deviceName = "Mac mini"): Promise<{token: string; deviceId: string}> {
  const issued = createConsoleEnrollment(server.store)
  const res = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
    method: "POST",
    body: JSON.stringify({token: issued.token, deviceName}),
  })
  if (res.status !== 200) throw new Error(`expected the harness's console enrollment to succeed, got ${res.status}`)

  const json = (await res.json()) as {ok: true; data: ConsoleEnrollResponse}
  return {token: json.data.token, deviceId: json.data.device.id}
}

/** Opens the Agent window on behalf of `token`'s Mac, over the real `/v1/agents/window/open` route. */
export async function openAgentWindowOver(server: BootedAgentServer, token: string): Promise<AgentWindow> {
  const res = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${token}`}})
  if (res.status !== 200) throw new Error(`expected the harness to open an Agent window, got ${res.status}`)

  return ((await res.json()) as {ok: true; data: AgentWindow}).data
}

/** The request waiting on `token`'s own Agent window, or `null`, over the real `/v1/agents/pending` route. */
export async function readPendingRequest(server: BootedAgentServer, token: string): Promise<PendingAgentRequestResponse["request"]> {
  const res = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.agentPending}`, {headers: {authorization: `Bearer ${token}`}})
  return ((await res.json()) as {ok: true; data: PendingAgentRequestResponse}).data.request
}

/** Approves the waiting request on behalf of `token`'s Mac, over the real `/v1/agents/approve` route. */
export function approveRequest(
  server: BootedAgentServer,
  token: string,
  requestId: string,
  code: string,
  timeZone = "Pacific/Auckland",
): Promise<Response> {
  return fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.agentApprove}`, {
    method: "POST",
    headers: {authorization: `Bearer ${token}`, "content-type": "application/json"},
    body: JSON.stringify({requestId, code, timeZone}),
  })
}

/** Denies the waiting request on behalf of `token`'s Mac, over the real `/v1/agents/deny` route. */
export function denyRequest(server: BootedAgentServer, token: string, requestId: string): Promise<Response> {
  return fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.agentDeny}`, {
    method: "POST",
    headers: {authorization: `Bearer ${token}`, "content-type": "application/json"},
    body: JSON.stringify({requestId}),
  })
}

/** Reads the agent list `token`'s Mac is entitled to, over the real `/v1/agents` route. */
export async function readAgentsList(server: BootedAgentServer, token: string): Promise<AgentListResponse> {
  const res = await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.agents}`, {headers: {authorization: `Bearer ${token}`}})
  return ((await res.json()) as {ok: true; data: AgentListResponse}).data
}

/** Revokes an agent on behalf of `token`'s Mac, over the real `/v1/agents/revoke` route. */
export function revokeAgentOver(server: BootedAgentServer, token: string, agentId: string): Promise<Response> {
  return fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.agentRevoke}`, {
    method: "POST",
    headers: {authorization: `Bearer ${token}`, "content-type": "application/json"},
    body: JSON.stringify({agentId}),
  })
}

/** Revokes a device on behalf of the Parent's `token`, over the real `/v1/devices/revoke` route. */
export function revokeDeviceOver(server: BootedAgentServer, token: string, deviceId: string): Promise<Response> {
  return fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.deviceRevoke}`, {
    method: "POST",
    headers: {authorization: `Bearer ${token}`, "content-type": "application/json"},
    body: JSON.stringify({deviceId}),
  })
}

export type AuthorizeQuery = {
  clientId: string
  redirectUri: string
  state?: string | null
  codeChallenge: string
  codeChallengeMethod?: string
  resource?: string | string[]
  responseType?: string
}

/** Builds `GET /oauth/authorize`'s URL from a well-formed query — the happy-path shape every case not about a malformed parameter starts from. */
export function buildAuthorizeUrl(server: BootedAgentServer, query: AuthorizeQuery): string {
  const params = new URLSearchParams()
  params.set("client_id", query.clientId)
  params.set("redirect_uri", query.redirectUri)
  params.set("response_type", query.responseType ?? "code")
  params.set("code_challenge", query.codeChallenge)
  params.set("code_challenge_method", query.codeChallengeMethod ?? "S256")
  if (query.state) params.set("state", query.state)
  if (query.resource !== undefined) {
    for (const value of Array.isArray(query.resource) ? query.resource : [query.resource]) params.append("resource", value)
  }

  return `${server.baseUrl}${AGENT_OAUTH_TEST_PATHS.authorize}?${params.toString()}`
}

export type AuthorizedRequest = {
  authorizationId: string
  requestId: string
  code: string
  verifier: string
  challenge: string
  clientId: string
  redirectUri: string
  state: string | null
}

/**
 * Drives one request from `GET /oauth/authorize` through the Mac's approval to an issued code,
 * stopping short of the token exchange so a case can inspect or corrupt the exchange itself. The
 * Agent window must already be open on `parentToken`'s Mac; this starts exactly one request on it.
 */
export async function authorizeApproveAndReturn(
  server: BootedAgentServer,
  parentToken: string,
  options: {clientId: string; redirectUri: string; state?: string | null; resource?: string | string[]; timeZone?: string},
): Promise<AuthorizedRequest> {
  const {verifier, challenge} = makePkcePair()

  const authorizeRes = await fetch(
    buildAuthorizeUrl(server, {
      clientId: options.clientId,
      redirectUri: options.redirectUri,
      state: options.state,
      codeChallenge: challenge,
      resource: options.resource,
    }),
    {redirect: "manual"},
  )
  if (authorizeRes.status !== 303) throw new Error(`expected the harness's authorize call to reach the consent page, got ${authorizeRes.status}`)

  const consentLocation = authorizeRes.headers.get("location")
  if (!consentLocation) throw new Error("expected /oauth/authorize to carry a Location header")
  const authorizationId = new URL(consentLocation, server.baseUrl).searchParams.get("id")
  if (!authorizationId) throw new Error("expected the consent redirect to carry an authorization id")

  const pending = await readPendingRequest(server, parentToken)
  if (!pending) throw new Error("expected an agent request to be waiting for the harness to approve")

  const approveRes = await approveRequest(server, parentToken, pending.requestId, pending.code, options.timeZone ?? "Pacific/Auckland")
  if (approveRes.status !== 204) throw new Error(`expected the harness's approval to succeed, got ${approveRes.status}`)

  const consentRes = await fetch(`${server.baseUrl}${AGENT_OAUTH_TEST_PATHS.consent}?id=${authorizationId}`, {redirect: "manual"})
  if (consentRes.status !== 303) throw new Error(`expected the consent page to return the browser once approved, got ${consentRes.status}`)

  const returnLocation = consentRes.headers.get("location")
  if (!returnLocation) throw new Error("expected the granted consent page to carry a Location header")
  const returnUrl = new URL(returnLocation)
  const code = returnUrl.searchParams.get("code")
  if (!code) throw new Error("expected the consent redirect to carry a code")

  return {
    authorizationId,
    requestId: pending.requestId,
    code,
    verifier,
    challenge,
    clientId: options.clientId,
    redirectUri: options.redirectUri,
    state: returnUrl.searchParams.get("state"),
  }
}

/** `POST /oauth/token`, form-urlencoded, with `params`' entries — repeated when an array is given, exactly as `resource` may be. */
export function postTokenForm(server: BootedAgentServer, params: Record<string, string | string[] | undefined>): Promise<Response> {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    for (const entry of Array.isArray(value) ? value : [value]) body.append(key, entry)
  }

  return fetch(`${server.baseUrl}${AGENT_OAUTH_TEST_PATHS.token}`, {
    method: "POST",
    headers: {"content-type": "application/x-www-form-urlencoded"},
    body: body.toString(),
  })
}

/** Exchanges an authorization code for a token pair, the whole grant this endpoint needs. */
export function exchangeCode(
  server: BootedAgentServer,
  params: {code: string; clientId: string; verifier: string; redirectUri?: string; resource?: string | string[]},
): Promise<Response> {
  return postTokenForm(server, {
    grant_type: "authorization_code",
    code: params.code,
    client_id: params.clientId,
    code_verifier: params.verifier,
    redirect_uri: params.redirectUri,
    resource: params.resource ?? `${server.issuer}${AGENT_ENDPOINT_PATH}`,
  })
}

export function refreshTokens(
  server: BootedAgentServer,
  params: {refreshToken: string; clientId?: string; resource?: string | string[]},
): Promise<Response> {
  return postTokenForm(server, {
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
    resource: params.resource ?? `${server.issuer}${AGENT_ENDPOINT_PATH}`,
  })
}

export type ConnectedAgent = AuthorizedRequest & {accessToken: string; refreshToken: string; expiresIn: number}

/**
 * Drives one agent all the way to a live token pair: authorize, approve on the Mac, follow the
 * browser back, exchange the code. The Agent window must already be open on `parentToken`'s Mac.
 */
export async function connectAgent(
  server: BootedAgentServer,
  parentToken: string,
  options: {clientId: string; redirectUri: string; state?: string | null; resource?: string | string[]; timeZone?: string},
): Promise<ConnectedAgent> {
  const authorized = await authorizeApproveAndReturn(server, parentToken, options)

  const tokenRes = await exchangeCode(server, {
    code: authorized.code,
    clientId: authorized.clientId,
    verifier: authorized.verifier,
    redirectUri: authorized.redirectUri,
    resource: options.resource,
  })
  if (tokenRes.status !== 200) throw new Error(`expected the harness's token exchange to succeed, got ${tokenRes.status}`)

  const tokenJson = (await tokenRes.json()) as {access_token: string; refresh_token: string; expires_in: number}

  return {...authorized, accessToken: tokenJson.access_token, refreshToken: tokenJson.refresh_token, expiresIn: tokenJson.expires_in}
}
