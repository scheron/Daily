import type {AppUpdateSource, ISODateTime} from "@daily/protocol"
import type {UpdateInstallFailureCode} from "@shared/errors/updates/UpdateInstallFailureCode"

export type GitHubReleaseMeta = {
  source: "github"
  version: string
  hash: string | null
  releaseId: string
  assetName: string
  assetUrl: string
}

export type ReleaseMeta = GitHubReleaseMeta

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
