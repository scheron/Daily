import {createHash} from "node:crypto"
import {createReadStream} from "node:fs"
import {lstat} from "node:fs/promises"
import path from "node:path"

import {electronPaths} from "@main/config/electronPaths"

import type {AppUpdateCacheState} from "@daily/protocol"
import type {ReleaseMeta} from "../types"

export function releaseDmgPath(release: ReleaseMeta): string {
  return path.join(electronPaths.updatesReleasesPath(), release.releaseId.replace(":", "_"), release.assetName)
}

export async function isManagedDmgPath(filePath: string): Promise<boolean> {
  const root = electronPaths.updatesReleasesPath()
  const relative = path.relative(root, filePath)
  const segments = relative.split(path.sep)
  if (path.isAbsolute(relative) || segments.length !== 2 || segments[0] === "..") return false

  for (const entry of [path.dirname(root), root, path.join(root, segments[0]), path.join(root, relative)]) {
    try {
      const stat = await lstat(entry)
      if (entry === path.join(root, relative) ? !stat.isFile() : !stat.isDirectory()) return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return true
      throw error
    }
  }

  return true
}

export async function findCachedRelease(release: ReleaseMeta, legacyCache?: AppUpdateCacheState | null): Promise<AppUpdateCacheState | null> {
  const cachePath = legacyCache ? legacyCachePath(release, legacyCache) : releaseDmgPath(release)

  if (!cachePath || !(await isManagedDmgPath(cachePath))) return null

  try {
    const stats = await lstat(cachePath)
    if (!stats.isFile()) return null
    return {
      releaseId: release.releaseId,
      version: release.version,
      hash: release.hash,
      source: release.source,
      cachePath,
      downloadedAt: stats.mtime.toISOString(),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

export async function cachedDmgMatches(cachePath: string, expectedHash: string): Promise<boolean> {
  if (!(await isManagedDmgPath(cachePath))) return false
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(cachePath)) hash.update(chunk)
  return hash.digest("hex") === expectedHash
}

function legacyCachePath(release: ReleaseMeta, cached: AppUpdateCacheState): string | null {
  if (cached.version !== release.version || cached.source !== release.source || (cached.hash && cached.hash !== release.hash)) return null

  const prefix = `${release.version}:asset-`
  if (!cached.releaseId.startsWith(prefix) || !/^\d+$/.test(cached.releaseId.slice(prefix.length))) return null

  const expectedPath = path.join(electronPaths.updatesReleasesPath(), cached.releaseId.replace(":", "_"), release.assetName)
  return cached.cachePath === expectedPath ? expectedPath : null
}
