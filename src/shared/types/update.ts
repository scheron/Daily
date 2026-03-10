import type {ISODateTime} from "./common"

export type AppUpdateSource = "brew" | "github"
export type AppUpdateStatus = "idle" | "checking" | "available" | "downloading" | "downloaded" | "installing" | "error" | "unavailable"

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
}
