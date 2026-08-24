import {gzipSync} from "node:zlib"
import {fetch as undiciFetch} from "undici"

import {ProtocolError, SYNC_PROTOCOL_PATHS, SyncServerError, SyncServerErrorCode} from "@daily/protocol"

import {createServerDispatcher} from "./serverTransport"

import type {
  AssetEntry,
  AssetManifestResponse,
  EnrollmentStatus,
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
}

const TIMEOUTS = {
  probe: 8_000,
  snapshot: 30_000,
  asset: 120_000,
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

  probeRevision(): Promise<RevisionProbe> {
    return this.request<RevisionProbe>("GET", SYNC_PROTOCOL_PATHS.revision, {timeout: TIMEOUTS.probe, token: this.token})
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

    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(options.timeout),
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
