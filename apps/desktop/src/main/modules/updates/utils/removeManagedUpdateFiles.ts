import {lstat, readdir, rm} from "node:fs/promises"
import path from "node:path"

import {logger} from "@daily/core"

import {electronPaths} from "@main/config/electronPaths"

export async function removeManagedUpdateFiles(keepDirectories: readonly string[] = []) {
  try {
    const releasesDir = electronPaths.updatesReleasesPath()
    if (!(await lstat(electronPaths.updatesPath())).isDirectory() || !(await lstat(releasesDir)).isDirectory()) return

    if (!keepDirectories.length) {
      await rm(releasesDir, {recursive: true, force: true})
      return
    }

    const paths = (await readdir(releasesDir)).map((entry) => path.join(releasesDir, entry))
    await Promise.all(paths.filter((entry) => !keepDirectories.includes(entry)).map((entry) => rm(entry, {recursive: true, force: true})))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") logger.error(logger.CONTEXT.UPDATES, "Failed to remove managed update files", error)
  }
}
