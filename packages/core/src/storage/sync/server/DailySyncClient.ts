import {gzipSync} from "node:zlib"
import {fetch as undiciFetch} from "undici"

import {ProtocolError, SYNC_PROTOCOL_CONFIG, SYNC_PROTOCOL_PATHS, SyncServerError, SyncServerErrorCode} from "@daily/protocol"

import {createServerDispatcher, isConnectFailure} from "./serverTransport"

import type {
  AgentListResponse,
  AgentWindow,
  AssetEntry,
  AssetManifestResponse,
  DeviceListResponse,
  EnrollmentStatus,
  EnrollmentWindow,
  EnrollRequestResponse,
  IssuedCredential,
  PendingAgentRequest,
  PendingAgentRequestResponse,
  PendingEnrollment,
  PendingEnrollmentResponse,
  ProtocolErrorCode,
  RequestLogEntry,
  RevisionProbe,
  ServerInfo,
  SnapshotReadResponse,
  SnapshotWriteResponse,
} from "@daily/protocol"
import type {Dispatcher} from "undici"
import type {RequestLogBuffer} from "../../../utils/requestLog/RequestLogBuffer"

export type DailySyncClientOptions = {
  baseUrl: string
  token: string | null
  fingerprint: string | null
  fetch?: typeof globalThis.fetch
  /** Receives one entry per finished request. Every client of one app shares a single buffer. */
  requestLog?: RequestLogBuffer
}

type Method = "GET" | "POST" | "PUT"
type RequestOptions = {
  timeout: number
  token?: string | null
  json?: unknown
  gzipJson?: unknown
  rawBody?: Buffer
  /** Cancels the request from this side, in addition to (not instead of) `timeout`. */
  signal?: AbortSignal
}

const TIMEOUTS = {
  probe: 30_000,
  snapshot: 30_000,
  asset: 120_000,
  /** Outlasts the server's `revisionHoldMs` hold, so a held request never times out client-side while it waits. */
  revisionHold: SYNC_PROTOCOL_CONFIG.revisionHoldMs + 15_000,
} as const

/**
 * A typed client for the Daily Sync Protocol. Every method rejects with `ProtocolError`
 * carrying the server's own code for anything the server refused, and with `SyncServerError`
 * for anything that failed before a response existed.
 */
export class DailySyncClient {
  private readonly baseUrl: string
  private readonly token: string | null
  private readonly fetchFn: typeof globalThis.fetch
  private readonly dispatcher: Dispatcher | undefined
  private readonly requestLog: RequestLogBuffer | null

  constructor(options: DailySyncClientOptions) {
    this.requestLog = options.requestLog ?? null
    this.baseUrl = options.baseUrl
    this.token = options.token
    this.fetchFn = options.fetch ?? (undiciFetch as unknown as typeof globalThis.fetch)
    this.dispatcher = options.fetch ? undefined : createServerDispatcher(options.fingerprint)
  }

  serverInfo(): Promise<ServerInfo> {
    return this.request<ServerInfo>("GET", SYNC_PROTOCOL_PATHS.server, {timeout: TIMEOUTS.probe})
  }

  claim(code: string, deviceName: string): Promise<IssuedCredential> {
    return this.request<IssuedCredential>("POST", SYNC_PROTOCOL_PATHS.claim, {timeout: TIMEOUTS.probe, json: {code, deviceName}})
  }

  requestEnrollment(deviceName: string): Promise<EnrollRequestResponse> {
    return this.request<EnrollRequestResponse>("POST", SYNC_PROTOCOL_PATHS.enrollRequest, {timeout: TIMEOUTS.probe, json: {deviceName}})
  }

  enrollmentStatus(pollToken: string): Promise<EnrollmentStatus> {
    return this.request<EnrollmentStatus>("GET", SYNC_PROTOCOL_PATHS.enrollStatus, {timeout: TIMEOUTS.probe, token: pollToken})
  }

  async pendingEnrollment(): Promise<PendingEnrollment | null> {
    const response = await this.request<PendingEnrollmentResponse>("GET", SYNC_PROTOCOL_PATHS.enrollPending, {
      timeout: TIMEOUTS.probe,
      token: this.token,
    })
    return response.request
  }

  async approveEnrollment(requestId: string, code: string): Promise<void> {
    await this.request<void>("POST", SYNC_PROTOCOL_PATHS.enrollApprove, {timeout: TIMEOUTS.probe, token: this.token, json: {requestId, code}})
  }

  async denyEnrollment(requestId: string): Promise<void> {
    await this.request<void>("POST", SYNC_PROTOCOL_PATHS.enrollDeny, {timeout: TIMEOUTS.probe, token: this.token, json: {requestId}})
  }

  listDevices(): Promise<DeviceListResponse> {
    return this.request<DeviceListResponse>("GET", SYNC_PROTOCOL_PATHS.devices, {timeout: TIMEOUTS.probe, token: this.token})
  }

  revokeDevice(deviceId: string): Promise<DeviceListResponse> {
    return this.request<DeviceListResponse>("POST", SYNC_PROTOCOL_PATHS.deviceRevoke, {timeout: TIMEOUTS.probe, token: this.token, json: {deviceId}})
  }

  openEnrollmentWindow(): Promise<EnrollmentWindow> {
    return this.request<EnrollmentWindow>("POST", SYNC_PROTOCOL_PATHS.enrollWindowOpen, {timeout: TIMEOUTS.probe, token: this.token})
  }

  closeEnrollmentWindow(): Promise<void> {
    return this.request<void>("POST", SYNC_PROTOCOL_PATHS.enrollWindowClose, {timeout: TIMEOUTS.probe, token: this.token})
  }

  openAgentWindow(): Promise<AgentWindow> {
    return this.request<AgentWindow>("POST", SYNC_PROTOCOL_PATHS.agentWindowOpen, {timeout: TIMEOUTS.probe, token: this.token})
  }

  closeAgentWindow(): Promise<void> {
    return this.request<void>("POST", SYNC_PROTOCOL_PATHS.agentWindowClose, {timeout: TIMEOUTS.probe, token: this.token})
  }

  async pendingAgentRequest(): Promise<PendingAgentRequest | null> {
    const response = await this.request<PendingAgentRequestResponse>("GET", SYNC_PROTOCOL_PATHS.agentPending, {
      timeout: TIMEOUTS.probe,
      token: this.token,
    })
    return response.request
  }

  async approveAgent(requestId: string, code: string, timeZone: string): Promise<void> {
    await this.request<void>("POST", SYNC_PROTOCOL_PATHS.agentApprove, {
      timeout: TIMEOUTS.probe,
      token: this.token,
      json: {requestId, code, timeZone},
    })
  }

  async denyAgent(requestId: string): Promise<void> {
    await this.request<void>("POST", SYNC_PROTOCOL_PATHS.agentDeny, {timeout: TIMEOUTS.probe, token: this.token, json: {requestId}})
  }

  listAgents(): Promise<AgentListResponse> {
    return this.request<AgentListResponse>("GET", SYNC_PROTOCOL_PATHS.agents, {timeout: TIMEOUTS.probe, token: this.token})
  }

  revokeAgent(agentId: string): Promise<AgentListResponse> {
    return this.request<AgentListResponse>("POST", SYNC_PROTOCOL_PATHS.agentRevoke, {timeout: TIMEOUTS.probe, token: this.token, json: {agentId}})
  }

  readSnapshot(): Promise<SnapshotReadResponse> {
    return this.request<SnapshotReadResponse>("GET", SYNC_PROTOCOL_PATHS.snapshot, {timeout: TIMEOUTS.snapshot, token: this.token})
  }

  writeSnapshot(snapshot: unknown, expectedRevision: string | null): Promise<SnapshotWriteResponse> {
    return this.request<SnapshotWriteResponse>("POST", SYNC_PROTOCOL_PATHS.snapshot, {
      timeout: TIMEOUTS.snapshot,
      token: this.token,
      gzipJson: {snapshot, expectedRevision},
    })
  }

  /**
   * Reads the server's revision. Passing the revision this device already knows asks the server to
   * hold the answer until it moves, an enrollment starts waiting, or its hold ends — passing nothing
   * (the default) gets an immediate answer, as any caller that is not this loop wants. `signal`
   * cancels a held request early, e.g. when the caller stops probing altogether. `timeZone` tells
   * the server which day this Mac is on; passing none leaves the stored one where it is.
   */
  probeRevision(knownRevision?: string | null, signal?: AbortSignal, timeZone?: string): Promise<RevisionProbe> {
    const path = revisionPath(knownRevision, timeZone)
    if (knownRevision == null) return this.request<RevisionProbe>("GET", path, {timeout: TIMEOUTS.probe, token: this.token})

    return this.request<RevisionProbe>("GET", path, {timeout: TIMEOUTS.revisionHold, token: this.token, signal})
  }

  async readLogs(): Promise<RequestLogEntry[]> {
    const view = await this.request<{entries: RequestLogEntry[]}>("GET", SYNC_PROTOCOL_PATHS.logs, {timeout: TIMEOUTS.probe, token: this.token})
    return view.entries
  }

  async listAssets(): Promise<AssetEntry[]> {
    const manifest = await this.request<AssetManifestResponse>("GET", SYNC_PROTOCOL_PATHS.assets, {timeout: TIMEOUTS.asset, token: this.token})
    return manifest.assets
  }

  async downloadAsset(name: string): Promise<Buffer> {
    return this.track("GET", assetUrl(name), {timeout: TIMEOUTS.asset, token: this.token}, async (response) => {
      if (response.status === 200) return Buffer.from(await response.arrayBuffer())

      return this.parseEnvelope<Buffer>(response)
    })
  }

  uploadAsset(name: string, bytes: Buffer): Promise<AssetEntry> {
    return this.request<AssetEntry>("PUT", assetUrl(name), {timeout: TIMEOUTS.asset, token: this.token, rawBody: bytes})
  }

  private request<T>(method: Method, path: string, options: RequestOptions): Promise<T> {
    return this.track(method, path, options, (response) => this.parseEnvelope<T>(response))
  }

  /** Runs one request through `read` and logs how it ended. A request the caller cancelled is not a failure and is not logged. */
  private async track<T>(method: Method, path: string, options: RequestOptions, read: (response: Response) => Promise<T>): Promise<T> {
    const startedAt = Date.now()
    let status: number | null = null

    try {
      const response = await this.send(method, path, options)
      status = response.status
      const result = await read(response)
      this.log(method, path, startedAt, status, null)
      return result
    } catch (err) {
      if (!options.signal?.aborted) this.log(method, path, startedAt, status, describeError(err))
      throw err
    }
  }

  private log(method: Method, path: string, startedAt: number, status: number | null, error: string | null, forcedLevel?: "warn"): void {
    if (!this.requestLog) return
    // Reading the log is not itself an event; a failed read is.
    if (error === null && path === SYNC_PROTOCOL_PATHS.logs) return

    // The route form only: an asset name or a query never reaches an entry, nor an error text that quotes the URL.
    const route = path.startsWith(SYNC_PROTOCOL_PATHS.assetItem) ? SYNC_PROTOCOL_PATHS.assetItem : path.split("?")[0]
    const at = new Date().toISOString()
    const level = forcedLevel ?? (error === null ? "info" : status !== null && status >= 400 && status < 500 ? "warn" : "error")

    this.requestLog.add({
      at,
      firstAt: at,
      level,
      source: "mac",
      method,
      path: route,
      status,
      durationMs: Date.now() - startedAt,
      device: null,
      error: error === null ? null : scrub(error, path, route),
    })
  }

  private async send(method: Method, path: string, options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = {}
    let body: BodyInit | undefined

    if (options.json !== undefined) {
      headers["content-type"] = "application/json"
      body = JSON.stringify(options.json)
    } else if (options.gzipJson !== undefined) {
      headers["content-type"] = "application/json"
      headers["content-encoding"] = "gzip"
      body = gzipSync(Buffer.from(JSON.stringify(options.gzipJson)))
    } else if (options.rawBody !== undefined) {
      body = options.rawBody as unknown as BodyInit
    }

    if (options.token) headers.authorization = `Bearer ${options.token}`

    // One deadline for the whole call, retry included.
    const timeoutSignal = AbortSignal.timeout(options.timeout)
    const startedAt = Date.now()

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.fetchFn(`${this.baseUrl}${path}`, {
          method,
          headers,
          body,
          signal: options.signal ? AbortSignal.any([timeoutSignal, options.signal]) : timeoutSignal,
          dispatcher: this.dispatcher,
        } as RequestInit)
      } catch (err) {
        if (attempt === 1 && !options.signal?.aborted && !timeoutSignal.aborted && isConnectFailure(err)) {
          this.log(method, path, startedAt, null, `${describeError(err)} (connection failed, retrying once)`, "warn")
          continue
        }

        throw this.toSyncServerError(err, options.timeout)
      }
    }
  }

  private toSyncServerError(err: unknown, timeout: number): SyncServerError {
    if (err instanceof SyncServerError) return err

    const cause = err instanceof Error ? (err as {cause?: unknown}).cause : undefined
    if (cause instanceof SyncServerError) return cause

    if (err instanceof Error && err.name === "TimeoutError") {
      return new SyncServerError(SyncServerErrorCode.UNREACHABLE, `The server did not respond within ${timeout / 1000} s`)
    }

    const phase = isConnectFailure(err) ? " (connection failed)" : ""
    const error = new SyncServerError(SyncServerErrorCode.UNREACHABLE, `Could not reach the server at ${this.baseUrl}${phase}`)
    error.cause = err
    return error
  }

  private async parseEnvelope<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T

    let payload: unknown
    try {
      payload = await response.json()
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError"
      const error = new SyncServerError(
        SyncServerErrorCode.UNREACHABLE,
        isTimeout ? "The request timed out" : "The server sent a response that was not valid JSON",
      )
      error.cause = err
      throw error
    }

    if (!isRecord(payload) || typeof payload.ok !== "boolean") {
      throw new SyncServerError(SyncServerErrorCode.UNREACHABLE, "The server sent an unexpected response")
    }

    if (payload.ok === false) {
      const error = (payload as {error: {code: ProtocolErrorCode; message: string}}).error
      throw new ProtocolError(error.code, error.message)
    }

    return (payload as {data: T}).data
  }
}

/** Drops the request URL, and an asset's name in either form, from an error text: the server's own message quotes the bare name. */
function scrub(error: string, path: string, route: string): string {
  let text = error.replaceAll(path, route)

  if (route === SYNC_PROTOCOL_PATHS.assetItem && path.length > route.length) {
    const encoded = path.slice(route.length)
    text = text.replaceAll(encoded, "<asset>")
    try {
      text = text.replaceAll(decodeURIComponent(encoded), "<asset>")
    } catch {
      // A malformed escape has no decoded form to remove.
    }
  }

  return text
}

/** `CODE: message`, then each `cause` in turn, so a log line carries the whole chain. */
function describeError(err: unknown): string {
  const parts: string[] = []

  for (let current = err; current !== undefined && current !== null && parts.length < 5; current = (current as {cause?: unknown}).cause) {
    if (!(current instanceof Error)) {
      parts.push(String(current))
      break
    }

    const code = (current as {code?: unknown}).code
    parts.push(`${typeof code === "string" ? code : current.name}: ${current.message}`)
  }

  return parts.join(" Cause: ")
}

function assetUrl(name: string): string {
  return `${SYNC_PROTOCOL_PATHS.assetItem}${encodeURIComponent(name)}`
}

function revisionPath(knownRevision?: string | null, timeZone?: string): string {
  const query = new URLSearchParams()
  if (knownRevision != null) query.set("knownRevision", knownRevision)
  if (timeZone) query.set("timeZone", timeZone)

  const search = query.toString()
  return search ? `${SYNC_PROTOCOL_PATHS.revision}?${search}` : SYNC_PROTOCOL_PATHS.revision
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
