import {existsSync} from "node:fs"
import {readFile} from "node:fs/promises"

import {logger} from "@daily/core"

import {electronPaths} from "@main/runtime/electronPaths"

import type {PendingInstallFailure} from "@main/types/updates"

/**
 * Reads the marker the installer script leaves behind when it restored the
 * previous bundle instead of completing the swap. The marker outlives the
 * launch that reads it, so the fact survives until an update succeeds.
 */
export async function readPendingInstallFailure(): Promise<PendingInstallFailure | null> {
  const failurePath = electronPaths.updatesInstallFailurePath()
  if (!existsSync(failurePath)) return null

  try {
    const failure = JSON.parse(await readFile(failurePath, "utf8")) as PendingInstallFailure
    if (!failure?.releaseId || !failure.version || !failure.code) return null

    return failure
  } catch (error) {
    logger.error(logger.CONTEXT.UPDATES, "Failed to read pending install failure marker", error)
    return null
  }
}
