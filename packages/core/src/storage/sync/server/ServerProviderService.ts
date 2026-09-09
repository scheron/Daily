import {hostname} from "node:os"

import {ProtocolError, ProtocolErrorCode, SYNC_PROTOCOL_CONFIG, SYNC_PROTOCOL_VERSION, SyncServerError, SyncServerErrorCode} from "@daily/protocol"
import {createIntervalScheduler} from "@daily/std"

import {logger} from "../../../utils/logger"
import {toBindingView} from "../../../utils/sync/settingsViews"
import {DailySyncClient} from "./DailySyncClient"
import {probeTransport} from "./serverTransport"

import type {
  DeviceListResponse,
  DeviceRole,
  EnrollmentPollView,
  EnrollmentTicketView,
  EnrollmentWindowView,
  IssuedCredential,
  PendingApprovalView,
  ProtocolMismatchView,
  RevisionProbe,
  ServerBindingView,
  ServerConnectionStateView,
  ServerInfo,
  ServerMembershipView,
  ServerProbeView,
  ServerSyncBinding,
  Settings,
} from "@daily/protocol"
import type {Scheduler} from "@daily/std"
import type {IServerProvider} from "../../../types/storage"
import type {ServerTransport} from "./serverTransport"

type ServerProviderDeps = {
  loadSettings: () => Promise<Settings>
  saveSettings: (partial: Partial<Settings>) => Promise<void>
  onBindingChanged: () => Promise<void>
  /** Runs one sync cycle through the same path (and `AsyncMutex`) the rest of the app uses. */
  runSyncCycle: () => Promise<void>
  /** Fires once when a peer's enrollment request starts waiting, not again while it still is. */
  onApprovalRequested: () => void
  /** Asked to stop the two-minute auto-sync cycle when a probe tick learns this device was revoked, or that its protocol no longer matches the server's. */
  disableAutoSync?: () => void
  /** Asked to resume the two-minute auto-sync cycle once a protocol mismatch clears. */
  enableAutoSync?: () => void
  /** Fires once when a probe tick learns the server refused this device's credential. */
  onRevoked: () => void
  /** Fires on the tick that first finds the app and server disagreeing on protocol, and again on the tick that first finds them agreeing again. */
  onProtocolMismatchChanged?: (mismatch: ProtocolMismatchView | null) => void
  /** Fires once on the tick that first finds this device's role changed. */
  onRoleChanged?: (role: DeviceRole) => void
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
 * from `@daily/protocol`'s sync-server types, and none of those carries one.
 */
export class ServerProviderService implements IServerProvider {
  private attempt: ConnectionAttempt | null = null
  private probeScheduler: Scheduler | null = null
  private probeAbort: AbortController | null = null
  private probeRearm: ReturnType<typeof setTimeout> | null = null
  private probeInFlight = false
  private probeGeneration = 0
  private lastProbedRevision: string | null | undefined = undefined
  private hadPendingEnrollment = false
  private revoked = false
  private mismatch: ProtocolMismatchView | null = null

  constructor(private readonly deps: ServerProviderDeps) {}

  /** This Mac's hostname without its `.local` suffix — the only thing the protocol lets a device say about itself. */
  defaultDeviceName(): string {
    return hostname().replace(/\.local$/i, "")
  }

  /** The binding this device holds, whether the server has since refused its credential, and any protocol mismatch, in one call. */
  async getState(): Promise<ServerConnectionStateView> {
    const binding = (await this.deps.loadSettings()).sync.server.binding
    return {binding: binding ? toBindingView(binding) : null, revoked: this.revoked, mismatch: this.mismatch}
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

    return this.bind(attempt, credential, "parent", null)
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
      await this.bind(attempt, {device: status.device, token: status.token}, "child", status.approvedBy)
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
    this.revoked = false

    const settings = await this.deps.loadSettings()
    await this.deps.saveSettings({sync: {...settings.sync, server: {enabled: false, binding: null}}})
    await this.deps.onBindingChanged()
  }

  /** The one enrollment request waiting on this server, or `null` when none waits and when no server is connected. */
  async pendingApproval(): Promise<PendingApprovalView | null> {
    const client = await this.clientIfBound()
    if (!client) return null

    const pending = await client.pendingEnrollment()
    if (!pending) return null

    return {
      requestId: pending.requestId,
      code: pending.code,
      deviceName: pending.deviceName,
      requestedAt: pending.requestedAt,
      expiresAt: pending.expiresAt,
      requestedFrom: pending.requestedFrom,
    }
  }

  /**
   * Approves a peer's enrollment. The code is passed through untouched: the server checks it as a
   * race guard. Clears `hadPendingEnrollment` so the next probe reporting a waiting request is read
   * as a genuine edge rather than the one this call just resolved.
   */
  async approve(requestId: string, code: string): Promise<void> {
    await (await this.boundClient()).approveEnrollment(requestId, code)
    this.hadPendingEnrollment = false
  }

  /** Denies a peer's enrollment. Clears `hadPendingEnrollment` for the same reason `approve` does. */
  async deny(requestId: string): Promise<void> {
    await (await this.boundClient()).denyEnrollment(requestId)
    this.hadPendingEnrollment = false
  }

  /** The Parent's own read of its server's membership: every device bound, and the enrollment window's current state. */
  async listMembership(): Promise<ServerMembershipView> {
    const thisDeviceId = (await this.deps.loadSettings()).sync.server.binding?.deviceId ?? null
    const response = await (await this.boundClient()).listDevices()

    return this.toMembershipView(response, thisDeviceId)
  }

  /** Withdraws one device's access and returns the membership as it now stands, so the caller never reconciles two shapes. */
  async revokeDevice(deviceId: string): Promise<ServerMembershipView> {
    const thisDeviceId = (await this.deps.loadSettings()).sync.server.binding?.deviceId ?? null
    const response = await (await this.boundClient()).revokeDevice(deviceId)

    return this.toMembershipView(response, thisDeviceId)
  }

  /** Opens the enrollment window, so a peer's request is accepted rather than refused `ENROLLMENT_WINDOW_CLOSED`. */
  async openEnrollmentWindow(): Promise<EnrollmentWindowView> {
    const window = await (await this.boundClient()).openEnrollmentWindow()
    return {expiresAt: window.expiresAt}
  }

  /** Closes the enrollment window early. */
  async closeEnrollmentWindow(): Promise<void> {
    await (await this.boundClient()).closeEnrollmentWindow()
  }

  /**
   * Starts the twelve-second revision probe; a no-op if it is already running. Each tick compares
   * the server's revision against the one the previous tick read and runs one sync cycle exactly
   * when it moved, and edge-triggers the approval callback on a waiting enrollment request.
   */
  startProbe(): void {
    if (this.probeScheduler) return
    this.startProbeScheduler(SYNC_PROTOCOL_CONFIG.revisionProbeIntervalMs)
  }

  /**
   * Stops the probe; a no-op if it is not running. Cancels a held request rather than abandoning
   * it, cancels a pending re-arm rather than letting it resurrect the loop afterward, and clears
   * `probeInFlight` so a `startProbe()` right after this is never left waiting on a flag a tick
   * already being torn down would otherwise still clear for itself, a moment later, on its own.
   *
   * `probeGeneration` is bumped every call, not just reset — it is what a tick still unwinding
   * from before this call checks against before touching state a later `startProbe()` now owns.
   * `probeAbort`/`clearTimeout(probeRearm)` only reach requests and timers that exist; they do
   * nothing about a tick already past its network call and into `runSyncCycle()`, which nothing
   * here can cancel — the generation check is what stops that tick's *return*, once it finally
   * happens, from clobbering a tick this call had nothing to do with.
   */
  stopProbe(): void {
    this.probeScheduler?.stop()
    this.probeScheduler = null
    this.lastProbedRevision = undefined
    this.hadPendingEnrollment = false
    this.probeAbort?.abort()
    this.probeAbort = null
    if (this.probeRearm !== null) clearTimeout(this.probeRearm)
    this.probeRearm = null
    this.probeInFlight = false
    this.probeGeneration++
  }

  private async assertCanBind(confirmInsecure: boolean): Promise<ConnectionAttempt> {
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

  private async bind(
    attempt: ConnectionAttempt,
    credential: IssuedCredential,
    role: DeviceRole,
    approvedBy: string | null,
  ): Promise<ServerBindingView> {
    const settings = await this.deps.loadSettings()

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
      role,
      approvedBy,
    }

    await this.deps.saveSettings({sync: {...settings.sync, server: {enabled: false, binding}}})
    this.revoked = false
    await this.deps.onBindingChanged()
    logger.info(logger.CONTEXT.SYNC_REMOTE, `Bound this device to the Daily Sync Server "${binding.serverName}" as "${binding.deviceName}"`)

    return toBindingView(binding)
  }

  private attemptClient(attempt: ConnectionAttempt): DailySyncClient {
    return new DailySyncClient({baseUrl: attempt.baseUrl, token: null, fingerprint: attempt.transport.fingerprint})
  }

  private async clientIfBound(): Promise<DailySyncClient | null> {
    const binding = (await this.deps.loadSettings()).sync.server.binding
    if (!binding) return null

    return new DailySyncClient({baseUrl: binding.baseUrl, token: binding.token, fingerprint: binding.fingerprint})
  }

  private async boundClient(): Promise<DailySyncClient> {
    const client = await this.clientIfBound()
    if (!client) throw new SyncServerError(SyncServerErrorCode.NO_BINDING, "This device is not connected to a Daily Sync Server")

    return client
  }

  /** Maps the wire's `DeviceListResponse` onto the renderer-safe `ServerMembershipView`, renaming `createdAt` to `addedAt` and deriving `isThisMac` here so the renderer never has to hold two device ids at once. */
  private toMembershipView(response: DeviceListResponse, thisDeviceId: string | null): ServerMembershipView {
    return {
      devices: response.devices.map((device) => ({
        id: device.id,
        name: device.name,
        role: device.role,
        addedAt: device.createdAt,
        lastSeenAt: device.lastSeenAt,
        revokedAt: device.revokedAt,
        isThisMac: device.id === thisDeviceId,
      })),
      enrollmentWindow: response.enrollmentWindow ? {expiresAt: response.enrollmentWindow.expiresAt} : null,
    }
  }

  /**
   * Runs one probe, and re-arms the next one immediately when this one made real progress — a
   * moved revision, a freshly pending enrollment, or a hold that ran to its own end with nothing
   * new — rather than waiting for the scheduler's own interval. `createIntervalScheduler` stays
   * the only scheduler; the re-arm is one cancellable `setTimeout(…, 0)` calling this method again.
   *
   * `probeInFlight` keeps this method single-flight across its two entry points: the scheduler's
   * own `perform()`, and a re-arm's direct call, which `perform()`'s serialisation does not cover.
   * `probeGeneration`, bumped by every `stopProbe()`, is what a tick still alive after a
   * `stopProbe()`/`startProbe()` — since nothing here can cancel `runSyncCycle()` mid-flight —
   * checks before touching state or the flag a newer tick now owns.
   *
   * A still-pending enrollment, and a probe sent with no known revision (before the first exists,
   * or while mismatched), answer at once and must not re-arm, or neither would bound how often it
   * asks again.
   */
  private async probeTick(): Promise<void> {
    if (this.probeInFlight || !this.probeScheduler) return
    this.probeInFlight = true
    const generation = this.probeGeneration

    try {
      let probe: RevisionProbe

      const knownRevision = this.mismatch ? null : this.lastProbedRevision
      const askedToHold = knownRevision != null
      const abort = new AbortController()
      this.probeAbort = abort

      try {
        probe = await (await this.boundClient()).probeRevision(knownRevision, abort.signal)
      } catch (error) {
        if (error instanceof ProtocolError && error.code === ProtocolErrorCode.DEVICE_REVOKED) {
          if (this.probeGeneration !== generation) return

          logger.warn(logger.CONTEXT.SYNC_REMOTE, "This device's credential was revoked; stopping the revision probe and auto-sync")
          this.revoked = true
          this.stopProbe()
          this.deps.disableAutoSync?.()
          this.deps.onRevoked()
          return
        }

        logger.debug(logger.CONTEXT.SYNC_REMOTE, "Revision probe tick failed; will retry on the next interval", error)
        return
      } finally {
        if (this.probeAbort === abort) this.probeAbort = null
      }

      if (this.probeGeneration !== generation) return

      const serverProtocol = probe.protocol ?? 1
      if (serverProtocol !== SYNC_PROTOCOL_VERSION) {
        this.enterMismatch(serverProtocol)
        return
      }
      if (this.mismatch) this.exitMismatch()

      const stillPendingEnrollment = probe.pendingEnrollment && this.hadPendingEnrollment

      const revisionMoved = this.lastProbedRevision !== undefined && probe.revision !== this.lastProbedRevision
      if (revisionMoved) await this.deps.runSyncCycle()

      if (this.probeGeneration !== generation) return

      await this.applyRoleIfChanged(probe.role)

      if (this.probeGeneration !== generation) return

      this.lastProbedRevision = probe.revision

      const enrollmentNewlyPending = probe.pendingEnrollment && !this.hadPendingEnrollment
      if (enrollmentNewlyPending) this.deps.onApprovalRequested()
      this.hadPendingEnrollment = probe.pendingEnrollment

      const shouldRearm = revisionMoved || enrollmentNewlyPending || (askedToHold && !stillPendingEnrollment)

      if (shouldRearm && this.probeScheduler) {
        this.probeRearm = setTimeout(() => {
          this.probeRearm = null
          void this.probeTick()
        }, 0)
      }
    } finally {
      if (this.probeGeneration === generation) this.probeInFlight = false
    }
  }

  /**
   * The typed-fact-on-tick mechanism, reused for role: a tick that finds `RevisionProbe.role`
   * differs from the binding's own writes it through `saveSettings` and fires `onRoleChanged`
   * once. A tick that agrees writes nothing and fires nothing.
   */
  private async applyRoleIfChanged(role: DeviceRole): Promise<void> {
    const settings = await this.deps.loadSettings()
    const binding = settings.sync.server.binding
    if (!binding || binding.role === role) return

    await this.deps.saveSettings({sync: {...settings.sync, server: {...settings.sync.server, binding: {...binding, role}}}})
    this.deps.onRoleChanged?.(role)
  }

  private startProbeScheduler(intervalMs: number): void {
    this.probeScheduler = createIntervalScheduler({intervalMs, onProcess: () => this.probeTick()})
    this.probeScheduler.start()
  }

  private switchProbeCadence(intervalMs: number): void {
    this.probeScheduler?.stop()
    this.startProbeScheduler(intervalMs)
  }

  /**
   * Enters (or renews, without re-triggering side effects) the protocol mismatch this device just
   * found on the wire. Distinct from `revoked`: this fact clears itself the moment the two sides
   * agree again, so it gets its own field, its own dep and its own recovery — never the revoked one.
   */
  private enterMismatch(serverProtocol: number): void {
    const alreadyMismatched = this.mismatch !== null
    this.mismatch = {appProtocol: SYNC_PROTOCOL_VERSION, serverProtocol}
    if (alreadyMismatched) return

    this.switchProbeCadence(SYNC_PROTOCOL_CONFIG.protocolRecheckIntervalMs)
    this.deps.disableAutoSync?.()
    this.deps.onProtocolMismatchChanged?.(this.mismatch)
  }

  private exitMismatch(): void {
    this.mismatch = null
    this.switchProbeCadence(SYNC_PROTOCOL_CONFIG.revisionProbeIntervalMs)
    this.deps.enableAutoSync?.()
    this.deps.onProtocolMismatchChanged?.(null)
  }
}
