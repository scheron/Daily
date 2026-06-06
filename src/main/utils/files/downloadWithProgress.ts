import {createHash} from "node:crypto"
import {createReadStream, createWriteStream} from "node:fs"
import {rename, stat, unlink} from "node:fs/promises"
import {Readable, Transform} from "node:stream"
import {pipeline} from "node:stream/promises"

import {DownloadErrorCode} from "@shared/errors/download/DownloadErrorCode"
import {logger} from "@/utils/logger"

import type {DownloadPhase} from "@shared/types/ai"

const USER_AGENT = "Daily-App/1.0"

type DownloadParams = {
  url: string
  destPath: string
  onProgress: (downloadedBytes: number, totalBytes: number, phase: DownloadPhase) => void
  sha256?: string | null
  signal?: AbortSignal
}

export async function downloadWithProgress(params: DownloadParams): Promise<void> {
  const {url, destPath, onProgress, sha256, signal} = params
  const tempPath = `${destPath}.download`

  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError")

  let resumeFrom = await fileSize(tempPath)
  logger.info(logger.CONTEXT.AI, "Starting download", {url, destPath, resumeFrom})

  const headers: Record<string, string> = {"User-Agent": USER_AGENT}
  if (resumeFrom > 0) headers.Range = `bytes=${resumeFrom}-`

  logger.info(logger.CONTEXT.AI, "Download: fetching", {url, hasRange: Boolean(headers.Range)})
  let response = await fetch(url, {signal, redirect: "follow", headers})
  logger.info(logger.CONTEXT.AI, "Download: fetch returned", {
    status: response.status,
    statusText: response.statusText,
    contentLength: response.headers.get("content-length"),
    contentRange: response.headers.get("content-range"),
    contentType: response.headers.get("content-type"),
  })

  if (response.status === 416) {
    logger.info(logger.CONTEXT.AI, "Download: 416 fallback, refetching without Range")
    await unlink(tempPath).catch(() => {})
    resumeFrom = 0
    response = await fetch(url, {signal, redirect: "follow", headers: {"User-Agent": USER_AGENT}})
    logger.info(logger.CONTEXT.AI, "Download: fallback fetch returned", {status: response.status})
  }

  if (!response.ok) throw new Error(`${DownloadErrorCode.HttpFailed} ${response.status} ${response.statusText}`)
  if (!response.body) throw new Error(DownloadErrorCode.NoResponseBody)

  const resumed = response.status === 206 && resumeFrom > 0
  if (!resumed) resumeFrom = 0

  let totalBytes: number
  if (resumed) {
    const range = response.headers.get("content-range")?.split("/")[1]
    totalBytes = range ? Number(range) : resumeFrom + Number(response.headers.get("content-length") ?? 0)
  } else {
    totalBytes = Number(response.headers.get("content-length") ?? 0)
  }

  logger.info(logger.CONTEXT.AI, "Download: piping body to disk", {resumed, resumeFrom, totalBytes, tempPath})

  let downloadedBytes = resumeFrom
  let seenFirstChunk = false
  let lastLoggedAt = resumeFrom
  const PROGRESS_LOG_EVERY_BYTES = 50 * 1024 * 1024
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      downloadedBytes += chunk.length
      if (!seenFirstChunk) {
        seenFirstChunk = true
        logger.info(logger.CONTEXT.AI, "Download: first chunk received", {chunkSize: chunk.length, downloadedBytes})
      }
      if (downloadedBytes - lastLoggedAt >= PROGRESS_LOG_EVERY_BYTES) {
        lastLoggedAt = downloadedBytes
        const pct = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0
        logger.info(logger.CONTEXT.AI, "Download: progress", {downloadedBytes, totalBytes, pct})
      }
      onProgress(downloadedBytes, totalBytes, "downloading")
      cb(null, chunk)
    },
  })

  const nodeStream = Readable.fromWeb(response.body as any)
  const writeStream = createWriteStream(tempPath, {flags: resumed ? "a" : "w"})

  try {
    await pipeline(nodeStream, counter, writeStream)
  } catch (err) {
    logger.error(logger.CONTEXT.AI, "Download: pipeline failed", {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      downloadedBytes,
      totalBytes,
      seenFirstChunk,
    })
    throw err
  }

  logger.info(logger.CONTEXT.AI, "Download: body fully written", {downloadedBytes, totalBytes})

  if (sha256) {
    logger.info(logger.CONTEXT.AI, "Download: verifying sha256")
    onProgress(0, downloadedBytes, "verifying")
    let lastEmittedPct = -1
    const actual = await hashFile(tempPath, (bytesProcessed) => {
      // Throttle to one event per 1% so a 4GB hash produces ~100 ticks
      // instead of ~65k chunk events.
      const pct = downloadedBytes > 0 ? Math.floor((bytesProcessed / downloadedBytes) * 100) : 0
      if (pct === lastEmittedPct) return
      lastEmittedPct = pct
      onProgress(bytesProcessed, downloadedBytes, "verifying")
    })
    if (actual !== sha256) {
      await unlink(tempPath).catch(() => {})
      throw new Error(`${DownloadErrorCode.ChecksumMismatch}: expected ${sha256}, got ${actual}`)
    }
    logger.info(logger.CONTEXT.AI, "Download: sha256 verified")
  }

  await rename(tempPath, destPath)
  logger.info(logger.CONTEXT.AI, "Download completed", {destPath, totalBytes: downloadedBytes})
}

async function fileSize(p: string): Promise<number> {
  try {
    return (await stat(p)).size
  } catch {
    return 0
  }
}

async function hashFile(p: string, onChunk?: (bytesProcessed: number) => void): Promise<string> {
  const hash = createHash("sha256")
  const stream = createReadStream(p)
  let bytesProcessed = 0
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytesProcessed += chunk.length
      onChunk?.(bytesProcessed)
      cb(null, chunk)
    },
  })
  await pipeline(stream, counter, hash)
  return hash.digest("hex")
}
