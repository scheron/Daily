import dns from "node:dns"
import http from "node:http"
import https from "node:https"
import net from "node:net"

import {isLoopbackHostname} from "../isLoopbackHostname"

import type {ClientRequest, IncomingMessage} from "node:http"
import type {LookupFunction} from "node:net"

/** A client as its metadata document describes it: `clientName` is the document's `client_name`, trimmed — the agent's name (D8); `redirectUris` is the list as written. */
export type ClientMetadata = {clientId: string; clientName: string; redirectUris: string[]}
export type ClientMetadataRefusal = "invalid_client_id" | "unsafe_address" | "unreachable" | "invalid_document"
export type ClientMetadataResult = {ok: true; client: ClientMetadata} | {ok: false; refusal: ClientMetadataRefusal}

const SPECIAL_USE_ADDRESSES = specialUseAddresses()
const cachedClients = new Map<string, {client: ClientMetadata; expiresAt: number; hasLoopbackAllowance: boolean}>()

/**
 * Fetches and checks the Client ID Metadata Document at `clientId`. This is the server's only outbound
 * fetch to an address a stranger chooses, so it lives in its own file although the authorization
 * endpoint is its one caller: the SSRF guard sits in one reviewable place, and each refusal is pinned
 * at this surface rather than through a browser flow.
 *
 * Never rejects. `invalid_client_id` is answered before any network access; `unsafe_address` when the
 * address connected to — an IP literal, or whatever the hostname resolves to — is special-use;
 * `unreachable` for a network error, a status other than `200` (a redirect is never followed), a body
 * over 5 KiB or the time bound; `invalid_document` when the body is not a document this client may
 * register with. An `ok` answer is cached for the response's `max-age`, at most an hour.
 *
 * @param options.allowLoopback - lets an `http:` loopback address and loopback addresses through, and nothing else; true only when this server's own agent address is loopback
 * @param options.timeoutMs - bounds the whole fetch, connect and body together; 5000 ms unless a test lowers it
 */
export async function fetchClientMetadata(clientId: string, options: {allowLoopback: boolean; timeoutMs?: number}): Promise<ClientMetadataResult> {
  const {allowLoopback, timeoutMs = 5000} = options

  const url = parseClientIdUrl(clientId, allowLoopback)
  if (!url) return {ok: false, refusal: "invalid_client_id"}

  const literal = url.hostname.replace(/^\[(.*)\]$/, "$1")
  if (net.isIP(literal) !== 0 && isUnsafeAddress(literal, allowLoopback)) return {ok: false, refusal: "unsafe_address"}

  const cached = readCachedClient(clientId, allowLoopback)
  if (cached) return {ok: true, client: cached}

  const fetched = await fetchDocument(url, allowLoopback, timeoutMs)
  if (!fetched.ok) return fetched

  const client = readClientDocument(fetched.body, clientId)
  if (!client) return {ok: false, refusal: "invalid_document"}

  const lifetimeSeconds = cacheLifetimeSeconds(fetched.cacheControl)
  if (lifetimeSeconds > 0) {
    cachedClients.set(clientId, {client, expiresAt: Date.now() + lifetimeSeconds * 1000, hasLoopbackAllowance: allowLoopback})
  }

  return {ok: true, client}
}

/**
 * Accepts only a redirect URI the client's document lists, and only an `https:` one or an `http:` one
 * on a loopback host — a listed private-use scheme or a listed non-loopback `http:` URI is still
 * refused. The port is ignored only against a listed `http:` loopback URI (OAuth 2.1 §8.4.2), where a
 * native client listens on an ephemeral port; `localhost` and `127.0.0.1` never stand in for each other.
 */
export function isRegisteredRedirectUri(client: ClientMetadata, redirectUri: string): boolean {
  const uri = parseRedirectUri(redirectUri)
  if (!uri) return false
  if (client.redirectUris.includes(redirectUri)) return true

  const portless = withoutPort(uri)
  return client.redirectUris.some((listed) => {
    const listedUri = parseRedirectUri(listed)
    return listedUri !== null && listedUri.protocol === "http:" && withoutPort(listedUri) === portless
  })
}

function parseClientIdUrl(clientId: string, allowLoopback: boolean): URL | null {
  let url: URL
  try {
    url = new URL(clientId)
  } catch {
    return null
  }

  const isSchemeAllowed = url.protocol === "https:" || (url.protocol === "http:" && allowLoopback && isLoopbackHostname(url.hostname))
  if (!isSchemeAllowed) return null
  if (url.username || url.password || clientId.includes("#")) return null
  if (url.pathname === "/" || hasDotSegment(clientId)) return null

  return url
}

function readCachedClient(clientId: string, allowLoopback: boolean): ClientMetadata | null {
  const entry = cachedClients.get(clientId)
  if (!entry) return null
  if (Date.now() >= entry.expiresAt) {
    cachedClients.delete(clientId)
    return null
  }

  return entry.hasLoopbackAllowance && !allowLoopback ? null : entry.client
}

type FetchedDocument = {ok: true; body: string; cacheControl: string | undefined} | {ok: false; refusal: ClientMetadataRefusal}

function fetchDocument(url: URL, allowLoopback: boolean, timeoutMs: number): Promise<FetchedDocument> {
  const maxBodyBytes = 5120

  return new Promise((resolve) => {
    let isSettled = false
    let isAddressRefused = false
    let request: ClientRequest | undefined

    const settle = (outcome: FetchedDocument): void => {
      if (isSettled) return
      isSettled = true
      clearTimeout(timer)
      request?.destroy()
      resolve(outcome)
    }
    const timer = setTimeout(() => settle({ok: false, refusal: "unreachable"}), timeoutMs)

    const lookup: LookupFunction = (hostname, lookupOptions, callback) => {
      try {
        dns.lookup(hostname, {...lookupOptions, all: true}, (error, addresses) => {
          if (error) return callback(error, [])
          if (addresses.length === 0) return callback(new Error(`${hostname} resolved to no address`), [])
          if (addresses.some(({address}) => isUnsafeAddress(address, allowLoopback))) {
            isAddressRefused = true
            return callback(new Error(`${hostname} resolves to a special-use address`), [])
          }
          if (lookupOptions.all) return callback(null, addresses)
          callback(null, addresses[0].address, addresses[0].family)
        })
      } catch (error) {
        callback(error as NodeJS.ErrnoException, [])
      }
    }

    const onResponse = (response: IncomingMessage): void => {
      if (response.statusCode !== 200) return settle({ok: false, refusal: "unreachable"})

      const chunks: Buffer[] = []
      let size = 0
      response.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > maxBodyBytes) return settle({ok: false, refusal: "unreachable"})
        chunks.push(chunk)
      })
      response.on("error", () => settle({ok: false, refusal: "unreachable"}))
      response.on("end", () => settle({ok: true, body: Buffer.concat(chunks).toString("utf-8"), cacheControl: response.headers["cache-control"]}))
      response.on("close", () => settle({ok: false, refusal: "unreachable"}))
    }

    try {
      const requestOptions = {method: "GET", headers: {accept: "application/json"}, agent: false, lookup}
      request = url.protocol === "https:" ? https.request(url, requestOptions, onResponse) : http.request(url, requestOptions, onResponse)
      request.on("error", () => settle({ok: false, refusal: isAddressRefused ? "unsafe_address" : "unreachable"}))
      request.end()
    } catch {
      settle({ok: false, refusal: "unreachable"})
    }
  })
}

function readClientDocument(body: string, clientId: string): ClientMetadata | null {
  let document: unknown
  try {
    document = JSON.parse(body)
  } catch {
    return null
  }
  if (typeof document !== "object" || document === null || Array.isArray(document)) return null

  const fields = document as Record<string, unknown>
  const clientName = typeof fields.client_name === "string" ? fields.client_name.trim() : ""
  const redirectUris = fields.redirect_uris

  if (fields.client_id !== clientId) return null
  if (clientName.length < 1 || clientName.length > 100) return null
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every((uri): uri is string => typeof uri === "string")) return null
  if (fields.token_endpoint_auth_method !== undefined && fields.token_endpoint_auth_method !== "none") return null
  if (fields.client_secret !== undefined) return null
  if (!isAbsentOrListing(fields.grant_types, "authorization_code") || !isAbsentOrListing(fields.response_types, "code")) return null

  return {clientId, clientName, redirectUris}
}

function isAbsentOrListing(field: unknown, value: string): boolean {
  return field === undefined || (Array.isArray(field) && field.includes(value))
}

function cacheLifetimeSeconds(cacheControl: string | undefined): number {
  const directives = (cacheControl ?? "")
    .toLowerCase()
    .split(",")
    .map((directive) => directive.split("=").map((part) => part.trim()))
  if (directives.some(([name]) => name === "no-store" || name === "no-cache")) return 0

  const maxAge = directives.find(([name, value]) => name === "max-age" && /^\d+$/.test(value ?? ""))
  return maxAge ? Math.min(Number(maxAge[1]), 3600) : 0
}

function parseRedirectUri(redirectUri: string): URL | null {
  let url: URL
  try {
    url = new URL(redirectUri)
  } catch {
    return null
  }
  if (redirectUri.includes("#")) return null

  return url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHostname(url.hostname)) ? url : null
}

function withoutPort(url: URL): string {
  const copy = new URL(url.href)
  copy.port = ""
  return copy.href
}

function hasDotSegment(clientId: string): boolean {
  const beforeQuery = clientId
    .replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "")
    .replace(/[\t\n\r]/g, "")
    .split(/[?#]/)[0]

  return beforeQuery.split(/[/\\]/).some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment))
}

function isUnsafeAddress(address: string, allowLoopback: boolean): boolean {
  const bare = address.split("%")[0]
  const family = net.isIP(bare)
  if (family === 0) return true
  if (allowLoopback && (family === 4 ? bare.startsWith("127.") : bare === "::1")) return false

  const type = family === 4 ? "ipv4" : "ipv6"
  return SPECIAL_USE_ADDRESSES[type].check(bare, type)
}

function specialUseAddresses(): {ipv4: net.BlockList; ipv6: net.BlockList} {
  const ipv4Ranges: [string, number][] = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ]
  const ipv6Ranges: [string, number][] = [
    ["::", 128],
    ["::1", 128],
    ["::", 96],
    ["::ffff:0:0", 96],
    ["64:ff9b::", 96],
    ["64:ff9b:1::", 48],
    ["100::", 64],
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ]

  const ipv4 = new net.BlockList()
  const ipv6 = new net.BlockList()
  for (const [network, prefix] of ipv4Ranges) ipv4.addSubnet(network, prefix, "ipv4")
  for (const [network, prefix] of ipv6Ranges) ipv6.addSubnet(network, prefix, "ipv6")

  return {ipv4, ipv6}
}
