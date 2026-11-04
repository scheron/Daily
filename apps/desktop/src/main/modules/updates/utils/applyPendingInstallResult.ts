import {existsSync} from "node:fs"
import {readFile, rm} from "node:fs/promises"

import {logger} from "@daily/core"

import {electronPaths} from "@main/config/electronPaths"
import {clearPendingInstallFailure} from "./clearPendingInstallFailure"
import {clearConfirmedRelease, readConfirmedRelease} from "./confirmedRelease"
import {removeManagedUpdateFiles} from "./removeManagedUpdateFiles"

export async function applyPendingInstallResult() {
  const markerPath = electronPaths.updatesInstallResultPath()
  if (!existsSync(markerPath)) return

  try {
    const result = JSON.parse(await readFile(markerPath, "utf8")) as {releaseId?: string} | null
    if (!result?.releaseId) return
    const confirmed = await readConfirmedRelease()
    if (confirmed?.releaseId === result.releaseId) await clearConfirmedRelease()
    await removeManagedUpdateFiles()
    await clearPendingInstallFailure()
  } catch (error) {
    logger.error(logger.CONTEXT.UPDATES, "Failed to apply pending install marker", error)
  } finally {
    await rm(markerPath, {force: true})
  }
}
