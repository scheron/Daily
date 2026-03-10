import {rm} from "node:fs/promises"

import {logger} from "@/utils/logger"

import {fsPaths} from "@/config"

export async function removeManagedUpdateFiles() {
  try {
    await rm(fsPaths.updatesReleasesPath(), {recursive: true, force: true})
  } catch (error) {
    logger.error(logger.CONTEXT.UPDATES, "Failed to remove managed update files", error)
  }
}
