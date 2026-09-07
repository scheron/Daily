import path from "node:path"
import fs from "fs-extra"

import {isBackupName} from "./createBackup"

/** Every finished backup in `backupDir`, oldest first. The names are timestamps, so sorting them sorts by age. */
export async function listBackups(backupDir: string): Promise<string[]> {
  if (!(await fs.pathExists(backupDir))) return []

  return (await fs.readdir(backupDir)).filter(isBackupName).sort()
}

/**
 * Removes the oldest backups until at most `keep` remain, and returns the names it removed.
 * Only names this module wrote are considered, so anything else an operator parked in the
 * directory is left alone.
 */
export async function pruneBackups(backupDir: string, keep: number): Promise<string[]> {
  const names = await listBackups(backupDir)
  const doomed = names.slice(0, Math.max(0, names.length - keep))

  for (const name of doomed) await fs.remove(path.join(backupDir, name))

  return doomed
}
