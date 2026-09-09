import type {DeviceRole, RequestOrigin} from "./syncProtocol"

/**
 * Renderer-facing views of a Daily Sync Server connection. Every type here crosses the IPC
 * boundary, so none of them carries a credential: the renderer holds an address, a name, a
 * fingerprint and a flag, and nothing that authenticates.
 */

/** What kind of connection answered at an address, and whether that address is reachable from the public internet. */
export type ServerTransportView = {mode: "plain" | "trusted-tls" | "self-signed"; fingerprint: string | null; addressIsPublic: boolean}

/** What a probed address reported about itself, before this device has bound anything. */
export type ServerProbeView = {serverId: string; serverName: string; protocol: number; claimed: boolean; transport: ServerTransportView}

/** The binding this device holds, as the renderer sees it. */
export type ServerBindingView = {
  baseUrl: string
  serverId: string
  serverName: string
  deviceId: string
  deviceName: string
  fingerprint: string | null
  insecure: boolean
  boundAt: string
  /** This device's role on the server, learned from a probe tick. `null` until the first tick corrects it. */
  role: DeviceRole | null
  /** The name of the device that approved this one's enrollment, or `null` for the device that claimed the server. */
  approvedBy: string | null
}

/** The two protocol versions a bound device found disagreeing, the last time it checked. */
export type ProtocolMismatchView = {appProtocol: number; serverProtocol: number}

/** The binding this device holds, whether the server has since refused its credential, and any protocol mismatch. */
export type ServerConnectionStateView = {
  binding: ServerBindingView | null
  revoked: boolean
  mismatch: ProtocolMismatchView | null
}

/** The short code this device displays while it waits for a peer to approve its enrollment. */
export type EnrollmentTicketView = {code: string; expiresAt: string}

/** Where an enrollment request this device made currently stands. */
export type EnrollmentPollView = {state: "pending" | "approved" | "denied" | "expired"}

/** The one enrollment request a bound device can approve or deny on a peer's behalf. */
export type PendingApprovalView = {
  requestId: string
  code: string
  deviceName: string
  requestedAt: string
  expiresAt: string
  requestedFrom: RequestOrigin | null
}

/** One Mac bound to the server, as the Parent's membership list shows it. */
export type ServerDeviceView = {
  id: string
  name: string
  role: DeviceRole
  addedAt: string
  lastSeenAt: string | null
  revokedAt: string | null
  isThisMac: boolean
}

/** The enrollment window's current state, as the Parent sees it. */
export type EnrollmentWindowView = {expiresAt: string}

/** Every Mac bound to the server, and the enrollment window's current state — the Parent's own read of its server's membership. */
export type ServerMembershipView = {devices: ServerDeviceView[]; enrollmentWindow: EnrollmentWindowView | null}
