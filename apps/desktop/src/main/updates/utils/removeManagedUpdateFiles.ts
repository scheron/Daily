import {rm} from "node:fs/promises"

import {logger} from "@daily/core"

import {electronPaths} from "../../runtime/electronPaths"

export async function removeManagedUpdateFiles() {
  try {
    await rm(electronPaths.updatesReleasesPath(), {recursive: true, force: true})
  } catch (error) {
    logger.error(logger.CONTEXT.UPDATES, "Failed to remove managed update files", error)
  }
}
