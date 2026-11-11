import {lookup as dnsLookup} from "node:dns/promises"
import {isIP} from "node:net"
import {Agent, buildConnector, fetch as undiciFetch} from "undici"

import {SYNC_PROTOCOL_PATHS, SYNC_PROTOCOL_VERSION, SyncServerError, SyncServerErrorCode} from "@daily/protocol"

import {isBlockedAddress} from "../../../utils/web/isBlockedAddress"

import type {ServerInfo} from "@daily/protocol"
import type {Socket} from "node:net"
import type {TLSSocket} from "node:tls"
import type {Dispatcher} from "undici"

export type ServerTransportMode = "plain" | "trusted-tls" | "self-signed"

export type ServerTransport = {
  mode: ServerTransportMode
  /** Present only for `self-signed`. */
  fingerprint: string | null
  addressIsPublic: boolean
}

export type ServerProbe = {info: ServerInfo; transport: ServerTransport}

const PROBE_TIMEOUT_MS = 5_000

const SELF_SIGNED_ERROR_CODES = new Set(["DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"])

/**
 * Resolves the address's hostname and reports whether it lands in a private range — loopback,
 * RFC1918, CGNAT, IPv6 ULA or link-local. An IP literal skips the lookup.
 */
export async function isPrivateServerAddress(baseUrl: string): Promise<boolean> {
  const hostname = stripIpv6Brackets(new URL(baseUrl).hostname)
  if (isIP(hostname)) return isBlockedAddress(hostname)

  const resolved = await dnsLookup(hostname)
  return isBlockedAddress(resolved.address)
}

/**
 * Connects to `baseUrl` and reports what kind of transport answered: `plain` HTTP, TLS that
 * validates against the system trust store, or a self-signed certificate, whose SHA-256
 * fingerprint is read directly off the socket. Connects at most twice: once with certificate
 * verification on, and only on a certificate-chain failure, once more with verification off,
 * purely to read the fingerprint.
 */
export async function probeTransport(baseUrl: string): Promise<ServerProbe> {
  const addressIsPublic = !(await isPrivateServerAddress(baseUrl))
  const isHttps = new URL(baseUrl).protocol === "https:"

  try {
    const info = await fetchServerInfo(baseUrl)
    return {info, transport: {mode: isHttps ? "trusted-tls" : "plain", fingerprint: null, addressIsPublic}}
  } catch (err) {
    if (err instanceof SyncServerError) throw err

    const code = chainErrorCode(err)
    if (!code) throw new SyncServerError(SyncServerErrorCode.UNREACHABLE, err instanceof Error ? err.message : "Could not reach the server")

    const capture = capturingConnector()
    const info = await fetchServerInfo(baseUrl, new Agent({connect: capture.connector}))
    const fingerprint = capture.read()
    if (!fingerprint) throw new SyncServerError(SyncServerErrorCode.UNREACHABLE, "Could not read the server's certificate")

    return {info, transport: {mode: "self-signed", fingerprint, addressIsPublic}}
  }
}

/** Covers TCP plus the TLS handshake of a new connection; a request already on a pooled connection is unaffected. */
const CONNECT_TIMEOUT_MS = 5_000

const CONNECT_FAILED = Symbol("connectFailed")

/** True when an error in the chain was raised while establishing the connection, so no request bytes were written. */
export function isConnectFailure(err: unknown): boolean {
  for (let current = err, depth = 0; current instanceof Error && depth < 5; current = (current as {cause?: unknown}).cause, depth++) {
    if ((current as {[CONNECT_FAILED]?: true})[CONNECT_FAILED]) return true
  }

  return false
}

export function markConnectFailure<T extends Error>(err: T): T {
  ;(err as {[CONNECT_FAILED]?: true})[CONNECT_FAILED] = true
  return err
}

/** Marks every error the connector raises (TCP, TLS handshake, timeout, DNS) as a connection-establishment failure. */
function markingConnector(inner: buildConnector.connector): buildConnector.connector {
  return (options, callback) => {
    inner(options, (err, socket) => {
      if (err) callback(markConnectFailure(err), null)
      else callback(null, socket)
    })
  }
}

const dispatchers = new Map<string, Dispatcher>()

/**
 * The `undici` dispatcher for a pinned fingerprint (or none), shared by every client using it so the
 * pool (and the long poll's kept-alive connection) survives across clients. Connections give up after
 * `CONNECT_TIMEOUT_MS`. With a `fingerprint`, every connection's certificate is compared to it and
 * the socket is destroyed before any request is written on a mismatch.
 */
export function createServerDispatcher(fingerprint: string | null): Dispatcher {
  const key = fingerprint ?? ""
  let dispatcher = dispatchers.get(key)
  if (dispatcher) return dispatcher

  if (!fingerprint) {
    dispatcher = new Agent({connect: markingConnector(buildConnector({timeout: CONNECT_TIMEOUT_MS}))})
  } else {
    const inner = markingConnector(buildConnector({rejectUnauthorized: false, timeout: CONNECT_TIMEOUT_MS}))

    const connector: buildConnector.connector = (options, callback) => {
      inner(options, (err, socket) => {
        if (err) {
          callback(err, null)
          return
        }

        const actual = peerFingerprint(socket)
        if (actual !== fingerprint) {
          socket.destroy()
          callback(new SyncServerError(SyncServerErrorCode.FINGERPRINT_MISMATCH, `Certificate fingerprint mismatch for ${options.hostname}`), null)
          return
        }

        callback(null, socket)
      })
    }

    dispatcher = new Agent({connect: connector})
  }

  dispatchers.set(key, dispatcher)
  return dispatcher
}

function capturingConnector(): {connector: buildConnector.connector; read(): string | null} {
  let captured: string | null = null
  const inner = buildConnector({rejectUnauthorized: false})

  const connector: buildConnector.connector = (options, callback) => {
    inner(options, (err, socket) => {
      if (err) {
        callback(err, null)
        return
      }

      captured = peerFingerprint(socket)
      callback(null, socket)
    })
  }

  return {connector, read: () => captured}
}

function peerFingerprint(socket: Socket | TLSSocket): string | null {
  if (typeof (socket as TLSSocket).getPeerCertificate !== "function") return null

  const certificate = (socket as TLSSocket).getPeerCertificate()
  return certificate?.fingerprint256 ?? null
}

async function fetchServerInfo(baseUrl: string, dispatcher?: Dispatcher): Promise<ServerInfo> {
  const response = await undiciFetch(`${baseUrl}${SYNC_PROTOCOL_PATHS.server}`, {
    method: "GET",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    dispatcher,
  })

  return parseServerInfo(response)
}

async function parseServerInfo(response: Awaited<ReturnType<typeof undiciFetch>>): Promise<ServerInfo> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new SyncServerError(SyncServerErrorCode.NOT_A_DAILY_SERVER, "This address did not answer with a Daily server's response")
  }

  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) {
    throw new SyncServerError(SyncServerErrorCode.NOT_A_DAILY_SERVER, "This address did not answer with a Daily server's response")
  }

  const data = payload.data
  if (typeof data.serverId !== "string" || typeof data.protocol !== "number") {
    throw new SyncServerError(SyncServerErrorCode.NOT_A_DAILY_SERVER, "This address did not answer with a Daily server's response")
  }

  if (data.protocol !== SYNC_PROTOCOL_VERSION) {
    throw new SyncServerError(
      SyncServerErrorCode.PROTOCOL_VERSION_UNSUPPORTED,
      `The server speaks protocol ${data.protocol}, this app supports ${SYNC_PROTOCOL_VERSION}`,
    )
  }

  return data as unknown as ServerInfo
}

function chainErrorCode(err: unknown): string | undefined {
  const cause = err instanceof Error ? (err as {cause?: unknown}).cause : undefined
  const code = codeOf(cause) ?? codeOf(err)
  return code && SELF_SIGNED_ERROR_CODES.has(code) ? code : undefined
}

function codeOf(value: unknown): string | undefined {
  if (value && typeof value === "object" && "code" in value && typeof (value as {code: unknown}).code === "string") {
    return (value as {code: string}).code
  }

  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname
}
