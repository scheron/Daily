import {execFile, spawn} from "node:child_process"
import {createHash} from "node:crypto"
import {createReadStream, createWriteStream} from "node:fs"
import {chmod, readdir, rename, unlink} from "node:fs/promises"
import {createServer} from "node:net"
import path from "node:path"
import {Readable} from "node:stream"
import {pipeline} from "node:stream/promises"
import {promisify} from "node:util"
import fs from "fs-extra"

import {AI_CONFIG} from "@shared/config/ai"
import {LlamaServerErrorCode} from "@shared/errors/ai/LlamaServerErrorCode"
import {ServerStartCancelledError} from "@shared/errors/ai/ServerStartCancelledError"
import {isString, notNull} from "@shared/utils/common/validators"
import {logger} from "@/utils/logger"

import {electronPaths} from "@/runtime/electronPaths"
import {buildLlamaArgs} from "./llamaArgs"
import {SERVER_BINARY} from "./manifest"

import type {LocalModelId, LocalRuntimeState} from "@shared/types/ai"
import type {ChildProcess} from "node:child_process"
import type {ModelManifestEntry} from "../types"

const execFileAsync = promisify(execFile)

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256")
  await pipeline(createReadStream(filePath), hash)
  return hash.digest("hex")
}

/**
 * Manages the llama-server subprocess.
 *
 * Handles binary download/extraction, spawning, health checks,
 * and graceful shutdown.
 */
export class LlamaServer {
  private process: ChildProcess | null = null
  private port: number | null = null
  private currentModelId: LocalModelId | null = null
  private state: LocalRuntimeState = {status: "not_installed"}
  private onStateChange: ((state: LocalRuntimeState) => void) | null = null
  /** Set by stop(); read by waitForReady() to distinguish cancel vs crash. */
  private stopRequested = false

  constructor(onStateChange?: (state: LocalRuntimeState) => void) {
    this.onStateChange = onStateChange ?? null
  }

  getState(): LocalRuntimeState {
    return this.state
  }

  getPort(): number | null {
    return this.port
  }

  getCurrentModelId(): LocalModelId | null {
    return this.currentModelId
  }

  isRunning(): boolean {
    return notNull(this.process) && this.state.status === "running"
  }

  async isBinaryInstalled(): Promise<boolean> {
    return fs.pathExists(this.getBinaryPath())
  }

  async ensureBinary(): Promise<void> {
    if (await this.isBinaryInstalled()) {
      if (await this.isCorrectVersion()) return

      logger.info(logger.CONTEXT.AI, "llama-server version mismatch, updating binary")
      try {
        await fs.remove(electronPaths.binPath())
      } catch {
        void 0
      }
    }

    const arch = process.arch as "arm64" | "x64"
    const binaryInfo = SERVER_BINARY.macos[arch]
    if (!binaryInfo) {
      throw new Error(`${LlamaServerErrorCode.UnsupportedArchitecture}: ${arch}`)
    }

    logger.info(logger.CONTEXT.AI, "Downloading llama-server binary", {arch})

    await fs.ensureDir(electronPaths.binPath())

    const archivePath = path.join(electronPaths.binPath(), "llama-server.tar.gz")

    const response = await fetch(binaryInfo.url, {redirect: "follow"})
    if (!response.ok || !response.body) {
      throw new Error(`${LlamaServerErrorCode.DownloadHttpFailed}: HTTP ${response.status}`)
    }

    const nodeStream = Readable.fromWeb(response.body as any)
    const writeStream = createWriteStream(archivePath)
    await pipeline(nodeStream, writeStream)

    const actualSha = await sha256File(archivePath)
    if (actualSha !== binaryInfo.sha256) {
      await unlink(archivePath).catch(() => {})
      throw new Error(`${LlamaServerErrorCode.ChecksumMismatch}: expected ${binaryInfo.sha256}, got ${actualSha}`)
    }

    const extractDir = path.join(electronPaths.binPath(), "_extract")
    await fs.ensureDir(extractDir)

    try {
      await execFileAsync("tar", ["-xzf", archivePath, "-C", extractDir])

      const {stdout} = await execFileAsync("find", [extractDir, "-name", "llama-server", "-type", "f"])
      const binarySource = stdout.trim().split("\n")[0]
      if (!binarySource) throw new Error(LlamaServerErrorCode.BinaryNotFound)

      const sourceDir = path.dirname(binarySource)
      const files = await readdir(sourceDir)
      for (const file of files) {
        await rename(path.join(sourceDir, file), path.join(electronPaths.binPath(), file))
      }
    } finally {
      try {
        await fs.remove(extractDir)
      } catch {
        void 0
      }
      try {
        await unlink(archivePath)
      } catch {
        void 0
      }
    }

    await chmod(this.getBinaryPath(), 0o755)
    try {
      await execFileAsync("xattr", ["-dr", "com.apple.quarantine", electronPaths.binPath()])
    } catch {
      void 0
    }
    try {
      await execFileAsync("xattr", ["-dr", "com.apple.provenance", electronPaths.binPath()])
    } catch {
      void 0
    }

    logger.info(logger.CONTEXT.AI, "llama-server binary installed")
  }

  async start(modelPath: string, modelId: LocalModelId, params: ModelManifestEntry["serverArgs"]): Promise<void> {
    if (this.process) {
      await this.stop()
    }

    this.stopRequested = false
    this.setState({status: "starting", modelId})

    try {
      this.port = await this.findFreePort()

      const args = buildLlamaArgs({
        modelPath,
        port: this.port,
        host: AI_CONFIG.runtime.local.host,
        params,
      })

      logger.info(logger.CONTEXT.AI, "Starting llama-server", {port: this.port, modelPath, args})

      this.process = spawn(this.getBinaryPath(), args, {
        stdio: ["ignore", "pipe", "pipe"],
      })

      this.currentModelId = modelId

      this.process.on("exit", (code, signal) => {
        logger.info(logger.CONTEXT.AI, "llama-server exited", {code, signal})
        this.process = null
        this.port = null
        if (this.state.status === "running" || this.state.status === "starting") {
          this.setState({status: "error", modelId, message: `Server exited unexpectedly (code: ${code})`})
        }
      })

      this.process.on("error", (err) => {
        logger.error(logger.CONTEXT.AI, "llama-server error", err)
        this.process = null
        this.port = null
        this.setState({status: "error", modelId, message: err.message})
      })

      this.process.stderr?.on("data", (data: Buffer) => {
        const text = data.toString().trim()
        if (!text) return
        const noisy = /^(slot|update_slots|kv cache rm|n_past|n_tokens|prompt eval|eval time|sample time|total time)/i.test(text)
        if (noisy) {
          logger.debug(logger.CONTEXT.AI, `llama-server stderr: ${text}`)
        } else {
          logger.info(logger.CONTEXT.AI, `llama-server stderr: ${text}`)
        }
      })

      await this.waitForReady()

      this.setState({
        status: "running",
        modelId,
        port: this.port,
        pid: this.process?.pid,
      })

      logger.info(logger.CONTEXT.AI, "llama-server is ready", {port: this.port, pid: this.process?.pid})
    } catch (err) {
      await this.stop()
      // stop() already transitions state to installed/not_installed. Only
      // surface an error state when the failure is unexpected (not a
      // user-initiated cancellation via stop()).
      if (!(err instanceof ServerStartCancelledError)) {
        this.setState({
          status: "error",
          modelId,
          message: err instanceof Error ? err.message : String(err),
        })
      }
      throw err
    }
  }

  async stop(): Promise<void> {
    this.stopRequested = true
    if (!this.process) return

    const proc = this.process
    this.process = null

    logger.info(logger.CONTEXT.AI, "Stopping llama-server")

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        try {
          proc.kill("SIGKILL")
        } catch {
          void 0
        }
        resolve()
      }, 5000)

      proc.on("exit", () => {
        clearTimeout(timeout)
        resolve()
      })

      try {
        proc.kill("SIGTERM")
      } catch {
        clearTimeout(timeout)
        resolve()
      }
    }).then(() => {
      this.port = null
      const modelId = this.currentModelId
      this.currentModelId = null
      if (modelId) {
        this.setState({status: "installed", modelId})
      } else {
        this.setState({status: "not_installed"})
      }
    })
  }

  private setState(state: LocalRuntimeState) {
    this.state = state
    this.onStateChange?.(state)
  }

  private getBinaryPath(): string {
    return path.join(electronPaths.binPath(), "llama-server")
  }

  private async isCorrectVersion(): Promise<boolean> {
    try {
      const {stdout, stderr} = await execFileAsync(this.getBinaryPath(), ["--version"])
      const output = stdout + stderr
      /* Version may appear on stderr; manifest is "b5200" while binary sometimes prints "5200". */
      const numericVersion = SERVER_BINARY.version.replace(/^b/, "")
      return output.includes(SERVER_BINARY.version) || output.includes(numericVersion)
    } catch {
      return false
    }
  }

  private async waitForReady(timeoutMs = 60000): Promise<void> {
    const startTime = Date.now()
    const pollInterval = 500

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`http://${AI_CONFIG.runtime.local.host}:${this.port}/health`, {
          signal: AbortSignal.timeout(2000),
        })

        if (response.ok) {
          const data = (await response.json()) as {status?: string}
          if (data.status === "ok" || data.status === "no slot available") {
            return
          }
        }
      } catch {
        void 0
      }

      if (!this.process) {
        if (this.stopRequested) throw new ServerStartCancelledError()
        throw new Error(LlamaServerErrorCode.ProcessExitedDuringStartup)
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    throw new Error(`${LlamaServerErrorCode.StartTimeout}: ${timeoutMs / 1000}s`)
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer()
      server.listen(0, AI_CONFIG.runtime.local.host, () => {
        const address = server.address()
        if (!address || isString(address)) {
          server.close()
          reject(new Error("Failed to find free port"))
          return
        }
        const port = address.port
        server.close(() => resolve(port))
      })
      server.on("error", reject)
    })
  }
}
