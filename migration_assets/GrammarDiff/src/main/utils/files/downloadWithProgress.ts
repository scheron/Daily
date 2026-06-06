import {createHash} from "node:crypto"
import {createReadStream, createWriteStream} from "node:fs"
import {rename, stat, unlink} from "node:fs/promises"
import {Readable, Transform} from "node:stream"
import {pipeline} from "node:stream/promises"

import {logger} from "@/utils/logger"

import type {DownloadPhase} from "@shared/types/ai"

type DownloadParams = {
  url: string
  destPath: string
  onProgress: (downloadedBytes: number, totalBytes: number, phase: DownloadPhase) => void
  sha256?: string
  signal?: AbortSignal
}

const USER_AGENT = "GrammarDiff/0.0.1"

async function fileSize(p: string): Promise<number> {
  try {
    return (await stat(p)).size
  } catch {
    return 0
  }
}

async function hashFile(p: string): Promise<string> {
  const hash = createHash("sha256")
  await pipeline(createReadStream(p), hash)
  return hash.digest("hex")
}

/**
 * Stream a remote file to `destPath`, resuming from `${destPath}.download` when present and
 * verifying sha256 when provided. The partial is kept on interruption (so a later call resumes)
 * and removed only on checksum mismatch or a 416. Success renames the partial onto `destPath`.
 */
export async function downloadWithProgress(params: DownloadParams): Promise<void> {
  const {url, destPath, onProgress, sha256, signal} = params
  const tempPath = `${destPath}.download`

  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError")

  let resumeFrom = await fileSize(tempPath)
  logger.info(logger.CONTEXT.AI, "Starting download", {url, destPath, resumeFrom})

  const headers: Record<string, string> = {"User-Agent": USER_AGENT}
  if (resumeFrom > 0) headers.Range = `bytes=${resumeFrom}-`

  let response = await fetch(url, {signal, redirect: "follow", headers})

  if (response.status === 416) {
    await unlink(tempPath).catch(() => {})
    resumeFrom = 0
    response = await fetch(url, {signal, redirect: "follow", headers: {"User-Agent": USER_AGENT}})
  }

  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`)
  if (!response.body) throw new Error("Download failed: no response body")

  const resumed = response.status === 206 && resumeFrom > 0
  if (!resumed) resumeFrom = 0

  let totalBytes: number
  if (resumed) {
    const total = response.headers.get("content-range")?.split("/")[1]
    totalBytes = total ? Number(total) : resumeFrom + Number(response.headers.get("content-length") ?? 0)
  } else {
    totalBytes = Number(response.headers.get("content-length") ?? 0)
  }

  let downloadedBytes = resumeFrom
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      downloadedBytes += chunk.length
      onProgress(downloadedBytes, totalBytes, "downloading")
      cb(null, chunk)
    },
  })

  const nodeStream = Readable.fromWeb(response.body as any)
  const writeStream = createWriteStream(tempPath, {flags: resumed ? "a" : "w"})
  await pipeline(nodeStream, counter, writeStream)

  if (sha256) {
    onProgress(downloadedBytes, totalBytes, "verifying")
    const actual = await hashFile(tempPath)
    if (actual !== sha256) {
      await unlink(tempPath).catch(() => {})
      throw new Error(`Checksum mismatch: expected ${sha256}, got ${actual}`)
    }
  }

  await rename(tempPath, destPath)
  logger.info(logger.CONTEXT.AI, "Download completed", {destPath, totalBytes: downloadedBytes})
}
