import fs from "node:fs"

import {logger} from "@/utils/logger"

import type {IStorageController} from "@/types/storage"

/** Watches the CLI mutation-marker file; on change, asks storage to refresh (rebuild index + broadcast). Returns a stop function. */
export function setupCliSignalWatcher(getStorage: () => IStorageController | null, signalPath: string): () => void {
  try {
    if (!fs.existsSync(signalPath)) fs.writeFileSync(signalPath, "0")
  } catch (err) {
    logger.error(logger.CONTEXT.STORAGE, "Failed to prepare CLI signal file", err)
    return () => {}
  }

  let timer: NodeJS.Timeout | null = null
  const watcher = fs.watch(signalPath, () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      getStorage()
        ?.handleExternalDataChange()
        .catch((err) => logger.error(logger.CONTEXT.STORAGE, "External change refresh failed", err))
    }, 150)
  })

  return () => {
    if (timer) clearTimeout(timer)
    watcher.close()
  }
}
