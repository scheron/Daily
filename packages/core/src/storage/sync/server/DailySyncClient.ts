import {Readable} from "node:stream"
import {gunzipSync, gzipSync} from "node:zlib"
import {fetch as undiciFetch, request as undiciRequest} from "undici"

import {
  ProtocolError,
  ProtocolErrorCode,
  SYNC_PROTOCOL_CONFIG,
  SYNC_PROTOCOL_PATHS,
  SYNC_PROTOCOL_VERSION,
  SyncServerError,
  SyncServerErrorCode,
} from "@daily/protocol"

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
  RequestLogEntry,
  RevisionProbe,
  ServerInfo,
  SnapshotReadResponse,
  SnapshotWriteBody,
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
  rawBody?: Buffer
  /** Cancels the request from this side, in addition to (not instead of) `timeout`. */
  signal?: AbortSignal
}

const TIMEOUTS = {
  probe: 30_000,
  snapshotIdle: 30_000,
  snapshotTotal: 15 * 60_000,
  asset: 120_000,
  /** Outlasts the server's `revisionHoldMs` hold, so a held request never times out client-side while it waits. */
  revisionHold: SYNC_PROTOCOL_CONFIG.revisionHoldMs + 15_000,
} as const

export class SyncTransferError extends SyncServerError {
  constructor(
    readonly kind: "transient" | "terminal" | "ambiguous" | "cancelled",
    message: string,
    code = SyncServerErrorCode.UNREACHABLE,
  ) {
    super(code, message)
    this.name = "SyncTransferError"
  }
}

/**
 * A typed client for the Daily Sync Protocol. Every method rejects with `ProtocolError`
 * carrying the server's own code for anything the server refused, and with `SyncServerError`
 * for anything that failed before a response existed.
 */
export class DailySyncClient {
  private readonly baseUrl: string
  private readonly token: string | null
  private readonly fetchFn: typeof globalThis.fetch
  private readonly dispatcher: Dispatcher
  private readonly _snapshotDispatcher: Dispatcher
  private readonly requestLog: RequestLogBuffer | null

  constructor(options: DailySyncClientOptions) {
    this.requestLog = options.requestLog ?? null
    this.baseUrl = options.baseUrl
    this.token = options.token
    this.fetchFn = options.fetch ?? (undiciFetch as unknown as typeof globalThis.fetch)
    this.dispatcher = createServerDispatcher(options.fingerprint)
    this._snapshotDispatcher = createServerDispatcher(options.fingerprint, "snapshot")
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

  readSnapshot(signal?: AbortSignal): Promise<SnapshotReadResponse> {
    return this._snapshotRequest(null, validateSnapshotRead, signal)
  }

  writeSnapshot(snapshot: unknown, expectedRevision: string | null, signal?: AbortSignal): Promise<SnapshotWriteResponse> {
    return this._snapshotRequest(
      {snapshot, expectedRevision},
      (data): data is SnapshotWriteResponse => isRecord(data) && isRevision(data.revision) && data.revision !== expectedRevision,
      signal,
    )
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
    return this.track(
      "GET",
      path,
      {timeout: knownRevision == null ? TIMEOUTS.probe : TIMEOUTS.revisionHold, token: this.token, signal},
      async (response) => {
        const data = await this.parseEnvelope<unknown>(response)
        if (response.status !== 200 || !isRevisionProbe(data)) throw new SyncTransferError("terminal", "The server sent an invalid revision probe")
        return data
      },
    )
  }

  async readLogs(): Promise<RequestLogEntry[]> {
    const view = await this.request<{entries: RequestLogEntry[]}>("GET", SYNC_PROTOCOL_PATHS.logs, {timeout: TIMEOUTS.probe, token: this.token})
    return view.entries
  }

  async listAssets(signal?: AbortSignal): Promise<AssetEntry[]> {
    const manifest = await this.request<AssetManifestResponse>("GET", SYNC_PROTOCOL_PATHS.assets, {
      timeout: TIMEOUTS.asset,
      token: this.token,
      signal,
    })
    return manifest.assets
  }

  async downloadAsset(name: string, signal?: AbortSignal): Promise<Buffer> {
    return this.track("GET", assetUrl(name), {timeout: TIMEOUTS.asset, token: this.token, signal}, async (response) => {
      if (response.status === 200) return Buffer.from(await response.arrayBuffer())

      return this.parseEnvelope<Buffer>(response)
    })
  }

  uploadAsset(name: string, bytes: Buffer, signal?: AbortSignal): Promise<AssetEntry> {
    return this.request<AssetEntry>("PUT", assetUrl(name), {timeout: TIMEOUTS.asset, token: this.token, rawBody: bytes, signal})
  }

  private async _snapshotRequest<T>(
    payload: SnapshotWriteBody | null,
    validate: (data: unknown) => data is T,
    cancellation?: AbortSignal,
  ): Promise<T> {
    const startedAt = Date.now()
    const method = payload ? "POST" : "GET"
    const path = SYNC_PROTOCOL_PATHS.snapshot
    const deadline = new AbortController()
    const timer = setTimeout(() => deadline.abort(), TIMEOUTS.snapshotTotal).unref()
    const signal = cancellation ? AbortSignal.any([deadline.signal, cancellation]) : deadline.signal
    let status: number | null = null

    try {
      signal.throwIfAborted()
      const body = payload ? encodeSnapshot(payload) : null
      const headers = {
        "accept-encoding": "gzip",
        ...(this.token && {authorization: `Bearer ${this.token}`}),
        ...(body && {"content-type": "application/json", "content-encoding": "gzip", "content-length": String(body.length)}),
      }
      const url = `${this.baseUrl}${path}`
      for (let attempt = 1; ; attempt++) {
        try {
          const response = await undiciRequest(url, {
            dispatcher: this._snapshotDispatcher,
            method,
            headers,
            // An HTTP/2 GOAWAY can requeue a buffered body. The upload stream is single-use.
            body: body ? Readable.from([body]) : null,
            signal,
            idempotent: false,
            // A backpressured upload can still be progressing. Only the receiver can time its inactivity.
            headersTimeout: payload ? 0 : TIMEOUTS.snapshotIdle,
            bodyTimeout: TIMEOUTS.snapshotIdle,
          })

          status = response.statusCode
          if (status === 408 || status === 429) {
            response.body.once("error", () => {}).destroy()
            throw new SyncTransferError("transient", `The server paused the snapshot transfer (HTTP ${status})`)
          }
          const bytes = Buffer.from(await response.body.arrayBuffer())
          const data = parseSnapshotEnvelope(bytes, status, response.headers["content-encoding"], method === "POST")
          if (!validate(data)) throw invalidSnapshotReply(method === "POST", "The server sent invalid snapshot data or revision")
          this.log(method, path, startedAt, status, null)
          return data
        } catch (err) {
          if (attempt === 1 && status === null && !signal.aborted && isConnectFailure(err) && !isCertificateFailure(err)) {
            this.log(method, path, startedAt, null, "Snapshot connection failed, retrying once", "warn")
            continue
          }
          throw err
        }
      }
    } catch (err) {
      const error = transferError(err, method === "POST", cancellation, deadline.signal, status)
      if (error instanceof ProtocolError || error.kind !== "cancelled") this.log(method, path, startedAt, status, describeError(error))
      throw error
    } finally {
      clearTimeout(timer)
    }
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
    } else if (options.rawBody !== undefined) {
      body = options.rawBody as unknown as BodyInit
    }

    if (options.token) headers.authorization = `Bearer ${options.token}`

    // One deadline for the whole call, retry included.
    const timeoutSignal = AbortSignal.timeout(options.timeout)
    const startedAt = Date.now()

    for (let attempt = 1; ; attempt++) {
      try {
        const signal = options.signal ? AbortSignal.any([timeoutSignal, options.signal]) : timeoutSignal
        signal.throwIfAborted()
        return await this.fetchFn(`${this.baseUrl}${path}`, {
          method,
          headers,
          body,
          signal,
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
      const error = payload.error
      if (!isRecord(error) || !isProtocolErrorCode(error.code) || typeof error.message !== "string") {
        throw new SyncServerError(SyncServerErrorCode.UNREACHABLE, "The server sent an unexpected error response")
      }
      throw new ProtocolError(error.code, error.message)
    }

    return (payload as {data: T}).data
  }
}

function encodeSnapshot(payload: SnapshotWriteBody): Buffer {
  try {
    return gzipSync(JSON.stringify(payload))
  } catch {
    throw new SyncTransferError("terminal", "The local snapshot could not be encoded")
  }
}

function parseSnapshotEnvelope(bytes: Buffer, status: number, encoding: string | string[] | undefined, writing: boolean): unknown {
  if (status >= 500) throw new SyncTransferError(writing ? "ambiguous" : "transient", `The snapshot server failed (HTTP ${status})`)
  const possiblyCommitted = writing && status >= 200 && status < 300
  if (encoding && encoding !== "gzip" && encoding !== "identity") {
    throw invalidSnapshotReply(possiblyCommitted, "The server sent an unsupported snapshot encoding")
  }

  let envelope: unknown
  try {
    const decoded = encoding === "gzip" ? gunzipSync(bytes) : bytes
    envelope = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(decoded))
  } catch {
    throw invalidSnapshotReply(possiblyCommitted, "The server sent a corrupt snapshot response")
  }

  if (isRecord(envelope)) {
    if (status === 200 && envelope.ok === true) return envelope.data
    if (status >= 400 && envelope.ok === false && isRecord(envelope.error) && isProtocolErrorCode(envelope.error.code)) {
      const error = new ProtocolError(envelope.error.code)
      if (error.status === status && typeof envelope.error.message === "string") throw error
    }
  }
  throw invalidSnapshotReply(possiblyCommitted, "The server sent an unexpected snapshot response")
}

function invalidSnapshotReply(possiblyCommitted: boolean, message: string): SyncTransferError {
  return new SyncTransferError(possiblyCommitted ? "ambiguous" : "terminal", message)
}

function transferError(
  err: unknown,
  writing: boolean,
  cancellation: AbortSignal | undefined,
  deadline: AbortSignal,
  status: number | null,
): SyncTransferError | ProtocolError {
  if (cancellation?.aborted) return new SyncTransferError("cancelled", "Snapshot transfer cancelled")
  if (err instanceof ProtocolError || err instanceof SyncTransferError) return err
  if (err instanceof SyncServerError) return new SyncTransferError("terminal", err.message, err.code)
  if (isCertificateFailure(err)) return new SyncTransferError("terminal", "The server's TLS certificate could not be verified")

  const code = errorCode(err)
  const kind = writing && !isConnectFailure(err) ? "ambiguous" : "transient"
  if (deadline.aborted) return new SyncTransferError(kind, "The snapshot transfer reached its 15 min limit")
  if (code === "UND_ERR_BODY_TIMEOUT") return new SyncTransferError(kind, "The snapshot response was idle for 30 s")
  if (code === "UND_ERR_HEADERS_TIMEOUT") return new SyncTransferError(kind, "The server did not start a snapshot response within 30 s")
  if (code?.startsWith("HPE_")) return invalidSnapshotReply(writing, "The server sent a malformed HTTP response")
  return new SyncTransferError(
    kind,
    status === null ? "Could not reach the server for the snapshot transfer" : "The snapshot response was interrupted",
  )
}

function errorCode(value: unknown): string | null {
  return isRecord(value) && typeof value.code === "string" ? value.code : null
}

function isCertificateFailure(err: unknown): boolean {
  const code = errorCode(err)
  return code !== null && /CERT|SELF_SIGNED|UNABLE_TO_(VERIFY|GET)_/.test(code)
}

function validateSnapshotRead(data: unknown): data is SnapshotReadResponse {
  if (!isRecord(data)) return false
  return data.snapshot === null ? data.revision === null : isRecord(data.snapshot) && isRevision(data.revision)
}

function isRevision(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isRevisionProbe(value: unknown): value is RevisionProbe {
  if (!isRecord(value) || (value.revision !== null && !isRevision(value.revision))) return false
  if (typeof value.pendingEnrollment !== "boolean") return false
  if (value.protocol !== undefined && (typeof value.protocol !== "number" || !Number.isSafeInteger(value.protocol) || value.protocol < 1))
    return false
  if (value.protocol !== SYNC_PROTOCOL_VERSION) return true
  return (
    typeof value.pendingAgentRequest === "boolean" &&
    typeof value.acceptsAgents === "boolean" &&
    (value.role === "parent" || value.role === "child") &&
    (value.name === undefined || typeof value.name === "string")
  )
}

function isProtocolErrorCode(value: unknown): value is ProtocolErrorCode {
  return Object.values(ProtocolErrorCode).some((code) => code === value)
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
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
