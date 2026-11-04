import {mkdir, readFile, rename, rm, writeFile} from "node:fs/promises"
import path from "node:path"

import {logger} from "@daily/core"

import {electronPaths} from "@main/config/electronPaths"
import {releaseFromManifest} from "./parseGitHubReleaseMeta"
import {parseReleaseManifest} from "./parseReleaseManifest"

import type {ReleaseMeta} from "../types"

export async function readConfirmedRelease(): Promise<ReleaseMeta | null> {
  try {
    const manifest = parseReleaseManifest(JSON.parse(await readFile(confirmedReleasePath(), "utf8")))
    return manifest ? releaseFromManifest(manifest) : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") logger.warn(logger.CONTEXT.UPDATES, "Failed to read confirmed release", error)
    return null
  }
}

export async function writeConfirmedRelease(release: ReleaseMeta): Promise<void> {
  const filename = confirmedReleasePath()
  const tempFile = `${filename}.tmp`
  await mkdir(path.dirname(filename), {recursive: true})
  const {tag, version, hash} = release
  await writeFile(tempFile, JSON.stringify({tag, version, sha256: hash}), {mode: 0o600})
  await rename(tempFile, filename)
}

export async function clearConfirmedRelease(): Promise<void> {
  await rm(confirmedReleasePath(), {force: true})
}

function confirmedReleasePath(): string {
  return path.join(electronPaths.updatesPath(), "confirmed-release.json")
}
