import path from "node:path"
import fs from "fs-extra"

import {createBackup, sweepPartialBackups} from "./createBackup"
import {listBackups, pruneBackups} from "./pruneBackups"

import type {ServerBackupConfig} from "../config/resolveServerConfig"
import type {ServerStore} from "../store/instance"

/**
 * Starts the backup schedule and returns the function that stops it.
 *
 * The timer is unref'd, so a pending backup never holds the process open on its own. One backup
 * is taken at startup when the newest on disk is already older than the interval, which is what
 * keeps a server that restarts more often than it backs up from never backing up at all — and
 * equally keeps a restart loop from writing a backup per restart.
 *
 * A failed run is logged and dropped: the next tick tries again, and a backup that cannot be
 * written is never a reason to take sync down.
 */
export function scheduleBackups(store: ServerStore, backup: ServerBackupConfig): () => void {
  const timer = setInterval(() => void runOnce(store, backup), backup.intervalMs)
  timer.unref()

  void sweepPartialBackups(backup.dir)
    .then(() => catchUp(store, backup))
    .catch((error: unknown) => console.error(`Backup failed: ${message(error)}`))

  return () => clearInterval(timer)
}

async function catchUp(store: ServerStore, backup: ServerBackupConfig): Promise<void> {
  const names = await listBackups(backup.dir)
  const newest = names.at(-1)

  if (newest) {
    const stat = await fs.stat(path.join(backup.dir, newest)).catch(() => null)
    if (stat && Date.now() - stat.mtimeMs < backup.intervalMs) return
  }

  await runOnce(store, backup)
}

async function runOnce(store: ServerStore, backup: ServerBackupConfig): Promise<void> {
  try {
    const written = await createBackup(store, backup.dir)
    const removed = await pruneBackups(backup.dir, backup.keep)

    console.log(`Backup written: ${written}${removed.length > 0 ? ` — ${removed.length} older removed` : ""}`)
  } catch (error: unknown) {
    console.error(`Backup failed: ${message(error)}`)
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
