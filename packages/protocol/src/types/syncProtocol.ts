import type {ProtocolErrorCode} from "../errors/protocol/ProtocolErrorCode"

export const SYNC_PROTOCOL_VERSION = 3

export const SYNC_PROTOCOL_PATHS = {
  server: "/v1/server",
  claim: "/v1/claim",
  enrollRequest: "/v1/enroll/request",
  enrollStatus: "/v1/enroll/status",
  enrollConsole: "/v1/enroll/console",
  enrollPending: "/v1/enroll/pending",
  enrollApprove: "/v1/enroll/approve",
  enrollDeny: "/v1/enroll/deny",
  enrollWindowOpen: "/v1/enroll/window/open",
  enrollWindowClose: "/v1/enroll/window/close",
  devices: "/v1/devices",
  deviceRevoke: "/v1/devices/revoke",
  revision: "/v1/revision",
  snapshot: "/v1/snapshot",
  assets: "/v1/assets",
  assetItem: "/v1/assets/",
} as const

export type ProtocolOk<T> = {ok: true; data: T}
export type ProtocolFail = {ok: false; error: {code: ProtocolErrorCode; message: string}}
export type ProtocolResponse<T> = ProtocolOk<T> | ProtocolFail

export type ServerInfo = {protocol: number; serverId: string; name: string; claimed: boolean}

export type DeviceRole = "parent" | "child"

export type DeviceIdentity = {id: string; name: string; createdAt: string}
export type IssuedCredential = {device: DeviceIdentity; token: string}

export type ClaimBody = {code: string; deviceName: string}
export type ClaimResponse = IssuedCredential

export type EnrollRequestBody = {deviceName: string}
export type EnrollRequestResponse = {requestId: string; code: string; pollToken: string; expiresAt: string}

export type EnrollmentStatus =
  | {state: "pending"}
  | {state: "approved"; device: DeviceIdentity; token: string; approvedBy: string | null}
  | {state: "denied"}
  | {state: "expired"}

export type RequestOrigin = {address: string; isPrivate: boolean}

export type PendingEnrollment = {
  requestId: string
  code: string
  deviceName: string
  requestedAt: string
  expiresAt: string
  requestedFrom: RequestOrigin | null
}
export type PendingEnrollmentResponse = {request: PendingEnrollment | null}

export type ApproveEnrollmentBody = {requestId: string; code: string}
export type DenyEnrollmentBody = {requestId: string}

export type EnrollmentWindow = {expiresAt: string}

export type DeviceSummary = {
  id: string
  name: string
  role: DeviceRole
  createdAt: string
  lastSeenAt: string | null
  revokedAt: string | null
}
export type DeviceListResponse = {devices: DeviceSummary[]; enrollmentWindow: EnrollmentWindow | null}
export type RevokeDeviceBody = {deviceId: string}

export type ConsoleEnrollBody = {token: string; deviceName: string}
export type ConsoleEnrollResponse = IssuedCredential

/** `snapshot` carries a Daily snapshot document; `src/shared` cannot name its type, so it crosses the wire as `unknown`. */
export type SnapshotReadResponse = {snapshot: unknown; revision: string | null}
export type SnapshotWriteBody = {snapshot: unknown; expectedRevision: string | null}
export type SnapshotWriteResponse = {revision: string}
export type RevisionProbe = {revision: string | null; pendingEnrollment: boolean; protocol: number; role: DeviceRole}

export type AssetEntry = {name: string; size: number; sha256: string; uploadedAt: string}
export type AssetManifestResponse = {assets: AssetEntry[]}
export type AssetUploadResponse = AssetEntry
