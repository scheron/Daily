import {existsSync} from "node:fs"
import {readFile, rm} from "node:fs/promises"

import {logger} from "@/utils/logger"

import {fsPaths} from "@/config"
import {removeManagedUpdateFiles} from "./removeManagedUpdateFiles"

import type {InstalledAppReleaseState, Settings} from "@shared/types/storage"

export async function applyPendingInstallResult(saveUpdatesPatch: (patch: Partial<Settings["updates"]>) => Promise<void>) {
  const markerPath = fsPaths.updatesInstallResultPath()
  if (!existsSync(markerPath)) return

  try {
    const content = await readFile(markerPath, "utf8")
    const installedRelease = JSON.parse(content) as InstalledAppReleaseState
    await saveUpdatesPatch({
      cached: null,
      installed: installedRelease,
      skippedReleaseId: null,
    })
    await removeManagedUpdateFiles()
  } catch (error) {
    logger.error(logger.CONTEXT.UPDATES, "Failed to apply pending install marker", error)
  } finally {
    await rm(markerPath, {force: true})
  }
}
