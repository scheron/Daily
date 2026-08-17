import {hostname} from "node:os"

import {SYNC_PROTOCOL_CONFIG} from "@shared/config/syncProtocol"
import {ProtocolError} from "@shared/errors/protocol/ProtocolError"
import {ProtocolErrorCode} from "@shared/errors/protocol/ProtocolErrorCode"
import {SyncServerError} from "@shared/errors/sync/SyncServerError"
import {SyncServerErrorCode} from "@shared/errors/sync/SyncServerErrorCode"
import {createIntervalScheduler} from "@/utils/createIntervalScheduler"
import {logger} from "@/utils/logger"
import {assertServerCanBeBound} from "@/utils/sync/syncProvider"

import {DailySyncClient} from "@/storage/sync/server/DailySyncClient"
import {probeTransport} from "@/storage/sync/server/serverTransport"

import type {ServerTransport} from "@/storage/sync/server/serverTransport"
import type {IServerProvider} from "@/types/storage"
import type {Scheduler} from "@/utils/createIntervalScheduler"
import type {ServerSyncBinding, Settings} from "@shared/types/storage"
import type {IssuedCredential, RevisionProbe, ServerInfo} from "@shared/types/syncProtocol"
import type {EnrollmentPollView, EnrollmentTicketView, PendingApprovalView, ServerBindingView, ServerProbeView} from "@shared/types/syncServer"

type ServerProviderDeps = {
  loadSettings: () => Promise<Settings>
  saveSettings: (partial: Partial<Settings>) => Promise<void>
  onBindingChanged: () => Promise<void>
  /** Runs one sync cycle through the same path (and `AsyncMutex`) the rest of the app uses. */
  runSyncCycle: () => Promise<void>
  /** Fires once when a peer's enrollment request starts waiting, not again while it still is. */
  onApprovalRequested: () => void
  /** Asked to stop the two-minute auto-sync cycle when a probe tick learns this device was revoked. */
  disableAutoSync?: () => void
}

type EnrollmentTicket = {requestId: string; code: string; pollToken: string; expiresAt: string}

type ConnectionAttempt = {
  baseUrl: string
  transport: ServerTransport
  info: ServerInfo
  enrollment: EnrollmentTicket | null
}

/**
 * Owns this device's relationship with one Daily Sync Server: the in-flight connection attempt,
 * the two doors a binding can come through (a claim code, or a peer's approval), the binding
 * written into `device_settings`, and the approval a bound device grants a peer.
 *
 * The credential the server issues never leaves this service — every value it returns is a view
 * from `@shared/types/syncServer`, and none of those carries one.
 */
export class ServerProviderService implements IServerProvider {
  private attempt: ConnectionAttempt | null = null
  private probeScheduler: Scheduler | null = null
  private lastProbedRevision: string | null | undefined = undefined
  private hadPendingEnrollment = false

  constructor(private readonly deps: ServerProviderDeps) {}

  /** This Mac's hostname without its `.local` suffix — the only thing the protocol lets a device say about itself. */
  defaultDeviceName(): string {
    return hostname().replace(/\.local$/i, "")
  }

  async getBinding(): Promise<ServerBindingView | null> {
    const binding = (await this.deps.loadSettings()).sync.server.binding
    return binding ? toBindingView(binding) : null
  }

  /**
   * Asks an address what it is and remembers the answer as the attempt every later call reads.
   * No credential is involved, and the fingerprint a self-signed server presented is pinned from
   * here on rather than taken from a caller.
   */
  async probe(baseUrl: string): Promise<ServerProbeView> {
    const {info, transport} = await probeTransport(baseUrl)
    this.attempt = {baseUrl, transport, info, enrollment: null}

    return {
      serverId: info.serverId,
      serverName: info.name,
      protocol: info.protocol,
      claimed: info.claimed,
      transport: {mode: transport.mode, fingerprint: transport.fingerprint, addressIsPublic: transport.addressIsPublic},
    }
  }

  /** Binds this Mac to a freshly deployed server with the six-digit code its console printed. */
  async claim(code: string, deviceName: string, confirmInsecure: boolean): Promise<ServerBindingView> {
    const attempt = await this.assertCanBind(confirmInsecure)
    const credential = await this.attemptClient(attempt).claim(code, deviceName)

    return this.bind(attempt, credential)
  }

  /**
   * Asks an already-claimed server to enroll this Mac and returns the code a peer must approve.
   * The poll credential the server mints stays on this service; the renderer only drives the wait.
   */
  async requestEnrollment(deviceName: string, confirmInsecure: boolean): Promise<EnrollmentTicketView> {
    const attempt = await this.assertCanBind(confirmInsecure)
    const requested = await this.attemptClient(attempt).requestEnrollment(deviceName)

    attempt.enrollment = {requestId: requested.requestId, code: requested.code, pollToken: requested.pollToken, expiresAt: requested.expiresAt}

    return {code: requested.code, expiresAt: requested.expiresAt}
  }

  /**
   * Reads where the enrollment this Mac asked for stands, and writes the binding the first time it
   * reads `approved`, so a second poll is harmless. A `denied` or `expired` answer drops the
   * request, so nothing can still be approved into a binding.
   */
  async pollEnrollment(): Promise<EnrollmentPollView> {
    const attempt = this.attempt
    if (!attempt?.enrollment) return {state: (await this.deps.loadSettings()).sync.server.binding ? "approved" : "expired"}

    const status = await this.attemptClient(attempt).enrollmentStatus(attempt.enrollment.pollToken)

    if (status.state === "approved") {
      attempt.enrollment = null
      await this.bind(attempt, {device: status.device, token: status.token})
      return {state: "approved"}
    }

    if (status.state === "denied" || status.state === "expired") {
      attempt.enrollment = null
      return {state: status.state}
    }

    return {state: "pending"}
  }

  /** Drops the in-flight attempt, so a closed wizard leaves nothing behind. */
  cancelConnection(): void {
    this.attempt = null
  }

  /**
   * Stops syncing through the server and clears this device's credential. It calls nothing on the
   * server — unbinding there is the owner's act at the console — and it touches no task.
   */
  async disconnect(): Promise<void> {
    logger.info(logger.CONTEXT.SYNC_REMOTE, "Disconnecting from the Daily Sync Server")
    this.stopProbe()
    this.attempt = null

    const settings = await this.deps.loadSettings()
    await this.deps.saveSettings({sync: {...settings.sync, server: {enabled: false, binding: null}}})
    await this.deps.onBindingChanged()
  }

  /** The one enrollment request waiting on this server, for a human on this Mac to recognise. */
  async pendingApproval(): Promise<PendingApprovalView | null> {
    const pending = await (await this.boundClient()).pendingEnrollment()
    if (!pending) return null

    return {
      requestId: pending.requestId,
      code: pending.code,
      deviceName: pending.deviceName,
      requestedAt: pending.requestedAt,
      expiresAt: pending.expiresAt,
    }
  }

  /** Approves a peer's enrollment. The code is passed through untouched: the server checks it as a race guard. */
  async approve(requestId: string, code: string): Promise<void> {
    await (await this.boundClient()).approveEnrollment(requestId, code)
  }

  async deny(requestId: string): Promise<void> {
    await (await this.boundClient()).denyEnrollment(requestId)
  }

  /**
   * Starts the twelve-second revision probe; a no-op if it is already running. Each tick compares
   * the server's revision against the one the previous tick read and runs one sync cycle exactly
   * when it moved, and edge-triggers the approval callback on a waiting enrollment request.
   */
  startProbe(): void {
    if (this.probeScheduler) return

    this.probeScheduler = createIntervalScheduler({
      intervalMs: SYNC_PROTOCOL_CONFIG.revisionProbeIntervalMs,
      onProcess: () => this.probeTick(),
    })
    this.probeScheduler.start()
  }

  /** Stops the probe; a no-op if it is not running. */
  stopProbe(): void {
    this.probeScheduler?.stop()
    this.probeScheduler = null
    this.lastProbedRevision = undefined
    this.hadPendingEnrollment = false
  }

  private async assertCanBind(confirmInsecure: boolean): Promise<ConnectionAttempt> {
    const settings = await this.deps.loadSettings()
    assertServerCanBeBound(settings.sync)

    const attempt = this.attempt
    if (!attempt) throw new SyncServerError(SyncServerErrorCode.NO_BINDING, "No server has been probed yet")

    if (attempt.transport.mode === "plain" && attempt.transport.addressIsPublic && !confirmInsecure) {
      throw new SyncServerError(
        SyncServerErrorCode.INSECURE_TRANSPORT_REJECTED,
        "This address is reachable from the internet and the connection is unencrypted; confirm it explicitly to continue",
      )
    }

    return attempt
  }

  private async bind(attempt: ConnectionAttempt, credential: IssuedCredential): Promise<ServerBindingView> {
    const settings = await this.deps.loadSettings()
    assertServerCanBeBound(settings.sync)

    const binding: ServerSyncBinding = {
      baseUrl: attempt.baseUrl,
      serverId: attempt.info.serverId,
      serverName: attempt.info.name,
      deviceId: credential.device.id,
      deviceName: credential.device.name,
      token: credential.token,
      fingerprint: attempt.transport.fingerprint,
      insecure: attempt.transport.mode === "plain",
      boundAt: new Date().toISOString(),
    }

    await this.deps.saveSettings({sync: {...settings.sync, server: {enabled: true, binding}}})
    await this.deps.onBindingChanged()
    logger.info(logger.CONTEXT.SYNC_REMOTE, `Bound this device to the Daily Sync Server "${binding.serverName}" as "${binding.deviceName}"`)

    return toBindingView(binding)
  }

  private attemptClient(attempt: ConnectionAttempt): DailySyncClient {
    return new DailySyncClient({baseUrl: attempt.baseUrl, token: null, fingerprint: attempt.transport.fingerprint})
  }

  private async boundClient(): Promise<DailySyncClient> {
    const binding = (await this.deps.loadSettings()).sync.server.binding
    if (!binding) throw new SyncServerError(SyncServerErrorCode.NO_BINDING, "This device is not connected to a Daily Sync Server")

    return new DailySyncClient({baseUrl: binding.baseUrl, token: binding.token, fingerprint: binding.fingerprint})
  }

  private async probeTick(): Promise<void> {
    let probe: RevisionProbe

    try {
      probe = await (await this.boundClient()).probeRevision()
    } catch (error) {
      if (error instanceof ProtocolError && error.code === ProtocolErrorCode.DEVICE_REVOKED) {
        logger.warn(logger.CONTEXT.SYNC_REMOTE, "This device's credential was revoked; stopping the revision probe and auto-sync")
        this.stopProbe()
        this.deps.disableAutoSync?.()
        return
      }

      logger.debug(logger.CONTEXT.SYNC_REMOTE, "Revision probe tick failed; will retry on the next interval", error)
      return
    }

    if (this.lastProbedRevision !== undefined && probe.revision !== this.lastProbedRevision) {
      await this.deps.runSyncCycle()
    }
    this.lastProbedRevision = probe.revision

    if (probe.pendingEnrollment && !this.hadPendingEnrollment) {
      this.deps.onApprovalRequested()
    }
    this.hadPendingEnrollment = probe.pendingEnrollment
  }
}

function toBindingView(binding: ServerSyncBinding): ServerBindingView {
  return {
    baseUrl: binding.baseUrl,
    serverId: binding.serverId,
    serverName: binding.serverName,
    deviceId: binding.deviceId,
    deviceName: binding.deviceName,
    fingerprint: binding.fingerprint,
    insecure: binding.insecure,
    boundAt: binding.boundAt,
  }
}
