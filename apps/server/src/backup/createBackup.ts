import path from "node:path"
import fs from "fs-extra"
import {nanoid} from "nanoid"

import {assetsDir} from "../assets/AssetStore"

import type {ServerStore} from "../store/instance"

const BACKUP_PREFIX = "backup-"
const STAGING_PREFIX = ".tmp-"
const MAX_NAME_ATTEMPTS = 50

/** Whether `name` is a finished backup this module wrote, as opposed to staging left by a crash. */
export function isBackupName(name: string): boolean {
  return name.startsWith(BACKUP_PREFIX)
}

/**
 * Writes one point-in-time backup under `backupDir` and returns its path. Runs against the live
 * database: SQLite's online backup copies a consistent snapshot without stopping the server, so
 * nothing here interrupts serving.
 *
 * Assets are hard-linked rather than copied. `writeAsset` replaces an asset by renaming over its
 * name, which swaps the directory entry and leaves the old inode alone — so a link taken now keeps
 * resolving to the bytes that were current now, even if the name is overwritten later. Each backup
 * therefore costs one directory entry per asset instead of a second copy of the bytes. A backup
 * directory on another filesystem cannot be linked into, and falls back to copying.
 *
 * The database is snapshotted before the assets are linked, deliberately. An asset that arrives
 * mid-backup is then linked without being in the snapshot's index — a harmless orphan file. The
 * other order would put an asset in the index whose blob was never linked, which is a dangling
 * reference and breaks the download.
 *
 * The whole backup is assembled under a `.tmp-` name and renamed into place at the end, so an
 * interrupted run leaves staging behind rather than a directory that looks like a usable backup.
 */
export async function createBackup(store: ServerStore, backupDir: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const target = path.join(backupDir, `${BACKUP_PREFIX}${stamp}`)
  const staging = path.join(backupDir, `${STAGING_PREFIX}${nanoid()}`)

  await fs.ensureDir(staging)

  try {
    await store.db.backup(path.join(staging, "server.sqlite"))
    await linkAssets(store, path.join(staging, "assets"))

    return await moveIntoPlace(staging, target)
  } catch (err) {
    await fs.remove(staging).catch(() => {})
    throw err
  }
}

/** Removes staging directories a previous crash left in `backupDir`. */
export async function sweepPartialBackups(backupDir: string): Promise<void> {
  if (!(await fs.pathExists(backupDir))) return

  for (const entry of await fs.readdir(backupDir)) {
    if (entry.startsWith(STAGING_PREFIX)) await fs.remove(path.join(backupDir, entry)).catch(() => {})
  }
}

/**
 * Renames staging to `target`, adding a numeric suffix while that name is taken. The name is a
 * millisecond timestamp, so two backups in the same millisecond would otherwise land on it — and
 * renaming a directory onto a non-empty one fails rather than merging. A suffix still sorts after
 * the name it disambiguates, so age order survives.
 */
async function moveIntoPlace(staging: string, target: string): Promise<string> {
  for (let attempt = 0; attempt <= MAX_NAME_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? target : `${target}-${attempt}`

    try {
      await fs.rename(staging, candidate)
      return candidate
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== "ENOTEMPTY" && code !== "EEXIST") throw err
    }
  }

  throw new Error(`Could not find a free backup name beside ${target}`)
}

async function linkAssets(store: ServerStore, destDir: string): Promise<void> {
  const source = assetsDir(store)
  await fs.ensureDir(destDir)

  if (!(await fs.pathExists(source))) return

  for (const entry of await fs.readdir(source)) {
    if (entry.startsWith(STAGING_PREFIX)) continue

    await linkOrCopy(path.join(source, entry), path.join(destDir, entry))
  }
}

async function linkOrCopy(from: string, to: string): Promise<void> {
  try {
    await fs.link(from, to)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code

    if (code === "ENOENT") return
    if (code !== "EXDEV" && code !== "EPERM" && code !== "EMLINK") throw err

    await fs.copy(from, to).catch((copyErr: unknown) => {
      if ((copyErr as NodeJS.ErrnoException).code !== "ENOENT") throw copyErr
    })
  }
}
