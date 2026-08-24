import {execFile as execFileCb} from "child_process"
import path from "path"
import {promisify} from "util"
import fs from "fs-extra"

import {notNull, sleep} from "@daily/std"

import {logger} from "./logger"

const execFile = promisify(execFileCb)
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 15_000
const DEFAULT_DOWNLOAD_POLL_INTERVAL_MS = 250

let coordinatorBinaryPath = ""
let coordinatorAvailable: boolean | null = null

/** Points the module at the file-coordinator binary. The desktop calls this at startup; until it does, I/O stays uncoordinated. */
export function setFileCoordinatorBinaryPath(binaryPath: string): void {
  coordinatorBinaryPath = binaryPath
  coordinatorAvailable = null
}

export async function coordinatedRead(filePath: string): Promise<Buffer | null> {
  if (await checkAvailability()) {
    try {
      const {stdout} = await execFile(coordinatorBinaryPath, ["read", filePath], {
        encoding: "buffer",
        maxBuffer: 50 * 1024 * 1024,
      })
      return stdout as unknown as Buffer
    } catch (err: any) {
      if (err.code === "ENOENT" || err.stderr?.includes("no such file")) return null
      logger.warn(logger.CONTEXT.SYNC_REMOTE, "Coordinated read failed, falling back to fs.readFile", err)
    }
  }

  try {
    return await fs.readFile(filePath)
  } catch (err: any) {
    if (err.code === "ENOENT") return null
    throw err
  }
}

export async function coordinatedWrite(filePath: string, data: Buffer): Promise<void> {
  if (await checkAvailability()) {
    try {
      const child = require("child_process").spawn(coordinatorBinaryPath, ["write", filePath])
      await new Promise<void>((resolve, reject) => {
        child.stdin.end(data)
        child.on("close", (code: number) => {
          if (code === 0) resolve()
          else reject(new Error(`file-coordinator write exited with code ${code}`))
        })
        child.on("error", reject)
      })
      return
    } catch (err) {
      logger.warn(logger.CONTEXT.SYNC_REMOTE, "Coordinated write failed, falling back to fs write", err)
    }
  }

  const tmpPath = `${filePath}.tmp`
  await fs.writeFile(tmpPath, data)
  await fs.rename(tmpPath, filePath)
}

export function getICloudStubPath(filePath: string): string {
  const dirname = path.dirname(filePath)
  const basename = path.basename(filePath)
  return path.join(dirname, `.${basename}.icloud`)
}

export async function hasICloudStub(filePath: string): Promise<boolean> {
  return fs.pathExists(getICloudStubPath(filePath))
}

export async function requestDownload(filePath: string): Promise<void> {
  if (await checkAvailability()) {
    try {
      await execFile(coordinatorBinaryPath, ["download", filePath], {timeout: 30000})
    } catch (err) {
      logger.warn(logger.CONTEXT.SYNC_REMOTE, "Download request failed", err)
    }
  }
}

export async function requestDownloadAndWait(
  filePath: string,
  options: {
    timeoutMs?: number
    pollIntervalMs?: number
  } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_DOWNLOAD_POLL_INTERVAL_MS
  const deadline = Date.now() + timeoutMs

  await requestDownload(filePath)

  while (Date.now() < deadline) {
    const [fileExists, hasStub] = await Promise.all([fs.pathExists(filePath), hasICloudStub(filePath)])

    if (fileExists && !hasStub) {
      return true
    }

    await sleep(pollIntervalMs)
  }

  const [fileExists, hasStub] = await Promise.all([fs.pathExists(filePath), hasICloudStub(filePath)])
  return fileExists && !hasStub
}

async function checkAvailability(): Promise<boolean> {
  if (notNull(coordinatorAvailable)) return coordinatorAvailable
  try {
    await fs.access(coordinatorBinaryPath, fs.constants.X_OK)
    coordinatorAvailable = true
  } catch {
    logger.warn(logger.CONTEXT.SYNC_REMOTE, "File coordinator binary not found, using uncoordinated I/O")
    coordinatorAvailable = false
  }
  return coordinatorAvailable
}
