import {createWriteStream} from "node:fs"
import {rename, unlink} from "node:fs/promises"
import {Readable} from "node:stream"
import {pipeline} from "node:stream/promises"

import {logger} from "@/utils/logger"

type DownloadParams = {
  url: string
  destPath: string
  onProgress: (downloadedBytes: number, totalBytes: number) => void
  signal?: AbortSignal
}

/**
 * Download a file with progress reporting and abort support.
 * Writes to a temp file first, then atomically renames on completion.
 */
export async function downloadWithProgress(params: DownloadParams): Promise<void> {
  const {url, destPath, onProgress, signal} = params
  const tempPath = `${destPath}.download`

  logger.info(logger.CONTEXT.AI, "Starting download", {url, destPath})

  try {
    const response = await fetch(url, {
      signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Daily-App/1.0",
      },
    })

    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`)
    if (!response.body) throw new Error("Download failed: no response body")

    const totalBytes = Number(response.headers.get("content-length") ?? 0)
    let downloadedBytes = 0

    const nodeStream = Readable.fromWeb(response.body as any)

    const progressStream = new Readable({
      objectMode: false,
      read() {},
    })

    nodeStream.on("data", (chunk: Buffer) => {
      downloadedBytes += chunk.length
      onProgress(downloadedBytes, totalBytes)
      progressStream.push(chunk)
    })

    nodeStream.on("end", () => {
      progressStream.push(null)
    })

    nodeStream.on("error", (err) => {
      progressStream.destroy(err)
    })

    const writeStream = createWriteStream(tempPath)
    await pipeline(progressStream, writeStream)

    await rename(tempPath, destPath)

    logger.info(logger.CONTEXT.AI, "Download completed", {destPath, totalBytes: downloadedBytes})
  } catch (err) {
    try {
      await unlink(tempPath)
    } catch {
      // ignore
    }
    throw err
  }
}
