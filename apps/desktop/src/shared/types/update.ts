import type {AppUpdateSource, ISODateTime} from "@daily/protocol"
import type {UpdateInstallFailureCode} from "@shared/errors/updates/UpdateInstallFailureCode"

export type AppUpdateStatus = "idle" | "checking" | "available" | "downloading" | "downloaded" | "installing" | "error" | "unavailable"

/** The last install attempt that did not complete, as the renderer sees it. */
export type AppUpdateInstallFailure = {
  version: string
  attemptedAt: ISODateTime
  code: UpdateInstallFailureCode
}

export type AppUpdateState = {
  status: AppUpdateStatus
  currentVersion: string
  availableVersion: string | null
  availableHash: string | null
  source: AppUpdateSource | null
  downloadProgress: number | null
  downloadedAt: ISODateTime | null
  checkedAt: ISODateTime | null
  reason: string | null
  installFailure: AppUpdateInstallFailure | null
}
