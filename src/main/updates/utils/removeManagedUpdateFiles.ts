import {rm} from "node:fs/promises"

import {logger} from "@/utils/logger"

import {electronPaths} from "@/runtime/electronPaths"

export async function removeManagedUpdateFiles() {
  try {
    await rm(electronPaths.updatesReleasesPath(), {recursive: true, force: true})
  } catch (error) {
    logger.error(logger.CONTEXT.UPDATES, "Failed to remove managed update files", error)
  }
}
