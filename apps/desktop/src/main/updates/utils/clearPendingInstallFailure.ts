import {rm} from "node:fs/promises"

import {logger} from "@daily/core"

import {electronPaths} from "@main/runtime/electronPaths"

export async function clearPendingInstallFailure(): Promise<void> {
  try {
    await rm(electronPaths.updatesInstallFailurePath(), {force: true})
  } catch (error) {
    logger.error(logger.CONTEXT.UPDATES, "Failed to clear pending install failure marker", error)
  }
}
