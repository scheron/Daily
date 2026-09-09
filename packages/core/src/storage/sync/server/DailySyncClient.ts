import {gzipSync} from "node:zlib"
import {fetch as undiciFetch} from "undici"

import {ProtocolError, SYNC_PROTOCOL_CONFIG, SYNC_PROTOCOL_PATHS, SyncServerError, SyncServerErrorCode} from "@daily/protocol"

import {createServerDispatcher} from "./serverTransport"

import type {
  AssetEntry,
  AssetManifestResponse,
  DeviceListResponse,
  EnrollmentStatus,
  EnrollmentWindow,
  EnrollRequestResponse,
  IssuedCredential,
  PendingEnrollment,
  PendingEnrollmentResponse,
  ProtocolErrorCode,
  RevisionProbe,
  ServerInfo,
  SnapshotReadResponse,
  SnapshotWriteResponse,
} from "@daily/protocol"
import type {Dispatcher} from "undici"

export type DailySyncClientOptions = {
  baseUrl: string
  token: string | null
  fingerprint: string | null
  fetch?: typeof globalThis.fetch
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
  probe: 8_000,
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

  constructor(options: DailySyncClientOptions) {
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
   * cancels a held request early, e.g. when the caller stops probing altogether.
   */
  probeRevision(knownRevision?: string | null, signal?: AbortSignal): Promise<RevisionProbe> {
    if (knownRevision == null) return this.request<RevisionProbe>("GET", SYNC_PROTOCOL_PATHS.revision, {timeout: TIMEOUTS.probe, token: this.token})

    const path = `${SYNC_PROTOCOL_PATHS.revision}?knownRevision=${encodeURIComponent(knownRevision)}`
    return this.request<RevisionProbe>("GET", path, {timeout: TIMEOUTS.revisionHold, token: this.token, signal})
  }

  async listAssets(): Promise<AssetEntry[]> {
    const manifest = await this.request<AssetManifestResponse>("GET", SYNC_PROTOCOL_PATHS.assets, {timeout: TIMEOUTS.asset, token: this.token})
    return manifest.assets
  }

  async downloadAsset(name: string): Promise<Buffer> {
    const response = await this.send("GET", assetUrl(name), {timeout: TIMEOUTS.asset, token: this.token})
    if (response.status === 200) return Buffer.from(await response.arrayBuffer())

    return this.parseEnvelope<Buffer>(response)
  }

  uploadAsset(name: string, bytes: Buffer): Promise<AssetEntry> {
    return this.request<AssetEntry>("PUT", assetUrl(name), {timeout: TIMEOUTS.asset, token: this.token, rawBody: bytes})
  }

  private async request<T>(method: Method, path: string, options: RequestOptions): Promise<T> {
    const response = await this.send(method, path, options)
    return this.parseEnvelope<T>(response)
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

    const timeoutSignal = AbortSignal.timeout(options.timeout)

    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body,
        signal: options.signal ? AbortSignal.any([timeoutSignal, options.signal]) : timeoutSignal,
        dispatcher: this.dispatcher,
      } as RequestInit)
    } catch (err) {
      throw this.toSyncServerError(err)
    }
  }

  private toSyncServerError(err: unknown): SyncServerError {
    if (err instanceof SyncServerError) return err

    const cause = err instanceof Error ? (err as {cause?: unknown}).cause : undefined
    if (cause instanceof SyncServerError) return cause

    if (err instanceof Error && err.name === "TimeoutError") {
      return new SyncServerError(SyncServerErrorCode.UNREACHABLE, "The request timed out")
    }

    const error = new SyncServerError(SyncServerErrorCode.UNREACHABLE, `Could not reach the server at ${this.baseUrl}`)
    error.cause = err
    return error
  }

  private async parseEnvelope<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new SyncServerError(SyncServerErrorCode.UNREACHABLE, "The server sent a response that was not valid JSON")
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

function assetUrl(name: string): string {
  return `${SYNC_PROTOCOL_PATHS.assetItem}${encodeURIComponent(name)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
