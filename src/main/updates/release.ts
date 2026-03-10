import {createHash} from "node:crypto"
import {createReadStream, existsSync} from "node:fs"
import {mkdir, rm} from "node:fs/promises"
import path from "node:path"

import {downloadWithProgress} from "@/utils/files/downloadWithProgress"
import {logger} from "@/utils/logger"

import {APP_CONFIG, fsPaths} from "@/config"
import {parseGitHubReleaseMeta} from "./utils/parseGitHubReleaseMeta"
import {runCommand} from "./utils/runCommand"

import type {AppUpdateCacheState} from "@shared/types/storage"
import type {ReleaseMeta} from "../types/updates"

let resolvedBrewBinary: string | null = null

export async function resolveLatestRelease(): Promise<ReleaseMeta> {
  const githubRelease = await getGitHubReleaseMeta()
  if (!githubRelease) throw new Error("Failed to read GitHub release metadata.")

  const brewBinary = await resolveBrewBinary()
  if (brewBinary && (await isCaskInstalled(brewBinary))) {
    return {
      source: "brew",
      brewBinary,
      version: githubRelease.version,
      hash: githubRelease.hash,
      releaseId: githubRelease.releaseId,
    }
  }

  return githubRelease
}

export async function downloadRelease(release: ReleaseMeta, onProgress: (progress: number | null) => void): Promise<AppUpdateCacheState> {
  logger.info(logger.CONTEXT.UPDATES, `Downloading update ${release.version} via ${release.source}`)

  if (release.source === "brew") {
    const result = await runCommand(release.brewBinary, ["fetch", "--cask", APP_CONFIG.updates.brewCask], APP_CONFIG.updates.brewTimeoutMs)
    if (result.code !== 0) {
      logger.error(logger.CONTEXT.UPDATES, "brew fetch failed", {stdout: result.stdout, stderr: result.stderr})
      throw new Error("Failed to download the Homebrew update.")
    }

    const cachePath = await getBrewCachePath(release.brewBinary)

    return {
      releaseId: release.releaseId,
      version: release.version,
      hash: release.hash,
      source: "brew",
      cachePath,
      downloadedAt: new Date().toISOString(),
    }
  }

  const releaseDir = path.join(fsPaths.updatesReleasesPath(), release.releaseId.replace(/[^a-zA-Z0-9._-]/g, "_"))
  const destinationPath = path.join(releaseDir, release.assetName)
  await mkdir(releaseDir, {recursive: true})

  await downloadWithProgress({
    url: release.assetUrl,
    destPath: destinationPath,
    onProgress: (downloadedBytes, totalBytes) => {
      const progress = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : null
      onProgress(progress)
    },
  })

  const downloadedHash = await computeFileSha256(destinationPath)
  if (release.hash && release.hash !== downloadedHash) {
    await rm(releaseDir, {recursive: true, force: true})
    throw new Error("Downloaded update hash does not match the expected release hash.")
  }

  return {
    releaseId: release.releaseId,
    version: release.version,
    hash: release.hash ?? downloadedHash,
    source: "github",
    cachePath: destinationPath,
    downloadedAt: new Date().toISOString(),
  }
}

export async function resolveBrewBinary(): Promise<string | null> {
  if (resolvedBrewBinary) return resolvedBrewBinary

  const candidates = [
    process.env.HOMEBREW_PREFIX ? path.join(process.env.HOMEBREW_PREFIX, "bin", "brew") : null,
    "/opt/homebrew/bin/brew",
    "/usr/local/bin/brew",
    "brew",
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (candidate !== "brew" && !existsSync(candidate)) continue

    const check = await runCommand(candidate, ["--version"], 15_000)
    if (check.code === 0) {
      resolvedBrewBinary = candidate
      return candidate
    }
  }

  return null
}

async function isCaskInstalled(brewBinary: string): Promise<boolean> {
  const result = await runCommand(brewBinary, ["list", "--cask", APP_CONFIG.updates.brewCask], 20_000)
  return result.code === 0
}

async function getGitHubReleaseMeta(): Promise<ReleaseMeta | null> {
  const response = await fetch(`https://api.github.com/repos/${APP_CONFIG.updates.githubRepo}/releases/latest`, {
    headers: APP_CONFIG.updates.githubHeaders,
  })

  if (!response.ok) {
    throw new Error(`GitHub releases API returned ${response.status} ${response.statusText}.`)
  }

  return parseGitHubReleaseMeta((await response.json()) as Parameters<typeof parseGitHubReleaseMeta>[0])
}

async function getBrewCachePath(brewBinary: string): Promise<string | null> {
  const result = await runCommand(brewBinary, ["--cache", "--cask", APP_CONFIG.updates.brewCask], 15_000)
  if (result.code !== 0) return null

  const cachePath = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)

  if (!cachePath) return null
  return existsSync(cachePath) ? cachePath : null
}

async function computeFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256")
  const stream = createReadStream(filePath)

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  return hash.digest("hex")
}
