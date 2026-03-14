import {execFile as execFileCb} from "child_process"
import path from "path"
import {promisify} from "util"
import {app} from "electron"
import fs from "fs-extra"

import {logger} from "@/utils/logger"

const execFile = promisify(execFileCb)

let coordinatorPath: string | null = null
let coordinatorAvailable: boolean | null = null

function getCoordinatorPath(): string {
  if (coordinatorPath) return coordinatorPath
  coordinatorPath = app.isPackaged ? path.join(process.resourcesPath, "file-coordinator") : path.join(process.cwd(), "resources", "file-coordinator")
  return coordinatorPath
}

async function checkAvailability(): Promise<boolean> {
  if (coordinatorAvailable !== null) return coordinatorAvailable
  try {
    await fs.access(getCoordinatorPath(), fs.constants.X_OK)
    coordinatorAvailable = true
  } catch {
    logger.warn(logger.CONTEXT.SYNC_REMOTE, "File coordinator binary not found, using uncoordinated I/O")
    coordinatorAvailable = false
  }
  return coordinatorAvailable
}

export async function coordinatedRead(filePath: string): Promise<Buffer | null> {
  if (await checkAvailability()) {
    try {
      const {stdout} = await execFile(getCoordinatorPath(), ["read", filePath], {
        encoding: "buffer",
        maxBuffer: 50 * 1024 * 1024,
      })
      return stdout as unknown as Buffer
    } catch (err: any) {
      if (err.code === "ENOENT" || err.stderr?.includes("no such file")) return null
      logger.warn(logger.CONTEXT.SYNC_REMOTE, "Coordinated read failed, falling back to fs.readFile", err)
    }
  }

  // Fallback
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
      const child = require("child_process").spawn(getCoordinatorPath(), ["write", filePath])
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

  // Fallback: atomic write via temp+rename
  const tmpPath = `${filePath}.tmp`
  await fs.writeFile(tmpPath, data)
  await fs.rename(tmpPath, filePath)
}

export function isICloudStub(filePath: string): boolean {
  const basename = path.basename(filePath)
  return basename.startsWith(".") && basename.endsWith(".icloud")
}

export async function requestDownload(filePath: string): Promise<void> {
  if (await checkAvailability()) {
    try {
      await execFile(getCoordinatorPath(), ["download", filePath], {timeout: 30000})
    } catch (err) {
      logger.warn(logger.CONTEXT.SYNC_REMOTE, "Download request failed", err)
    }
  }
}
