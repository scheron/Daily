import type {AppUpdateSource, ISODateTime} from "@daily/protocol"
import type {UpdateInstallFailureCode} from "@shared/errors/updates/UpdateInstallFailureCode"

export type ReleaseMeta = {
  tag: string
  source: "github"
  version: string
  hash: string
  releaseId: string
  assetName: string
  assetUrl: string
}

/**
 * The fact the installer script leaves behind when it could not complete the
 * swap. Written to `updatesInstallFailurePath()` and read on the next launch.
 */
export type PendingInstallFailure = {
  releaseId: string
  version: string
  source: AppUpdateSource
  attemptedAt: ISODateTime
  code: UpdateInstallFailureCode
}
