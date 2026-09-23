import {createHash} from "node:crypto"

import {ProtocolError, ProtocolErrorCode} from "@daily/protocol"

import {findAgentById, findPendingAgentRequest, readAgentRequest} from "../../agents/AgentStore"
import {AGENT_OAUTH_PATHS, agentUrls, isAgentResource} from "../../agents/agentUrls"
import {isLoopbackHostname} from "../../agents/isLoopbackHostname"
import {createAgentAuthorization, issueAuthorizationCode, readAgentAuthorization} from "../../agents/oauth/AgentAuthorizationStore"
import {fetchClientMetadata, isRegisteredRedirectUri} from "../../agents/oauth/clientMetadata"
import {readAgentWindow} from "../../identity/ServerIdentityStore"
import {RESPONSE_SENT} from "../respond"

import type {ServerResponse} from "node:http"
import type {AgentRequestRecord} from "../../agents/AgentStore"
import type {AgentUrls} from "../../agents/agentUrls"
import type {AgentAuthorizationRecord} from "../../agents/oauth/AgentAuthorizationStore"
import type {ClientMetadata} from "../../agents/oauth/clientMetadata"
import type {Route, RouteContext} from "../createHttpServer"

type BrowserPage =
  | {kind: "not-accepted"}
  | {kind: "no-window" | "request-waiting"; host: string; retryUrl: string}
  | {kind: "invalid-request"; host: string; reason: "client" | "unsafe" | "unreachable" | "return"}
  | {kind: "unknown"; host: string}
  | {kind: "waiting"; host: string; agentName: string; code: string}
  | {kind: "granted"; host: string; agentName: string}
  | {kind: "not-granted"; host: string; agentName: string; returnUrl: string}

/**
 * `GET /oauth/authorize` — starts an agent request only inside an open Agent window, fetching the
 * client's metadata document only then. Every refusal before the return address is checked is a
 * page on this server; every refusal after it is a `303` to that address carrying `error`,
 * `state` and `iss`. An accepted request is sent to the consent page.
 */
export const oauthAuthorizeRoute: Route = {
  method: "GET",
  path: AGENT_OAUTH_PATHS.authorize,
  handler: getAuthorize,
}

/**
 * `GET /oauth/consent` — the page the browser waits on while the Mac decides. It polls
 * `/oauth/consent/status` rather than reloading itself, loads itself again once the Mac has
 * answered — handing the browser back with a code the first time it sees the approval — and says
 * access wasn't granted on a denial, an expiry or a revoked agent.
 */
export const oauthConsentRoute: Route = {
  method: "GET",
  path: AGENT_OAUTH_PATHS.consent,
  handler: getConsent,
}

/**
 * `GET /oauth/consent/status` — the one fact the waiting consent page asks for once a second:
 * whether the Mac has still to answer. It carries nothing about the agent or the request, so the
 * page can wait without reloading.
 */
export const oauthConsentStatusRoute: Route = {
  method: "GET",
  path: AGENT_OAUTH_PATHS.consentStatus,
  handler: getConsentStatus,
}

async function getAuthorize(ctx: RouteContext): Promise<typeof RESPONSE_SENT> {
  const urls = agentUrls(ctx.config)
  if (!urls) return respondPage(ctx.res, 404, renderPage({kind: "not-accepted"}))

  const requestUrl = new URL(ctx.req.url ?? "/", "http://placeholder")
  const query = new URLSearchParams([...requestUrl.searchParams].filter(([, value]) => value !== ""))
  const issuerUrl = new URL(urls.issuer)
  const host = issuerUrl.host
  const retryUrl = new URL(urls.authorizationEndpoint)
  retryUrl.search = requestUrl.search

  const window = readAgentWindow(ctx.store)
  if (!window) return respondPage(ctx.res, 403, renderPage({kind: "no-window", host, retryUrl: retryUrl.href}))
  if (findPendingAgentRequest(ctx.store, window.deviceId)) {
    return respondPage(ctx.res, 409, renderPage({kind: "request-waiting", host, retryUrl: retryUrl.href}))
  }

  const clientIds = query.getAll("client_id")
  if (clientIds.length !== 1) return respondPage(ctx.res, 400, renderPage({kind: "invalid-request", host, reason: "client"}))

  const metadata = await fetchClientMetadata(clientIds[0], {allowLoopback: isLoopbackHostname(issuerUrl.hostname)})
  if (!metadata.ok) {
    const reason = ({invalid_client_id: "client", invalid_document: "client", unsafe_address: "unsafe", unreachable: "unreachable"} as const)[
      metadata.refusal
    ]
    return respondPage(ctx.res, 400, renderPage({kind: "invalid-request", host, reason}))
  }

  const redirectUri = resolveRedirectUri(query, metadata.client)
  if (!redirectUri) return respondPage(ctx.res, 400, renderPage({kind: "invalid-request", host, reason: "return"}))

  const states = query.getAll("state")
  const state = states.length === 1 ? states[0] : null

  const refusal = findAuthorizeRefusal(query, urls)
  if (refusal) {
    return respondRedirect(ctx.res, buildReturnUrl(redirectUri, {error: refusal.error, error_description: refusal.description}, state, urls.issuer))
  }

  const returnsTo = new URL(redirectUri).hostname
  let authorization: AgentAuthorizationRecord
  try {
    authorization = createAgentAuthorization(ctx.store, {
      agentName: metadata.client.clientName,
      returnsTo,
      isLocalProgram: isLoopbackHostname(returnsTo),
      clientId: metadata.client.clientId,
      redirectUri,
      state,
      codeChallenge: query.get("code_challenge") ?? "",
      resource: urls.resource,
    })
  } catch (error) {
    if (error instanceof ProtocolError && error.code === ProtocolErrorCode.AGENT_WINDOW_CLOSED) {
      return respondPage(ctx.res, 403, renderPage({kind: "no-window", host, retryUrl: retryUrl.href}))
    }
    if (error instanceof ProtocolError && error.code === ProtocolErrorCode.AGENT_REQUEST_IN_PROGRESS) {
      return respondPage(ctx.res, 409, renderPage({kind: "request-waiting", host, retryUrl: retryUrl.href}))
    }
    throw error
  }

  return respondRedirect(ctx.res, `${AGENT_OAUTH_PATHS.consent}?id=${authorization.id}`)
}

async function getConsent(ctx: RouteContext): Promise<typeof RESPONSE_SENT> {
  const urls = agentUrls(ctx.config)
  if (!urls) return respondPage(ctx.res, 404, renderPage({kind: "not-accepted"}))

  const host = new URL(urls.issuer).host
  const authorizationId = new URL(ctx.req.url ?? "/", "http://placeholder").searchParams.get("id")
  const authorization = authorizationId ? readAgentAuthorization(ctx.store, authorizationId) : null
  const request = authorization ? readAgentRequest(ctx.store, authorization.requestId) : null
  if (!authorization || !request) return respondPage(ctx.res, 404, renderPage({kind: "unknown", host}))

  if (isAwaitingMac(request)) {
    return respondPage(ctx.res, 200, renderPage({kind: "waiting", host, agentName: request.agentName, code: request.code}))
  }

  const agent = request.state === "approved" && request.issuedAgentId ? findAgentById(ctx.store, request.issuedAgentId) : null
  if (agent && !agent.revokedAt) {
    const code = issueAuthorizationCode(ctx.store, authorization.id)
    if (code) return respondRedirect(ctx.res, buildReturnUrl(authorization.redirectUri, {code}, authorization.state, urls.issuer))

    return respondPage(ctx.res, 200, renderPage({kind: "granted", host, agentName: request.agentName}))
  }

  const returnUrl = buildReturnUrl(authorization.redirectUri, {error: "access_denied"}, authorization.state, urls.issuer)

  return respondPage(ctx.res, 200, renderPage({kind: "not-granted", host, agentName: request.agentName, returnUrl}))
}

async function getConsentStatus(ctx: RouteContext): Promise<{pending: boolean}> {
  const authorizationId = new URL(ctx.req.url ?? "/", "http://placeholder").searchParams.get("id")
  const authorization = authorizationId ? readAgentAuthorization(ctx.store, authorizationId) : null
  const request = authorization ? readAgentRequest(ctx.store, authorization.requestId) : null

  ctx.res.setHeader("cache-control", "no-store")

  return {pending: isAwaitingMac(request)}
}

function isAwaitingMac(request: AgentRequestRecord | null): boolean {
  return request !== null && request.state === "pending" && Date.parse(request.expiresAt) > Date.now()
}

function resolveRedirectUri(query: URLSearchParams, client: ClientMetadata): string | null {
  const given = query.getAll("redirect_uri")
  if (given.length > 1) return null

  const candidate = given[0] ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null)

  return candidate && isRegisteredRedirectUri(client, candidate) ? candidate : null
}

function findAuthorizeRefusal(query: URLSearchParams, urls: AgentUrls): {error: string; description: string} | null {
  const repeated = ["response_type", "code_challenge", "code_challenge_method", "state", "scope"].find((name) => query.getAll(name).length > 1)
  if (repeated) return {error: "invalid_request", description: `${repeated} must not be repeated`}

  const responseType = query.get("response_type")
  if (!responseType) return {error: "invalid_request", description: "response_type is required"}
  if (responseType !== "code") return {error: "unsupported_response_type", description: "Only response_type=code is supported"}

  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(query.get("code_challenge") ?? "")) {
    return {error: "invalid_request", description: "code_challenge must be 43 to 128 characters of A-Z, a-z, 0-9, -, ., _ and ~"}
  }

  if (query.get("code_challenge_method") !== "S256") return {error: "invalid_request", description: "code_challenge_method must be S256"}

  if (query.getAll("resource").some((value) => !isAgentResource(urls, value))) {
    return {error: "invalid_target", description: `This server serves only ${urls.resource}`}
  }

  return null
}

function buildReturnUrl(redirectUri: string, params: Record<string, string>, state: string | null, issuer: string): string {
  const url = new URL(redirectUri)
  for (const [name, value] of Object.entries(params)) url.searchParams.append(name, value)
  if (state !== null) url.searchParams.append("state", state)
  url.searchParams.append("iss", issuer)

  return url.href
}

function respondRedirect(res: ServerResponse, location: string): typeof RESPONSE_SENT {
  res.writeHead(303, {location, "cache-control": "no-store", "referrer-policy": "no-referrer"})
  res.end()

  return RESPONSE_SENT
}

function respondPage(res: ServerResponse, status: number, html: string): typeof RESPONSE_SENT {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "content-security-policy": PAGE_CSP,
  })
  res.end(html)

  return RESPONSE_SENT
}

const DAILY_MARK = `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"><path fill="#4DCFA3" d="M240.001 0C273.138 0 300.001 26.8629 300.001 60V240.001C300.001 273.138 273.138 300.001 240.001 300.001H60C26.8629 300.001 0 273.138 0 240.001V60C2.96392e-05 26.8629 26.8629 0 60 0H240.001ZM76.0566 64.7891V95.9717H89.7764V205.616H76.0566V236.685H142.048C149.908 236.684 157.449 235.664 164.668 233.623C171.887 231.582 178.615 228.691 184.851 224.949C191.086 221.207 196.755 216.709 201.857 211.456C206.96 206.203 211.325 200.382 214.953 193.995C218.581 187.608 221.378 180.747 223.344 173.415C225.309 166.083 226.292 158.448 226.292 150.511C226.292 142.574 225.309 134.938 223.344 127.605C221.379 120.273 218.582 113.433 214.953 107.083C211.325 100.733 206.959 94.9692 201.857 89.791C196.756 84.6129 191.087 80.1717 184.851 76.4678C178.614 72.7639 171.887 69.8915 164.668 67.8506C157.449 65.8096 149.908 64.7891 142.047 64.7891H76.0566ZM141.82 95.9766C147.943 95.9763 153.725 97.3748 159.168 100.172C164.61 102.969 169.335 106.824 173.341 111.737C177.347 116.65 180.522 122.432 182.865 129.084C185.209 135.736 186.38 142.88 186.38 150.515C186.38 158.225 185.209 165.425 182.865 172.115C180.522 178.805 177.347 184.625 173.341 189.576C169.335 194.527 164.61 198.439 159.168 201.312C153.725 204.184 147.942 205.62 141.819 205.62H127.42V95.9756L141.82 95.9766Z"/></svg>`

const CONSENT_POLL_SCRIPT = `const id=new URLSearchParams(location.search).get("id")??"";setInterval(async()=>{try{const r=await fetch("${AGENT_OAUTH_PATHS.consentStatus}?id="+encodeURIComponent(id),{cache:"no-store"});const body=await r.json();if(!body.ok||!body.data.pending)location.reload()}catch{}},1000)`

const PAGE_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  `script-src 'sha256-${createHash("sha256").update(CONSENT_POLL_SCRIPT).digest("base64")}'`,
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join("; ")

function renderPage(page: BrowserPage): string {
  const crossIcon = `<div class="bigic r"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></div>`
  const checkIcon = `<div class="bigic g"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M18.71 7.21a1 1 0 0 0-1.42 0l-7.45 7.46l-3.13-3.14A1 1 0 1 0 5.29 13l3.84 3.84a1 1 0 0 0 1.42 0l8.16-8.16a1 1 0 0 0 0-1.47"/></svg></div>`
  const button = (href: string, label: string): string => `<a class="bbtn" href="${escapeHtml(href)}">${label}</a>`

  let content: string
  switch (page.kind) {
    case "waiting":
      content = `<h2>${escapeHtml(page.agentName)} wants access to your Daily</h2>
<div class="bcode">${escapeHtml(`${page.code.slice(0, 3)} ${page.code.slice(3)}`)}</div>
<div class="bwait"><span class="spin"></span>Approve on the Mac that is waiting for an agent</div>
<div class="fine">It will read and change your tasks, projects, milestones and tags.</div>`
      break
    case "no-window":
      content = `${crossIcon}
<h2>Daily isn't expecting an agent</h2>
<p>On one of your Macs, open Settings → Sync, press Connect an agent, then try again here.</p>
${button(page.retryUrl, "Try again")}`
      break
    case "request-waiting":
      content = `${crossIcon}
<h2>Another agent is already waiting</h2>
<p>A request is already waiting for approval on your Mac. If it isn't yours, decline it there, then try again here.</p>
${button(page.retryUrl, "Try again")}`
      break
    case "not-granted":
      content = `${crossIcon}
<h2>Access wasn't granted</h2>
<p>The request was declined on your Mac, or nobody answered in time. Nothing was shared.</p>
${button(page.returnUrl, `Start over in ${escapeHtml(page.agentName)}`)}`
      break
    case "granted":
      content = `${checkIcon}
<h2>Access granted</h2>
<p>You can close this tab and go back to ${escapeHtml(page.agentName)}.</p>`
      break
    case "invalid-request": {
      const sentence = {
        client: "The agent didn't identify itself in a way Daily can check.",
        unsafe: "The agent's identity is published at an address Daily won't fetch from.",
        unreachable: "Daily couldn't read the agent's identity from its address. Try again in a moment.",
        return: "The agent asked to return somewhere it didn't declare.",
      }[page.reason]
      content = `${crossIcon}
<h2>This request can't be used</h2>
<p>${sentence}</p>`
      break
    }
    case "not-accepted":
      content = `${crossIcon}
<h2>This Daily server doesn't accept agents</h2>
<p>Agents need the server to have a domain with a trusted certificate.</p>`
      break
    case "unknown":
      content = `${crossIcon}
<h2>This page has expired</h2>
<p>Start over in your agent.</p>`
      break
  }

  const css = `*{box-sizing:border-box;margin:0;padding:0}
body{font:14px/1.2 system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;background:oklch(98% 0.004 265);color:oklch(25% 0.02 265)}
.bpage{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:56px 34px 30px;text-align:center}
.logo{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600}
.logo svg{width:22px;height:22px;display:block}
.srv{font-size:12px;color:oklch(50% 0.02 265);margin-top:6px}
h2{font-size:21px;font-weight:600;margin-top:34px;line-height:1.3}
p{font-size:13.5px;color:oklch(42% 0.02 265);margin-top:10px;line-height:1.55;max-width:340px}
.bcode{font:600 38px/1 ui-monospace,"SF Mono",Menlo,monospace;letter-spacing:.28em;padding-left:.28em;margin-top:26px;color:oklch(22% 0.02 265)}
.bwait{display:flex;align-items:center;gap:8px;margin-top:22px;font-size:13px;color:oklch(45% 0.02 265)}
.spin{width:14px;height:14px;border-radius:50%;border:2px solid oklch(85% 0.01 265);border-top-color:oklch(60% 0.15 190);animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.fine{font-size:12px;color:oklch(52% 0.02 265);margin-top:22px;line-height:1.5;max-width:330px;border-top:1px solid oklch(90% 0.006 265);padding-top:16px}
.bigic{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-top:34px}
.bigic.g{background:oklch(93% 0.06 150);color:oklch(50% 0.14 150)}
.bigic.r{background:oklch(94% 0.04 25);color:oklch(55% 0.17 25)}
.bigic svg{width:26px;height:26px}
.bigic+h2{margin-top:16px}
.bbtn{margin-top:24px;height:34px;padding:0 16px;border-radius:999px;border:1px solid oklch(85% 0.01 265);display:inline-flex;align-items:center;font-size:13px;color:oklch(30% 0.02 265);text-decoration:none}`

  const waits = page.kind === "waiting"

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(DAILY_MARK)}">
<title>Daily</title>
<style>${css}</style>${waits ? `\n<noscript><meta http-equiv="refresh" content="2"></noscript>` : ""}
</head>
<body>
<main class="bpage">
<div class="logo">${DAILY_MARK}Daily</div>${page.kind === "not-accepted" ? "" : `\n<div class="srv">${escapeHtml(page.host)}</div>`}
${content}
</main>${waits ? `\n<script>${CONSENT_POLL_SCRIPT}</script>` : ""}
</body>
</html>
`
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}

  return value.replace(/[&<>"']/g, (char) => entities[char] ?? char)
}
